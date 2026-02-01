
import { PracticeRecord, Lesson, Student, AssignmentStatus, StudentAssignment, StudentSummary } from '../types';

// Changing key to v2 forces the app to ignore old cached URLs and use the new ENV_URL
const STORAGE_KEY = 'hanzi_master_backend_url_v2';

// 1. Check for Environment Variable (Best for Netlify/Vercel deployment)
// 2. Fallback to the hardcoded URL provided by the user
const ENV_URL = process.env.REACT_APP_BACKEND_URL || 'https://script.google.com/macros/s/AKfycbx4Au2YDAhnACTz6x8kbaVlVh7AnqMP40CYsKWPoJnVZ4JXaWITEHqzv0jPAv_zG-Ly/exec'; 

// Helper: Exponential Backoff Fetcher
const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
    try {
        const response = await fetch(url, options);
        // If server is busy (503) or generic error (500), throw to retry
        if (response.status >= 500 && response.status < 600) {
            throw new Error(`Server Error ${response.status}`);
        }
        return response;
    } catch (err) {
        if (retries > 0) {
            console.warn(`Request failed, retrying in ${backoff}ms... (${retries} left)`);
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
  },

  async loginStudent(student: Student): Promise<{ success: boolean; message?: string; student?: Student }> {
    const url = this.getUrl();
    if (!url) return { success: false, message: "Backend not configured" };
    
    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        credentials: 'omit', 
        redirect: 'follow',
        headers: { "Content-Type": "text/plain" },
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

  async getAssignments(): Promise<Lesson[]> {
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
      // Add timestamp to prevent caching
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
      
      return lessons;
    } catch (e) {
      console.error("Fetch Assignments Error:", e);
      return [];
    }
  },

  async getAssignmentStatuses(studentId: string): Promise<StudentAssignment[]> {
    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetchWithRetry(`${url}?action=getAssignmentStatuses&studentId=${encodeURIComponent(studentId)}&_t=${Date.now()}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      return data.statuses || [];
    } catch (e) {
      return [];
    }
  },

  async getAllStudentProgress(): Promise<StudentSummary[]> {
    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetchWithRetry(`${url}?action=getAllStudentProgress&_t=${Date.now()}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      return data.students || [];
    } catch (e) {
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
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: 'updateAssignmentStatus',
          payload: { studentId, assignmentId, status }
        })
      });
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
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: 'saveRecord',
          payload: {
            studentName,
            ...record
          }
        })
      });
    } catch (e) {
      console.error("Save Record Error:", e);
    }
  },

  async getStudentHistory(studentName: string): Promise<PracticeRecord[]> {
    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetchWithRetry(`${url}?action=getHistory&studentName=${encodeURIComponent(studentName)}&_t=${Date.now()}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      return data.records || [];
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
        headers: { "Content-Type": "text/plain" },
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
      const url = this.getUrl();
      if (!url) return { success: false, message: "No URL saved" };
  
      try {
        // FAST FETCH: No retries for setup check. Immediate feedback is better.
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'omit',
          redirect: 'follow',
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: 'seed',
            payload: {}
          })
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch(e) {
            if (text.includes("<!DOCTYPE html>")) {
                return { success: false, message: "Permission Error: Access must be 'Anyone'." };
            }
            return { success: false, message: "Invalid response (Check URL)" };
        }

        if (data.status === 'error') {
            return { success: false, message: data.message };
        }

        return { success: true };
      } catch (e: any) {
        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
            return { success: false, message: "CORS Error. Deployment Access must be 'Anyone'." };
        }
        return { success: false, message: e.message || "Network error" };
      }
    }
};