
import { PracticeRecord, Lesson, Student, AssignmentStatus, StudentAssignment, StudentSummary, LoginLog } from '../types';

// Changing key to v2 forces the app to ignore old cached URLs and use the new ENV_URL
const STORAGE_KEY = 'hanzi_master_backend_url_v2';

// 1. Check for Environment Variable (Best for Netlify/Vercel deployment)
// 2. Fallback: Empty string. (Previously a hardcoded URL was here, but it caused errors when invalid).
const ENV_URL = process.env.REACT_APP_BACKEND_URL || ''; 

// --- CACHING LAYER ---
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}
// Cache TTL: 5 minutes
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
// ---------------------

// Helper: Exponential Backoff Fetcher
const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error("No internet connection");
    }

    try {
        const response = await fetch(url, options);
        // If server is busy (503) or generic error (500), throw to retry
        if (response.status >= 500 && response.status < 600) {
            throw new Error(`Server Error ${response.status}`);
        }
        return response;
    } catch (err) {
        if (retries > 0) {
            // Only warn if it's not a cancellation
            if ((err as Error).name !== 'AbortError') {
                 // Use debug for first retry to keep console cleaner, warn only on subsequent attempts
                 if (retries === 3) {
                    console.debug(`Request failed, retrying in ${backoff}ms...`);
                 } else {
                    console.warn(`Request failed, retrying in ${backoff}ms... (${retries} left)`);
                 }
            }
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2); // Double the wait time
        }
        throw err;
    }
};

export const sheetService = {
  
  getUrl(): string {
    // Return local storage if present, otherwise use the hardcoded ENV_URL
    return localStorage.getItem(STORAGE_KEY) || ENV_URL;
  },

  saveUrl(url: string) {
    let clean = url.trim();
    
    // Ensure protocol
    if (!clean.startsWith('http')) {
        clean = 'https://' + clean;
    }

    if (clean.includes('/edit')) {
       clean = clean.split('/edit')[0] + '/exec';
    } else if (clean.endsWith('/')) {
       clean = clean.slice(0, -1);
    }
    localStorage.setItem(STORAGE_KEY, clean);
    // Clear cache on URL change to avoid stale data from old sheet
    Object.keys(cache).forEach(key => delete cache[key]);
  },

  clearAllCache() {
      Object.keys(cache).forEach(key => delete cache[key]);
  },

  async checkConnection(): Promise<{ success: boolean; message?: string }> {
      const url = this.getUrl();
      if (!url) return { success: false, message: "No URL saved" };

      try {
          const response = await fetch(`${url}?action=health`, {
             method: 'GET',
             credentials: 'omit',
             redirect: 'follow'
          });
          const text = await response.text();
          try {
              const data = JSON.parse(text);
              if (data.status === 'success') {
                  return { success: true, message: `Connected (v${data.version})` };
              }
          } catch(e) {
              if (text.includes("<!DOCTYPE html>")) return { success: false, message: "Permission Error. Access must be 'Anyone'."};
          }
          return { success: false, message: "Invalid response from script." };
      } catch (e: any) {
          if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
              return { success: false, message: "CORS Error. Access must be 'Anyone'." };
          }
          return { success: false, message: e.message };
      }
  },

  async loginStudent(student: Student): Promise<{ success: boolean; message?: string; student?: Student }> {
    const url = this.getUrl();
    if (!url) return { success: false, message: "Backend not configured" };
    
    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        credentials: 'omit', 
        redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: 'login',
          payload: student
        })
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
         return { success: false, message: "Server error. Please try again." };
      }

      if (data.status === 'success') {
        const returnedStudent = data.student || student;
        return { success: true, student: returnedStudent };
      } else {
        return { success: false, message: data.message || "Login failed" };
      }
    } catch (e) {
      console.error("Login Error:", e);
      return { success: false, message: "System busy. Please try again." };
    }
  },

  async getAssignments(forceRefresh = false): Promise<Lesson[]> {
    const cacheKey = 'assignments';
    if (!forceRefresh) {
        const cached = getFromCache<Lesson[]>(cacheKey);
        if (cached) return cached;
    }

    const url = this.getUrl();
    if (!url) {
      return [
        {
          id: 'mock-setup',
          title: 'Setup Required',
          characters: ['设', '置'],
          description: 'Please click the gear icon on the login screen to configure your Google Sheet backend.',
          type: 'WRITING'
        }
      ];
    }

    try {
      // Add timestamp to prevent caching at browser network layer
      const response = await fetchWithRetry(`${url}?action=getAssignments&_t=${Date.now()}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      const lessons = (data.lessons || []).map((l: any) => ({
          ...l,
          type: l.type || 'WRITING'
      }));
      
      setCache(cacheKey, lessons);
      return lessons;
    } catch (e) {
      console.error("Fetch Assignments Error:", e);
      return [];
    }
  },

  async getAssignmentStatuses(studentId: string, forceRefresh = false): Promise<StudentAssignment[]> {
    const cacheKey = `statuses_${studentId}`;
    if (!forceRefresh) {
        const cached = getFromCache<StudentAssignment[]>(cacheKey);
        if (cached) return cached;
    }

    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetchWithRetry(`${url}?action=getAssignmentStatuses&studentId=${encodeURIComponent(studentId)}&_t=${Date.now()}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      const statuses = data.statuses || [];
      setCache(cacheKey, statuses);
      return statuses;
    } catch (e) {
      return [];
    }
  },

  async getAllStudentProgress(forceRefresh = false): Promise<StudentSummary[]> {
    // Teacher data usually shouldn't be cached too long, or at all if they want live updates.
    // But to prevent errors on quick tab switching, we cache it briefly.
    const cacheKey = 'all_student_progress';
    if (!forceRefresh) {
        const cached = getFromCache<StudentSummary[]>(cacheKey);
        if (cached) return cached;
    }

    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetchWithRetry(`${url}?action=getAllStudentProgress&_t=${Date.now()}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      const students = data.students || [];
      setCache(cacheKey, students);
      return students;
    } catch (e) {
      return [];
    }
  },

  async getLoginLogs(forceRefresh = false): Promise<LoginLog[]> {
    const cacheKey = 'login_logs';
    if (!forceRefresh) {
        const cached = getFromCache<LoginLog[]>(cacheKey);
        if (cached) return cached;
    }

    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetchWithRetry(`${url}?action=getLoginLogs&_t=${Date.now()}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      const logs = data.logs || [];
      setCache(cacheKey, logs);
      return logs;
    } catch (e) {
      console.error("Fetch Logs Error", e);
      return [];
    }
  },

  async updateAssignmentStatus(studentId: string, assignmentId: string, status: AssignmentStatus): Promise<void> {
    const url = this.getUrl();
    if (!url) return;

    try {
       await fetchWithRetry(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        keepalive: true, // Critical for updates during navigation/unmount
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: 'updateAssignmentStatus',
          payload: { studentId, assignmentId, status }
        })
      });
      // Invalidate relevant caches
      invalidateCache(`statuses_${studentId}`);
      invalidateCache('all_student_progress');
    } catch (e) {
      console.error("Update Status Error:", e);
    }
  },

  async createAssignment(lesson: Lesson): Promise<{ success: boolean; message?: string }> {
    const url = this.getUrl();
    if (!url) return { success: false, message: "Backend URL is missing." };

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: 'createAssignment',
          payload: lesson
        })
      });

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { return { success: false, message: "Server Error" }; }

      if (data.status === 'success') {
        invalidateCache('assignments'); // Clear assignment cache
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (e: any) {
      return { success: false, message: "Network connection failed" };
    }
  },

  async editAssignment(lesson: Lesson): Promise<{ success: boolean; message?: string }> {
    const url = this.getUrl();
    if (!url) return { success: false, message: "Backend URL is missing." };

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: 'editAssignment',
          payload: lesson
        })
      });

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { return { success: false, message: "Server Error" }; }

      if (data.status === 'success') {
        invalidateCache('assignments');
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (e: any) {
      return { success: false, message: "Network connection failed" };
    }
  },

  async deleteAssignment(id: string): Promise<{ success: boolean; message?: string }> {
    const url = this.getUrl();
    if (!url) return { success: false, message: "Backend URL is missing." };

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: 'deleteAssignment',
          payload: { id }
        })
      });

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { return { success: false, message: "Server Error" }; }

      if (data.status === 'success') {
        invalidateCache('assignments');
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (e: any) {
      return { success: false, message: "Network connection failed" };
    }
  },

  async savePracticeRecord(studentName: string, record: PracticeRecord): Promise<void> {
    const url = this.getUrl();
    if (!url) return;

    try {
      await fetchWithRetry(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        keepalive: true, // Critical for updates during navigation/unmount
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: 'saveRecord',
          payload: {
            studentName,
            ...record
          }
        })
      });
      // Invalidate history cache so if they view report immediately it is somewhat fresh (though reports often lag slightly)
      // Note: We typically don't strictly need to invalidate history if we only save on completion,
      // but if we ever save partials, this helps.
      invalidateCache(`history_${studentName}`);
      invalidateCache('all_student_progress');
    } catch (e) {
      console.error("Save Record Error:", e);
    }
  },

  async getStudentHistory(studentName: string, forceRefresh = false): Promise<PracticeRecord[]> {
    const cacheKey = `history_${studentName}`;
    if (!forceRefresh) {
        const cached = getFromCache<PracticeRecord[]>(cacheKey);
        if (cached) return cached;
    }

    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetchWithRetry(`${url}?action=getHistory&studentName=${encodeURIComponent(studentName)}&_t=${Date.now()}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      const records = data.records || [];
      setCache(cacheKey, records);
      return records;
    } catch (e) {
      return [];
    }
  },

  async submitFeedback(name: string, email: string, message: string): Promise<{ success: boolean; message?: string }> {
    const url = this.getUrl();
    if (!url) return { success: false, message: "Backend not connected" };

    try {
      await fetchWithRetry(url, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: 'submitFeedback',
          payload: { name, email, message }
        })
      });
      return { success: true };
    } catch (e) {
      return { success: false, message: "Network error" };
    }
  },

  async seedSampleData(): Promise<{ success: boolean; message?: string }> {
      // Legacy support using the old action, or just verify functionality
      return this.checkConnection();
  }
};
