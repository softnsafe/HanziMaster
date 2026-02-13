
import { PracticeRecord, Lesson, Student, AssignmentStatus, StudentAssignment, StudentSummary, LoginLog, CalendarEvent, StoreItem } from '../types';

const STORAGE_KEY = 'hanzi_master_backend_url_v2';
const DEMO_KEY = 'hanzi_master_demo_mode';
const QUEUE_KEY = 'hanzi_offline_queue';
const ENV_URL = process.env.REACT_APP_BACKEND_URL || ''; 

// Caching Logic
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}
const CACHE_TTL = 5 * 60 * 1000;
const cache: Record<string, CacheEntry<any>> = {};

// Offline Queue
let offlineQueue: any[] = [];
try {
    const savedQ = localStorage.getItem(QUEUE_KEY);
    if (savedQ) offlineQueue = JSON.parse(savedQ);
} catch (e) { console.error("Failed to load offline queue", e); }

const getFromCache = <T>(key: string): T | null => {
    const entry = cache[key];
    if (entry && (Date.now() - entry.timestamp < CACHE_TTL)) {
        return entry.data;
    }
    return null;
};

const setCache = (key: string, data: any) => {
    cache[key] = { timestamp: Date.now(), data };
};

const invalidateCache = (keyPattern: string) => {
    Object.keys(cache).forEach(k => {
        if (k.includes(keyPattern)) delete cache[k];
    });
};

// --- URL Cleaning Helper ---
const cleanUrl = (url: string): string => {
    let clean = url.trim();
    if (!clean) return '';
    if (!clean.startsWith('http')) clean = 'https://' + clean;
    
    // Auto-fix common paste errors
    if (clean.includes('/edit')) clean = clean.split('/edit')[0] + '/exec';
    else if (clean.includes('/dev')) clean = clean.split('/dev')[0] + '/exec'; // Fix dev links (require auth) to exec (public)
    else if (clean.endsWith('/')) clean = clean.slice(0, -1);
    
    // Ensure it ends in /exec if it looks like a script url
    if (clean.includes('script.google.com') && !clean.endsWith('/exec')) {
        if (!clean.endsWith('/')) clean += '/exec';
        else clean += 'exec';
    }
    return clean;
};

// Helper: Fetch with Timeout to avoid hanging indefinitely
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e: any) {
        clearTimeout(id);
        if (e.name === 'AbortError') {
             throw new Error("Request timed out. Check internet connection.");
        }
        throw e;
    }
};

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error("No internet connection");
    }
    try {
        const response = await fetchWithTimeout(url, options);
        if (!response.ok) {
            if (response.status === 404) throw new Error("Script URL not found (404). Check deployment URL.");
            if (response.status === 403) throw new Error("Access denied (403). Permissions must be set to 'Anyone'.");
            if (response.status >= 500) throw new Error(`Server Error ${response.status}`);
        }
        return response;
    } catch (err: any) {
        // Handle CORS/Network failure specifically for Google Apps Script
        const msg = err.message || '';
        // Chrome says "Failed to fetch", Firefox says "NetworkError..."
        if (err.name === 'TypeError' && (msg === 'Failed to fetch' || msg.includes('NetworkError'))) {
             console.error("CORS/Network Error:", err);
             // We propagate this so checkConnection can catch it and do the probe
             throw new Error("Connection Blocked. Ensure Google Script is deployed as 'Web App' with access set to 'Anyone'.");
        }

        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw err;
    }
};

// Helper to safely parse JSON response, handling HTML error pages from Google
const parseResponse = async (response: Response) => {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        // Detect HTML error pages which indicate wrong URL or permissions
        if (text.trim().startsWith('<') || text.includes('<!DOCTYPE html>')) {
            if (text.includes('Sign in') || text.includes('Google Accounts')) {
                throw new Error("Access Denied: Script permission must be 'Anyone', not 'Anyone with Google Account'.");
            }
            throw new Error("Invalid Server Response (HTML). Check Backend URL.");
        }
        console.error("Invalid JSON response:", text.substring(0, 200));
        throw new Error("Invalid JSON from server.");
    }
};

export const sheetService = {
  getUrl(): string { 
      let url = localStorage.getItem(STORAGE_KEY) || ENV_URL; 
      url = cleanUrl(url); // Ensure we always read a clean URL
      return url;
  },
  
  isDemoMode(): boolean { return localStorage.getItem(DEMO_KEY) === 'true'; },
  
  setDemoMode(enabled: boolean) {
      if (enabled) localStorage.setItem(DEMO_KEY, 'true');
      else localStorage.removeItem(DEMO_KEY);
      this.clearAllCache();
  },

  saveUrl(url: string) {
    const clean = cleanUrl(url);
    localStorage.setItem(STORAGE_KEY, clean);
    this.setDemoMode(false); // Disable demo if setting a real URL
    this.clearAllCache();
  },

  clearAllCache() { Object.keys(cache).forEach(key => delete cache[key]); },

  // QUEUE MANAGEMENT
  async processQueue() {
      if (offlineQueue.length === 0 || this.isDemoMode()) return;
      const url = this.getUrl();
      if (!url) return;

      // Try sending the oldest item
      const item = offlineQueue[0];
      try {
          // We use standard fetch here to avoid infinite loops with our wrapper
          const response = await fetch(url, {
              method: 'POST',
              credentials: 'omit',
              redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify(item)
          });
          
          if (response.ok) {
              offlineQueue.shift(); // Remove success
              localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue));
              if (offlineQueue.length > 0) this.processQueue(); // Process next
          }
      } catch (e) {
          // Still offline, stop processing
      }
  },

  addToQueue(action: string, payload: any) {
      offlineQueue.push({ action, payload, timestamp: Date.now() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue));
  },

  async checkConnection(testConfig?: { sheetUrl?: string }): Promise<{ success: boolean; message?: string }> {
      if (this.isDemoMode()) return { success: true, message: "Demo Mode Active" };

      // Use cleanUrl on the input to ensure we test the corrected URL
      const rawUrl = testConfig ? testConfig.sheetUrl : this.getUrl();
      const url = cleanUrl(rawUrl || '');

      if (!url) return { success: false, message: "Google Sheet URL is missing" };
      
      try {
          // 1. Standard Attempt
          const response = await fetchWithTimeout(`${url}?action=health`, { 
              method: 'GET', 
              credentials: 'omit', 
              redirect: 'follow',
              cache: 'no-cache'
          }, 8000); // 8s timeout

          const data = await parseResponse(response);
          if (data.status === 'success') {
              this.processQueue(); // Try flushing queue on success
              return { success: true, message: `Connected (v${data.version})` };
          }
          return { success: false, message: "Invalid response from script." };

      } catch (e: any) { 
          console.error("Connection Check Failed:", e);
          const msg = e.message || '';
          
          // 2. DIAGNOSTIC PROBE: Differentiate between "Server Down" vs "Permission Denied (CORS)"
          // If the error is "Failed to fetch" (Chrome) or "NetworkError" (Firefox/Safari),
          // it could mean the URL is wrong OR the server rejected the OPTIONS request (CORS).
          if (e.name === 'TypeError' || msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Blocked')) {
              try {
                  // Attempt a 'no-cors' request. 
                  // If the server exists, this will succeed (opaque response).
                  // If the server does NOT exist, this will still throw.
                  await fetch(`${url}?action=health`, {
                      method: 'GET',
                      mode: 'no-cors', 
                      credentials: 'omit'
                  });
                  
                  // If we get here, the server is reachable but blocking us.
                  return { success: false, message: "Connection Blocked. The Backend URL works, but access is denied. Click ⚙️ to fix." };
              } catch (probeError) {
                  // If probing also fails, the URL is likely wrong or internet is down.
                  return { success: false, message: "Connection Failed. Check your URL and Internet." };
              }
          }

          if (msg.includes('Connection Blocked') || msg.includes('Access Denied')) {
             return { success: false, message: msg }; 
          }
          return { success: false, message: msg }; 
      }
  },

  // --- METHODS ---

  async getClassStatus(): Promise<{ success: boolean; isOpen: boolean }> {
      if (this.isDemoMode()) return { success: true, isOpen: true };
      const url = this.getUrl(); if (!url) return { success: false, isOpen: true }; 
      try {
          const response = await fetchWithRetry(`${url}?action=getClassStatus&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          return { success: true, isOpen: data.classStatus !== 'CLOSED' };
      } catch(e) {
          return { success: false, isOpen: true }; 
      }
  },

  async setClassStatus(isOpen: boolean): Promise<{ success: boolean }> {
      if (this.isDemoMode()) return { success: true };
      const url = this.getUrl(); if (!url) return { success: false };
      try {
          await fetchWithRetry(url, {
              method: 'POST', credentials: 'omit', redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: 'setClassStatus', payload: { isOpen } })
          });
          return { success: true };
      } catch(e) { return { success: false }; }
  },

  async getStoreItems(forceRefresh = false): Promise<StoreItem[]> {
      if (this.isDemoMode()) return []; // Mock data handled in Dashboard
      const cacheKey = 'store_items';
      if (!forceRefresh) { const cached = getFromCache<StoreItem[]>(cacheKey); if (cached) return cached; }
      
      const url = this.getUrl(); if (!url) return [];
      try {
          const response = await fetchWithRetry(`${url}?action=getStoreItems&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const items = data.items || [];
          setCache(cacheKey, items);
          return items;
      } catch(e) { return []; }
  },

  async addStoreItem(item: Partial<StoreItem>): Promise<{success: boolean; message?: string}> {
      if (this.isDemoMode()) return { success: true };
      const url = this.getUrl(); if (!url) return { success: false };
      try {
          await fetchWithRetry(url, {
              method: 'POST', credentials: 'omit', redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: 'addStoreItem', payload: item })
          });
          invalidateCache('store_items');
          return { success: true };
      } catch(e: any) { return { success: false, message: e.message }; }
  },

  async deleteStoreItem(id: string): Promise<{success: boolean}> {
      if (this.isDemoMode()) return { success: true };
      const url = this.getUrl(); if (!url) return { success: false };
      try {
          await fetchWithRetry(url, {
              method: 'POST', credentials: 'omit', redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: 'deleteStoreItem', payload: { id } })
          });
          invalidateCache('store_items');
          return { success: true };
      } catch(e) { return { success: false }; }
  },

  async testDriveSave(dataUrl: string): Promise<{ success: boolean; message?: string; url?: string }> {
      if (this.isDemoMode()) return { success: true, url: dataUrl };
      const url = this.getUrl(); if (!url) return { success: false, message: "No backend" };
      try {
          const response = await fetchWithRetry(url, {
              method: 'POST', credentials: 'omit', redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: 'testDriveSave', payload: { dataUrl } })
          });
          const data = await parseResponse(response);
          if (data.status === 'success') return { success: true, url: data.url };
          return { success: false, message: data.message };
      } catch (e: any) { return { success: false, message: e.message }; }
  },

  async loginStudent(student: Student): Promise<{ success: boolean; message?: string; student?: Student }> {
    if (this.isDemoMode()) {
        return { 
            success: true, 
            student: { 
                ...student, 
                id: 'demo-student', 
                points: 100, 
                stickers: ['panda', 'star'],
                canCreateStickers: true
            } 
        };
    }
    const url = this.getUrl();
    if (!url) return { success: false, message: "Backend not configured" };
    try {
      this.processQueue(); // Try to flush logs
      const response = await fetchWithRetry(url, {
        method: 'POST', credentials: 'omit', redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ 
            action: 'login', 
            payload: {
                name: student.name,
                password: student.password,
                scriptPreference: student.scriptPreference,
                userAgent: student.userAgent ? String(student.userAgent).substring(0, 100) : ''
            }
        })
      });
      const data = await parseResponse(response);
      if (data.status === 'success') return { success: true, student: data.student || student };
      return { success: false, message: data.message || "Login failed" };
    } catch (e: any) { 
        // OFFLINE / CORS FALLBACK
        const msg = e.message || '';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Connection Blocked') || msg.includes('Access denied')) {
             console.warn("Login offline fallback");
             
             // Queue the login for stats later
             this.addToQueue('login', {
                name: student.name,
                password: student.password,
                scriptPreference: student.scriptPreference,
                userAgent: student.userAgent || ''
             });

             // Return a mock student object so the user can still practice
             return { 
                 success: true, 
                 student: { 
                     ...student, 
                     id: `offline-${Date.now()}`, 
                     points: 0, 
                     stickers: [],
                     canCreateStickers: false
                 },
                 message: "Logged in Offline. Progress will sync when connection is restored."
             };
        }

        return { success: false, message: `System busy (${e.message}). Please retry.` }; 
    }
  },

  async getAssignments(forceRefresh = false): Promise<Lesson[]> {
    if (this.isDemoMode()) return [];

    const cacheKey = 'assignments';
    if (!forceRefresh) { const cached = getFromCache<Lesson[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      const response = await fetchWithRetry(`${url}?action=getAssignments&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
      const data = await parseResponse(response);
      const lessons = data.lessons || [];
      setCache(cacheKey, lessons);
      return lessons;
    } catch (e) { return []; }
  },

  async getCalendarEvents(forceRefresh = false): Promise<CalendarEvent[]> {
    if (this.isDemoMode()) return [];
    const cacheKey = 'calendar_events';
    if (!forceRefresh) { const cached = getFromCache<CalendarEvent[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      const response = await fetchWithRetry(`${url}?action=getCalendarEvents&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
      const data = await parseResponse(response);
      const events = data.events || [];
      setCache(cacheKey, events);
      return events;
    } catch (e) { return []; }
  },

  async saveCalendarEvent(event: CalendarEvent): Promise<{ success: boolean }> {
    if (this.isDemoMode()) return { success: true };
    const url = this.getUrl(); if (!url) return { success: false };
    try {
      await fetchWithRetry(url, {
        method: 'POST', credentials: 'omit', redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: 'saveCalendarEvent', payload: event })
      });
      invalidateCache('calendar_events');
      return { success: true };
    } catch (e) { return { success: false }; }
  },

  async deleteCalendarEvent(id: string): Promise<{ success: boolean }> {
    if (this.isDemoMode()) return { success: true };
    const url = this.getUrl(); if (!url) return { success: false };
    try {
      await fetchWithRetry(url, {
        method: 'POST', credentials: 'omit', redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: 'deleteCalendarEvent', payload: { id } })
      });
      invalidateCache('calendar_events');
      return { success: true };
    } catch (e) { return { success: false }; }
  },

  async getAssignmentStatuses(studentId: string, forceRefresh = false): Promise<StudentAssignment[]> {
    if (this.isDemoMode()) return [];

    const cacheKey = `statuses_${studentId}`;
    if (!forceRefresh) { const cached = getFromCache<StudentAssignment[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      const response = await fetchWithRetry(`${url}?action=getAssignmentStatuses&studentId=${encodeURIComponent(studentId)}&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
      const data = await parseResponse(response);
      const statuses = data.statuses || [];
      setCache(cacheKey, statuses);
      return statuses;
    } catch (e) { return []; }
  },

  async getAllStudentProgress(forceRefresh = false, startDate?: string, endDate?: string): Promise<StudentSummary[]> {
    if (this.isDemoMode()) return [];

    const cacheKey = `all_student_progress_${startDate || 'all'}_${endDate || 'all'}`;
    if (!forceRefresh) { const cached = getFromCache<StudentSummary[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      let query = `${url}?action=getAllStudentProgress&_t=${Date.now()}`;
      if (startDate) query += `&startDate=${startDate}`;
      if (endDate) query += `&endDate=${endDate}`;
      
      const response = await fetchWithRetry(query, { credentials: 'omit', redirect: 'follow' });
      const data = await parseResponse(response);
      const students = data.students || [];
      setCache(cacheKey, students);
      return students;
    } catch (e) { return []; }
  },

  async getLoginLogs(forceRefresh = false): Promise<LoginLog[]> {
    if (this.isDemoMode()) return [];

    const cacheKey = 'login_logs';
    if (!forceRefresh) { const cached = getFromCache<LoginLog[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      const response = await fetchWithRetry(`${url}?action=getLoginLogs&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
      const data = await parseResponse(response);
      const logs = data.logs || [];
      setCache(cacheKey, logs);
      return logs;
    } catch (e) { return []; }
  },

  async updateAssignmentStatus(studentId: string, assignmentId: string, status: AssignmentStatus): Promise<void> {
    if (this.isDemoMode()) return;
    const url = this.getUrl(); if (!url) return;
    try {
       await fetchWithRetry(url, {
        method: 'POST', credentials: 'omit', redirect: 'follow', keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: 'updateAssignmentStatus', payload: { studentId, assignmentId, status } })
      });
      invalidateCache(`statuses_${studentId}`);
      invalidateCache('all_student_progress');
      this.processQueue(); // Good time to flush
    } catch (e) {
        // Queue if network fails
        this.addToQueue('updateAssignmentStatus', { studentId, assignmentId, status });
    }
  },

  async updatePoints(studentId: string, delta: number, reason: string): Promise<{ success: boolean; points?: number }> {
    if (this.isDemoMode()) return { success: true, points: 100 + delta };
    const url = this.getUrl(); if (!url) return { success: false };
    try {
        const response = await fetchWithRetry(url, {
            method: 'POST', credentials: 'omit', redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: 'updatePoints', payload: { studentId, delta, reason } })
        });
        const data = await parseResponse(response);
        if (data.status === 'success') {
            invalidateCache('all_student_progress');
            return { success: true, points: data.points };
        }
        return { success: false };
    } catch (e) { return { success: false }; }
  },

  async purchaseSticker(studentId: string, stickerId: string, cost: number): Promise<{ success: boolean; points?: number; stickers?: string[] }> {
    if (this.isDemoMode()) return { success: true, points: 50, stickers: [stickerId] };
    const url = this.getUrl(); if (!url) return { success: false };
    try {
        const response = await fetchWithRetry(url, {
            method: 'POST', credentials: 'omit', redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: 'purchaseSticker', payload: { studentId, stickerId, cost } })
        });
        const data = await parseResponse(response);
        if (data.status === 'success') {
            invalidateCache('all_student_progress');
            return { success: true, points: data.points, stickers: data.stickers };
        }
        return { success: false };
    } catch (e) { return { success: false }; }
  },

  async saveCustomSticker(studentId: string, dataUrl: string, prompt: string, cost: number): Promise<{ success: boolean; points?: number; sticker?: { id: string, dataUrl: string, prompt: string } }> {
    if (this.isDemoMode()) return { success: true, points: 50, sticker: { id: 'demo-sticker', dataUrl, prompt } };
    const url = this.getUrl(); if (!url) return { success: false };
    try {
        const response = await fetchWithRetry(url, {
            method: 'POST', credentials: 'omit', redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ 
                action: 'saveCustomSticker', 
                payload: { studentId, dataUrl, prompt, cost } 
            })
        });
        const data = await parseResponse(response);
        if (data.status === 'success') {
            invalidateCache('all_student_progress');
            return { success: true, points: data.points, sticker: data.sticker };
        }
        return { success: false };
    } catch (e) { return { success: false }; }
  },

  async adminGivePoints(studentIds: string[], delta: number, reason: string): Promise<{ success: boolean; message?: string }> {
      if (this.isDemoMode()) return { success: true };
      const url = this.getUrl(); if (!url) return { success: false, message: "No backend" };
      try {
          const response = await fetchWithRetry(url, {
              method: 'POST', credentials: 'omit', redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: 'adminGivePoints', payload: { studentIds, delta, reason } })
          });
          const data = await parseResponse(response);
          if (data.status === 'success') {
              invalidateCache('all_student_progress');
              return { success: true };
          }
          return { success: false, message: data.message };
      } catch (e: any) { return { success: false, message: e.message }; }
  },

  async adminGiveSticker(studentIds: string[], sticker: { id?: string; dataUrl: string; prompt: string }): Promise<{ success: boolean; message?: string }> {
      if (this.isDemoMode()) return { success: true };
      const url = this.getUrl(); if (!url) return { success: false, message: "No backend" };
      try {
          const response = await fetchWithRetry(url, {
              method: 'POST', credentials: 'omit', redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ 
                  action: 'adminGiveSticker', 
                  payload: { studentIds, sticker } 
              })
          });
          const data = await parseResponse(response);
          if (data.status === 'success') {
              invalidateCache('all_student_progress');
              return { success: true };
          }
          return { success: false, message: data.message || "Server Error" };
      } catch (e: any) { return { success: false, message: e.message || "Network Error" }; }
  },

  async updateStudentPermission(studentId: string, canCreate: boolean): Promise<{ success: boolean }> {
      if (this.isDemoMode()) return { success: true };
      const url = this.getUrl(); if (!url) return { success: false };
      try {
          const response = await fetchWithRetry(url, {
              method: 'POST', credentials: 'omit', redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: 'updatePermission', payload: { studentId, canCreate } })
          });
          const data = await parseResponse(response);
          if (data.status === 'success') {
              invalidateCache('all_student_progress');
              return { success: true };
          }
          return { success: false };
      } catch (e) { return { success: false }; }
  },

  async createAssignment(lesson: Lesson): Promise<{ success: boolean; message?: string }> {
    if (this.isDemoMode()) return { success: true };
    const url = this.getUrl(); if (!url) return { success: false, message: "Backend URL is missing." };
    try {
      const response = await fetchWithRetry(url, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: 'createAssignment', payload: lesson }) });
      const data = await parseResponse(response);
      if (data.status === 'success') { invalidateCache('assignments'); return { success: true }; }
      return { success: false, message: data.message };
    } catch (e: any) { return { success: false, message: "Network connection failed" }; }
  },

  async editAssignment(lesson: Lesson): Promise<{ success: boolean; message?: string }> {
    if (this.isDemoMode()) return { success: true };
    const url = this.getUrl(); if (!url) return { success: false, message: "Backend URL is missing." };
    try {
      const response = await fetchWithRetry(url, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: 'editAssignment', payload: lesson }) });
      const data = await parseResponse(response);
      if (data.status === 'success') { invalidateCache('assignments'); return { success: true }; }
      return { success: false, message: data.message };
    } catch (e: any) { return { success: false, message: "Network connection failed" }; }
  },

  async deleteAssignment(id: string): Promise<{ success: boolean; message?: string }> {
    if (this.isDemoMode()) return { success: true };
    const url = this.getUrl(); if (!url) return { success: false, message: "Backend URL is missing." };
    try {
      const response = await fetchWithRetry(url, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: 'deleteAssignment', payload: { id } }) });
      const data = await parseResponse(response);
      if (data.status === 'success') { invalidateCache('assignments'); return { success: true }; }
      return { success: false, message: data.message };
    } catch (e: any) { return { success: false, message: "Network connection failed" }; }
  },

  async savePracticeRecord(studentName: string, record: PracticeRecord): Promise<void> {
    if (this.isDemoMode()) return;
    const url = this.getUrl(); if (!url) return;
    try {
      await fetchWithRetry(url, { method: 'POST', credentials: 'omit', redirect: 'follow', keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: 'saveRecord', payload: { studentName, ...record } }) });
      invalidateCache(`history_${studentName}`);
      invalidateCache('all_student_progress');
      this.processQueue(); // Good time to flush
    } catch (e) {
        // Queue data locally if connection fails
        console.warn("Connection unstable. Queuing record for later.");
        this.addToQueue('saveRecord', { studentName, ...record });
    }
  },

  async getStudentHistory(studentName: string, forceRefresh = false): Promise<PracticeRecord[]> {
    if (this.isDemoMode()) return [];

    const cacheKey = `history_${studentName}`;
    if (!forceRefresh) { const cached = getFromCache<PracticeRecord[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      const response = await fetchWithRetry(`${url}?action=getHistory&studentName=${encodeURIComponent(studentName)}&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
      const data = await parseResponse(response);
      const records = data.records || [];
      setCache(cacheKey, records);
      return records;
    } catch (e) { return []; }
  },

  async submitFeedback(name: string, email: string, message: string): Promise<{ success: boolean; message?: string }> {
    if (this.isDemoMode()) return { success: true };
    const url = this.getUrl(); if (!url) return { success: false, message: "Backend not connected" };
    try {
      await fetchWithRetry(url, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: 'submitFeedback', payload: { name, email, message } }) });
      return { success: true };
    } catch (e) { return { success: false, message: "Network error" }; }
  }
};
