
import { PracticeRecord, Lesson, Student, AssignmentStatus, StudentAssignment, StudentSummary, LoginLog, CalendarEvent, StoreItem } from '../types';

const STORAGE_KEY = 'hanzi_master_backend_url_v2';
const DEMO_KEY = 'hanzi_master_demo_mode';
const ENV_URL = process.env.REACT_APP_BACKEND_URL || ''; 

// Caching Logic
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}
const CACHE_TTL = 5 * 60 * 1000;
const cache: Record<string, CacheEntry<any>> = {};

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

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error("No internet connection");
    }
    try {
        const response = await fetch(url, options);
        if (response.status >= 500 && response.status < 600) throw new Error(`Server Error ${response.status}`);
        return response;
    } catch (err) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw err;
    }
};

// --- MOCK DATA FOR DEMO MODE ---
const MOCK_LESSONS: Lesson[] = [
    { id: 'demo-1', title: 'Demo: Greetings', description: 'Basic greetings in Chinese', characters: ['你好', '谢谢', '再见'], startDate: new Date().toISOString(), type: 'WRITING' },
    { id: 'demo-2', title: 'Demo: Animals', description: 'Learn animal names', characters: ['猫', '狗', '熊猫'], startDate: new Date().toISOString(), type: 'PINYIN' },
    { id: 'demo-3', title: 'Demo: Sentences', description: 'Build simple sentences', characters: ['我#爱#妈妈', '他#是#老师'], startDate: new Date().toISOString(), type: 'FILL_IN_BLANKS' }
];

const MOCK_EVENTS: CalendarEvent[] = [
    { id: 'evt-1', date: new Date().toISOString().split('T')[0], title: 'Demo Day', type: 'SPECIAL_EVENT', description: 'Testing the system' }
];

const MOCK_STORE: StoreItem[] = [
    { id: 'demo-s1', name: 'Golden Dragon', imageUrl: 'https://lh3.googleusercontent.com/d/1234=s400', cost: 100, category: 'STORE', active: true },
    { id: 'demo-s2', name: 'Magic Potion', imageUrl: 'https://lh3.googleusercontent.com/d/5678=s400', cost: 50, category: 'STORE', active: true },
];

export const sheetService = {
  getUrl(): string { 
      let url = localStorage.getItem(STORAGE_KEY) || ENV_URL; 
      url = url.trim();
      // Robust check: if the user pasted an /edit URL, fix it automatically
      if (url && url.includes('/edit')) {
          return url.split('/edit')[0] + '/exec';
      }
      return url;
  },
  
  isDemoMode(): boolean { return localStorage.getItem(DEMO_KEY) === 'true'; },
  
  setDemoMode(enabled: boolean) {
      if (enabled) localStorage.setItem(DEMO_KEY, 'true');
      else localStorage.removeItem(DEMO_KEY);
      this.clearAllCache();
  },

  saveUrl(url: string) {
    let clean = url.trim();
    if (!clean.startsWith('http')) clean = 'https://' + clean;
    if (clean.includes('/edit')) clean = clean.split('/edit')[0] + '/exec';
    else if (clean.endsWith('/')) clean = clean.slice(0, -1);
    localStorage.setItem(STORAGE_KEY, clean);
    this.setDemoMode(false); // Disable demo if setting a real URL
    this.clearAllCache();
  },

  clearAllCache() { Object.keys(cache).forEach(key => delete cache[key]); },

  async checkConnection(testConfig?: { sheetUrl?: string }): Promise<{ success: boolean; message?: string }> {
      if (this.isDemoMode()) return { success: true, message: "Demo Mode Active" };

      const url = testConfig ? testConfig.sheetUrl : this.getUrl();
      if (!url) return { success: false, message: "Google Sheet URL is missing" };
      try {
          const response = await fetch(`${url}?action=health`, { 
              method: 'GET', 
              credentials: 'omit', 
              redirect: 'follow',
              cache: 'no-cache'
          });
          const text = await response.text();
          try {
              const data = JSON.parse(text);
              if (data.status === 'success') return { success: true, message: `Connected (v${data.version})` };
          } catch(e) {}
          return { success: false, message: "Invalid response from script." };
      } catch (e: any) { 
          console.error("Connection Check Failed:", e);
          if (e.message && e.message.includes('Failed to fetch')) {
             return { success: false, message: "Connection Blocked. Try 'Demo Mode' if using AI Studio/Sandboxes." }; 
          }
          return { success: false, message: e.message }; 
      }
  },

  // --- NEW CLASS STATUS METHODS ---
  async getClassStatus(): Promise<{ success: boolean; isOpen: boolean }> {
      if (this.isDemoMode()) return { success: true, isOpen: true };
      const url = this.getUrl(); if (!url) return { success: false, isOpen: true }; // Default to open if offline
      try {
          const response = await fetchWithRetry(`${url}?action=getClassStatus&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await response.json();
          return { success: true, isOpen: data.classStatus !== 'CLOSED' };
      } catch(e) {
          return { success: false, isOpen: true }; // Fail open if error
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
      if (this.isDemoMode()) return MOCK_STORE;
      const cacheKey = 'store_items';
      if (!forceRefresh) { const cached = getFromCache<StoreItem[]>(cacheKey); if (cached) return cached; }
      
      const url = this.getUrl(); if (!url) return [];
      try {
          const response = await fetchWithRetry(`${url}?action=getStoreItems&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await response.json();
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
          const data = await response.json();
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
      const response = await fetchWithRetry(url, {
        method: 'POST', credentials: 'omit', redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: 'login', payload: student })
      });
      const data = await response.json();
      if (data.status === 'success') return { success: true, student: data.student || student };
      return { success: false, message: data.message || "Login failed" };
    } catch (e: any) { return { success: false, message: `System busy (${e.message}). Please retry.` }; }
  },

  async getAssignments(forceRefresh = false): Promise<Lesson[]> {
    if (this.isDemoMode()) return MOCK_LESSONS;

    const cacheKey = 'assignments';
    if (!forceRefresh) { const cached = getFromCache<Lesson[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      const response = await fetchWithRetry(`${url}?action=getAssignments&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
      const data = await response.json();
      const lessons = data.lessons || [];
      setCache(cacheKey, lessons);
      return lessons;
    } catch (e) { return []; }
  },

  async getCalendarEvents(forceRefresh = false): Promise<CalendarEvent[]> {
    if (this.isDemoMode()) return MOCK_EVENTS;

    const cacheKey = 'calendar_events';
    if (!forceRefresh) { const cached = getFromCache<CalendarEvent[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      const response = await fetchWithRetry(`${url}?action=getCalendarEvents&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
      const data = await response.json();
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
      const data = await response.json();
      const statuses = data.statuses || [];
      setCache(cacheKey, statuses);
      return statuses;
    } catch (e) { return []; }
  },

  async getAllStudentProgress(forceRefresh = false, startDate?: string, endDate?: string): Promise<StudentSummary[]> {
    if (this.isDemoMode()) return [
        { id: 'demo-student', name: 'Demo Student', assignmentsCompleted: 5, assignmentsInProgress: 1, averageScore: 95, lastActive: new Date().toISOString(), totalPracticed: 20, points: 100, canCreateStickers: true }
    ];

    const cacheKey = `all_student_progress_${startDate || 'all'}_${endDate || 'all'}`;
    if (!forceRefresh) { const cached = getFromCache<StudentSummary[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      let query = `${url}?action=getAllStudentProgress&_t=${Date.now()}`;
      if (startDate) query += `&startDate=${startDate}`;
      if (endDate) query += `&endDate=${endDate}`;
      
      const response = await fetchWithRetry(query, { credentials: 'omit', redirect: 'follow' });
      const data = await response.json();
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
      const data = await response.json();
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
    } catch (e) {}
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
        const data = await response.json();
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
        const data = await response.json();
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
        const data = await response.json();
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
          const data = await response.json();
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
          const data = await response.json();
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
          const data = await response.json();
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
      const data = await response.json();
      if (data.status === 'success') { invalidateCache('assignments'); return { success: true }; }
      return { success: false, message: data.message };
    } catch (e: any) { return { success: false, message: "Network connection failed" }; }
  },

  async editAssignment(lesson: Lesson): Promise<{ success: boolean; message?: string }> {
    if (this.isDemoMode()) return { success: true };
    const url = this.getUrl(); if (!url) return { success: false, message: "Backend URL is missing." };
    try {
      const response = await fetchWithRetry(url, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: 'editAssignment', payload: lesson }) });
      const data = await response.json();
      if (data.status === 'success') { invalidateCache('assignments'); return { success: true }; }
      return { success: false, message: data.message };
    } catch (e: any) { return { success: false, message: "Network connection failed" }; }
  },

  async deleteAssignment(id: string): Promise<{ success: boolean; message?: string }> {
    if (this.isDemoMode()) return { success: true };
    const url = this.getUrl(); if (!url) return { success: false, message: "Backend URL is missing." };
    try {
      const response = await fetchWithRetry(url, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: 'deleteAssignment', payload: { id } }) });
      const data = await response.json();
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
    } catch (e) {}
  },

  async getStudentHistory(studentName: string, forceRefresh = false): Promise<PracticeRecord[]> {
    if (this.isDemoMode()) return [];

    const cacheKey = `history_${studentName}`;
    if (!forceRefresh) { const cached = getFromCache<PracticeRecord[]>(cacheKey); if (cached) return cached; }
    const url = this.getUrl(); if (!url) return [];
    try {
      const response = await fetchWithRetry(`${url}?action=getHistory&studentName=${encodeURIComponent(studentName)}&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
      const data = await response.json();
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
