
import { PracticeRecord, Lesson, Student, AssignmentStatus, StudentAssignment, StudentSummary, LoginLog, CalendarEvent, StoreItem, PointLogEntry, ClassGoal, ContributionLog, RewardRule } from '../types';

const STORAGE_KEY = 'hanzi_master_backend_url_v2';
const DEMO_KEY = 'hanzi_master_demo_mode';
const QUEUE_KEY = 'hanzi_offline_queue';
const ENV_URL = process.env.REACT_APP_BACKEND_URL || ''; 

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

const cleanUrl = (url: string): string => {
    if (!url) return '';
    let clean = String(url).trim();
    if (!clean) return '';
    if (!clean.startsWith('http')) clean = 'https://' + clean;
    if (clean.includes('/edit')) clean = clean.split('/edit')[0] + '/exec';
    else if (clean.includes('/dev')) clean = clean.split('/dev')[0] + '/exec';
    else if (clean.endsWith('/')) clean = clean.slice(0, -1);
    if (clean.includes('script.google.com') && !clean.endsWith('/exec')) {
        if (!clean.endsWith('/')) clean += '/exec';
        else clean += 'exec';
    }
    return clean;
};

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 25000): Promise<Response> => {
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
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error("No internet connection");
    try {
        const response = await fetchWithTimeout(url, options);
        if (!response.ok) {
            if (response.status === 404) throw new Error("Script URL not found (404). Check deployment URL.");
            if (response.status === 403) throw new Error("Access denied (403). Permissions must be set to 'Anyone'.");
            if (response.status >= 500) throw new Error(`Server Error ${response.status}`);
        }
        return response;
    } catch (err: any) {
        const msg = err.message || '';
        if (err.name === 'TypeError' && (msg === 'Failed to fetch' || msg.includes('NetworkError'))) {
             console.error("CORS/Network Error:", err);
             throw new Error("Connection Blocked. Ensure Google Script is deployed as 'Web App' with access set to 'Anyone'.");
        }
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw err;
    }
};

const parseResponse = async (response: Response) => {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
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

const postData = async (action: string, payload: any) => {
    const url = sheetService.getUrl();
    if (!url) return { success: false, message: "No URL" };
    try {
        const response = await fetchWithRetry(url, {
            method: 'POST', credentials: 'omit', redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action, payload })
        });
        return await parseResponse(response);
    } catch (e: any) { return { success: false, message: e.message }; }
};

export const sheetService = {
  getUrl(): string { 
      try { return cleanUrl(localStorage.getItem(STORAGE_KEY) || ENV_URL); } 
      catch (e) { return ''; }
  },
  
  isDemoMode(): boolean { return localStorage.getItem(DEMO_KEY) === 'true'; },
  
  setDemoMode(enabled: boolean) {
      if (enabled) localStorage.setItem(DEMO_KEY, 'true');
      else localStorage.removeItem(DEMO_KEY);
      this.clearAllCache();
  },

  saveUrl(url: string) {
    localStorage.setItem(STORAGE_KEY, cleanUrl(url));
    this.setDemoMode(false);
    this.clearAllCache();
  },

  clearAllCache() { Object.keys(cache).forEach(key => delete cache[key]); },

  async processQueue() {
      if (offlineQueue.length === 0 || this.isDemoMode()) return;
      const url = this.getUrl(); if (!url) return;
      const item = offlineQueue[0];
      try {
          const response = await fetch(url, {
              method: 'POST', credentials: 'omit', redirect: 'follow',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify(item)
          });
          if (response.ok) {
              offlineQueue.shift();
              localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue));
              if (offlineQueue.length > 0) this.processQueue();
          }
      } catch (e) {}
  },

  addToQueue(action: string, payload: any) {
      offlineQueue.push({ action, payload, timestamp: Date.now() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue));
  },

  async checkConnection(testConfig?: { sheetUrl?: string }): Promise<{ success: boolean; message?: string }> {
      if (this.isDemoMode()) return { success: true, message: "Demo Mode Active" };
      const rawUrl = testConfig ? testConfig.sheetUrl : this.getUrl();
      const url = cleanUrl(rawUrl || '');
      if (!url) return { success: false, message: "Google Sheet URL is missing" };
      try {
          const response = await fetchWithTimeout(`${url}?action=health`, { method: 'GET', credentials: 'omit', redirect: 'follow', cache: 'no-cache' }, 8000);
          const data = await parseResponse(response);
          if (data.status === 'success') { this.processQueue(); return { success: true, message: `Connected (${data.version})` }; }
          return { success: false, message: "Invalid response from script." };
      } catch (e: any) { 
          if (e.message.includes('Connection Blocked')) return { success: false, message: "Connection Blocked. Ensure Script Access is 'Anyone'." };
          return { success: false, message: e.message || "Connection Failed" }; 
      }
  },

  async forceSetup(): Promise<{ success: boolean; message?: string }> {
      if (this.isDemoMode()) return { success: true, message: "Demo Mode" };
      return postData('adminSetup', {});
  },

  // --- GET METHODS ---

  async getDictionary(forceRefresh = false): Promise<Record<string, string>> {
      if (this.isDemoMode()) return {};
      const cacheKey = 'audio_dictionary';
      if (!forceRefresh) { const cached = getFromCache<Record<string, string>>(cacheKey); if (cached) return cached; }
      
      const url = this.getUrl(); if (!url) return {};
      try {
          const response = await fetchWithRetry(`${url}?action=getDictionary&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const dictionary = data.dictionary || {};
          setCache(cacheKey, dictionary);
          return dictionary;
      } catch(e) { console.error(e); return {}; }
  },

  async getFullDictionary(forceRefresh = false): Promise<Record<string, {pinyin: string, definition: string, audio: string}>> {
      if (this.isDemoMode()) return {};
      const cacheKey = 'full_dictionary';
      if (!forceRefresh) { const cached = getFromCache<any>(cacheKey); if (cached) return cached; }
      
      const url = this.getUrl(); if (!url) return {};
      try {
          const response = await fetchWithRetry(`${url}?action=getDictionary&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const fullDict = data.fullDictionary || {};
          setCache(cacheKey, fullDict);
          return fullDict;
      } catch(e) { console.error(e); return {}; }
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
      } catch(e) { console.error(e); return []; }
  },

  async getClassStatus() {
      if (this.isDemoMode()) return { success: true, isOpen: true };
      const url = this.getUrl(); if (!url) return { success: false };
      try {
          const response = await fetchWithRetry(`${url}?action=getClassStatus&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          return { success: true, isOpen: data.classStatus === 'OPEN' };
      } catch(e) { return { success: false }; }
  },

  async getStoreItems(forceRefresh = false): Promise<StoreItem[]> {
      if (this.isDemoMode()) return [];
      const cacheKey = 'store_items';
      if (!forceRefresh) { const cached = getFromCache<StoreItem[]>(cacheKey); if (cached) return cached; }
      const url = this.getUrl(); if (!url) return [];
      try {
          const response = await fetchWithRetry(`${url}?action=getStoreItems&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const items = data.items || [];
          setCache(cacheKey, items);
          return items;
      } catch(e) { console.error(e); return []; }
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
      } catch(e) { console.error(e); return []; }
  },

  async getAssignmentStatuses(studentId: string, forceRefresh = false): Promise<StudentAssignment[]> {
      if (this.isDemoMode()) return [];
      const cacheKey = `status_${studentId}`;
      if (!forceRefresh) { const cached = getFromCache<StudentAssignment[]>(cacheKey); if (cached) return cached; }
      const url = this.getUrl(); if (!url) return [];
      try {
          const response = await fetchWithRetry(`${url}?action=getAssignmentStatuses&studentId=${studentId}&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const statuses = data.statuses || [];
          setCache(cacheKey, statuses);
          return statuses;
      } catch(e) { console.error(e); return []; }
  },

  async getAllStudentProgress(forceRefresh = false, startDate?: string, endDate?: string): Promise<StudentSummary[]> {
      if (this.isDemoMode()) return [];
      const cacheKey = `progress_${startDate || 'all'}_${endDate || 'all'}`;
      if (!forceRefresh) { const cached = getFromCache<StudentSummary[]>(cacheKey); if (cached) return cached; }
      const url = this.getUrl(); if (!url) return [];
      try {
          const q = new URLSearchParams({ action: 'getAllStudentProgress', _t: Date.now().toString() });
          if(startDate) q.append('startDate', startDate);
          if(endDate) q.append('endDate', endDate);
          const response = await fetchWithRetry(`${url}?${q.toString()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const students = data.students || [];
          setCache(cacheKey, students);
          return students;
      } catch(e) { console.error(e); return []; }
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
      } catch(e) { console.error(e); return []; }
  },

  async getPointLogs(studentId: string): Promise<PointLogEntry[]> {
      if (this.isDemoMode()) return [];
      const url = this.getUrl(); if (!url) return [];
      try {
          const response = await fetchWithRetry(`${url}?action=getPointLogs&studentId=${studentId}&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          return data.logs || [];
      } catch(e) { console.error(e); return []; }
  },

  async getClassGoals(forceRefresh = false): Promise<ClassGoal[]> {
      if (this.isDemoMode()) return [];
      const cacheKey = 'class_goals';
      if (!forceRefresh) { const cached = getFromCache<ClassGoal[]>(cacheKey); if (cached) return cached; }
      const url = this.getUrl(); if (!url) return [];
      try {
          const response = await fetchWithRetry(`${url}?action=getClassGoals&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const goals = data.goals || [];
          setCache(cacheKey, goals);
          return goals;
      } catch(e) { console.error(e); return []; }
  },

  async getRecentGoalContributions(forceRefresh = false): Promise<ContributionLog[]> {
      if (this.isDemoMode()) return [];
      const cacheKey = 'goal_contributions';
      if (!forceRefresh) { const cached = getFromCache<ContributionLog[]>(cacheKey); if (cached) return cached; }
      const url = this.getUrl(); if (!url) return [];
      try {
          const response = await fetchWithRetry(`${url}?action=getRecentGoalContributions&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const logs = data.logs || [];
          setCache(cacheKey, logs);
          return logs;
      } catch(e) { console.error(e); return []; }
  },

  async getRewardRules(forceRefresh = false): Promise<RewardRule[]> {
      if (this.isDemoMode()) return [];
      const cacheKey = 'reward_rules';
      if (!forceRefresh) { const cached = getFromCache<RewardRule[]>(cacheKey); if (cached) return cached; }
      const url = this.getUrl(); if (!url) return [];
      try {
          const response = await fetchWithRetry(`${url}?action=getRewardRules&_t=${Date.now()}`, { credentials: 'omit', redirect: 'follow' });
          const data = await parseResponse(response);
          const rules = data.rules || [];
          setCache(cacheKey, rules);
          return rules;
      } catch(e) { console.error(e); return []; }
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
      } catch(e) { console.error(e); return []; }
  },

  // --- POST METHODS ---

  async addToDictionary(item: { character: string, pinyin?: string, definition?: string, audioUrl?: string }) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('addToDictionary', item);
      if (res.success) {
          invalidateCache('audio_dictionary');
          invalidateCache('full_dictionary');
      }
      return res;
  },

  async deleteFromDictionary(character: string) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('deleteFromDictionary', { character });
      if (res.success) {
          invalidateCache('audio_dictionary');
          invalidateCache('full_dictionary');
      }
      return res;
  },

  async uploadMedia(dataUrl: string) {
      if (this.isDemoMode()) return { success: true, url: dataUrl };
      return postData('uploadMedia', { dataUrl });
  },

  async loginStudent(student: Student) {
      if (this.isDemoMode()) return { success: true, student: { ...student, id: 'demo', points: 100, stickers: [] } };
      const url = this.getUrl(); if (!url) return { success: false, message: "Backend not configured" };
      try {
          this.processQueue();
          const response = await fetchWithRetry(url, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: 'login', payload: { name: student.name, password: student.password, scriptPreference: student.scriptPreference, userAgent: student.userAgent || '' } }) });
          const data = await parseResponse(response);
          if (data.status === 'success') return { success: true, student: data.student || student };
          return { success: false, message: data.message };
      } catch(e: any) {
          if (e.message.includes('Failed to fetch')) {
              this.addToQueue('login', student);
              return { success: true, student: { ...student, id: `offline-${Date.now()}` }, message: "Logged in Offline" };
          }
          return { success: false, message: e.message };
      }
  },

  async setClassStatus(isOpen: boolean) {
      if (this.isDemoMode()) return { success: true };
      return postData('setClassStatus', { isOpen });
  },

  async addStoreItem(item: any) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('addStoreItem', item);
      if(res.success) invalidateCache('store_items');
      return res;
  },

  async deleteStoreItem(id: string) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('deleteStoreItem', { id });
      if(res.success) invalidateCache('store_items');
      return res;
  },

  async saveCalendarEvent(event: any) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('saveCalendarEvent', event);
      if(res.success) invalidateCache('calendar_events');
      return res;
  },

  async deleteCalendarEvent(id: string) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('deleteCalendarEvent', { id });
      if(res.success) invalidateCache('calendar_events');
      return res;
  },

  async updateAssignmentStatus(sid: string, aid: string, s: AssignmentStatus) {
      if (this.isDemoMode()) return;
      await postData('updateAssignmentStatus', { studentId: sid, assignmentId: aid, status: s });
      invalidateCache(`status_${sid}`);
  },

  async updatePoints(sid: string, d: number, r: string) {
      if (this.isDemoMode()) return { success: true, points: 0 };
      const res = await postData('updatePoints', { studentId: sid, delta: d, reason: r });
      if(res.success) invalidateCache('progress');
      return res;
  },
  
  async purchaseSticker(studentId: string, stickerId: string, cost: number) {
      if (this.isDemoMode()) return { success: true, points: 100, stickers: [stickerId] };
      return postData('purchaseSticker', { studentId, stickerId, cost });
  },

  async saveCustomSticker(studentId: string, dataUrl: string, prompt: string, cost: number) {
      if (this.isDemoMode()) return { success: true, points: 90, sticker: { id: 'demo-'+Date.now(), dataUrl, prompt } };
      return postData('saveCustomSticker', { studentId, dataUrl, prompt, cost });
  },
  
  async adminGivePoints(ids: string[], d: number, r: string) {
      if (this.isDemoMode()) return { success: true };
      return postData('adminGivePoints', { studentIds: ids, delta: d, reason: r });
  },
  
  async adminGiveSticker(studentIds: string[], sticker: { id?: string, dataUrl: string, prompt: string }) {
      if (this.isDemoMode()) return { success: true };
      return postData('adminGiveSticker', { studentIds, sticker });
  },

  async updateStudentPermission(sid: string, c: boolean) {
      if (this.isDemoMode()) return { success: true };
      return postData('updatePermission', { studentId: sid, canCreate: c });
  },

  async createAssignment(l: Lesson) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('createAssignment', l);
      if(res.success) invalidateCache('assignments');
      return res;
  },

  async editAssignment(l: Lesson) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('editAssignment', l);
      if(res.success) invalidateCache('assignments');
      return res;
  },

  async deleteAssignment(id: string) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('deleteAssignment', { id });
      if(res.success) invalidateCache('assignments');
      return res;
  },

  async savePracticeRecord(n: string, r: PracticeRecord) {
      if (this.isDemoMode()) return;
      await postData('saveRecord', { studentName: n, ...r });
      invalidateCache(`history_${n}`);
  },

  async submitFeedback(n: string, e: string, m: string) {
      if (this.isDemoMode()) return { success: true };
      return postData('submitFeedback', { name: n, email: e, message: m });
  },

  async createClassGoal(t: string, ta: number) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('createClassGoal', { title: t, target: ta });
      if(res.success) invalidateCache('class_goals');
      return res;
  },

  async deleteClassGoal(id: string) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('deleteClassGoal', { id });
      if(res.success) invalidateCache('class_goals');
      return res;
  },
  
  async contributeToGoal(studentId: string, amount: number, goalId: string) {
      if (this.isDemoMode()) return { success: true, points: 100, goalCurrent: 50, goalStatus: 'ACTIVE' };
      const res = await postData('contributeToGoal', { studentId, amount, goalId });
      if(res.success) {
          invalidateCache('class_goals');
          invalidateCache('goal_contributions');
      }
      return res;
  },

  async toggleClassGoalStatus(id: string, status: string) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('toggleGoalStatus', { id, status });
      if(res.success) invalidateCache('class_goals');
      return res;
  },

  async updateRewardRule(k: string, p: number) {
      if (this.isDemoMode()) return { success: true };
      const res = await postData('updateRewardRule', { actionKey: k, points: p });
      if(res.success) invalidateCache('reward_rules');
      return res;
  },

  async syncStudentData(sid: string) {
      if (this.isDemoMode()) return { success: true };
      return postData('syncStudentData', { studentId: sid });
  }
};
