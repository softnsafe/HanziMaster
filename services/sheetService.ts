import { PracticeRecord, Lesson, Student, AssignmentStatus, StudentAssignment, StudentSummary } from '../types';

const STORAGE_KEY = 'hanzi_master_backend_url';
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbyqZ-sXRyAv17XHFNpthXBqy4dKjvyWlxYof5MDKvT4calWsyC9P8HXpQlnyGOv-gs1Ow/exec';

export const sheetService = {
  
  getUrl(): string {
    // Returns local storage override if present, otherwise the hardcoded production URL
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
  },

  saveUrl(url: string) {
    // Basic cleaning to prevent common copy-paste errors
    let clean = url.trim();
    
    // If user pasted the "Edit" URL, try to fix it to "exec"
    if (clean.includes('/edit')) {
       clean = clean.split('/edit')[0] + '/exec';
    } else if (clean.endsWith('/')) {
       // Remove trailing slash if present (Apps Script exec usually doesn't need it, but keep if clean)
       clean = clean.slice(0, -1);
    }
    
    // Ensure it looks like a script URL
    if (clean.includes('script.google.com') && !clean.endsWith('/exec')) {
        // If it doesn't end in exec and isn't caught by /edit, warn or append? 
        // Best to leave as is if we aren't sure, but usually /exec is required.
        // We will trust the user or the regex below.
    }

    localStorage.setItem(STORAGE_KEY, clean);
  },

  /**
   * Records student login. Returns the full student object (with ID from DB) on success.
   */
  async loginStudent(student: Student): Promise<{ success: boolean; message?: string; student?: Student }> {
    const url = this.getUrl();
    if (!url) {
      console.warn("Backend URL not configured.");
      return { success: false, message: "Backend not configured" };
    }
    
    try {
      const response = await fetch(url, {
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
         // Return first 100 chars of response to help debug (likely HTML if error)
         return { success: false, message: "Server error (HTML response). Check deployment access." };
      }

      if (data.status === 'success') {
        // Backend might return the existing student data, including persistent ID
        const returnedStudent = data.student || student;
        return { success: true, student: returnedStudent };
      } else {
        return { success: false, message: data.message || "Login failed" };
      }
    } catch (e) {
      console.error("Failed to record login:", e);
      return { success: false, message: "Network error" };
    }
  },

  async getAssignments(): Promise<Lesson[]> {
    const url = this.getUrl();
    if (!url) {
      return [
        {
          id: 'mock-1',
          title: 'Setup Required',
          characters: ['设', '置'],
          description: 'Please click the gear icon on the login screen to configure your Google Sheet backend.'
        }
      ];
    }

    try {
      const response = await fetch(`${url}?action=getAssignments`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.lessons || [];
    } catch (e) {
      console.error("Failed to fetch assignments:", e);
      return [];
    }
  },

  async getAssignmentStatuses(studentId: string): Promise<StudentAssignment[]> {
    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetch(`${url}?action=getAssignmentStatuses&studentId=${encodeURIComponent(studentId)}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      return data.statuses || [];
    } catch (e) {
      console.error("Failed to fetch statuses:", e);
      return [];
    }
  },

  async getAllStudentProgress(): Promise<StudentSummary[]> {
    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetch(`${url}?action=getAllStudentProgress`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      return data.students || [];
    } catch (e) {
      console.error("Failed to fetch all student progress:", e);
      return [];
    }
  },

  async updateAssignmentStatus(studentId: string, assignmentId: string, status: AssignmentStatus): Promise<void> {
    const url = this.getUrl();
    if (!url) return;

    try {
       await fetch(url, {
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
      console.error("Failed to update status:", e);
    }
  },

  async createAssignment(lesson: Lesson): Promise<{ success: boolean; message?: string }> {
    const url = this.getUrl();
    if (!url) return { success: false, message: "Backend URL is missing." };

    try {
      const response = await fetch(url, {
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
      try {
        data = JSON.parse(text);
      } catch (e) {
        return { success: false, message: "Server returned invalid response. Ensure correct deployment." };
      }

      if (data.status === 'success') {
        return { success: true };
      } else {
        return { success: false, message: data.message || "Unknown server error" };
      }
    } catch (e: any) {
      return { success: false, message: e.message || "Network connection failed" };
    }
  },

  async savePracticeRecord(studentName: string, record: PracticeRecord): Promise<void> {
    const url = this.getUrl();
    if (!url) return;

    try {
      await fetch(url, {
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
      console.error("Failed to save record:", e);
    }
  },

  async getStudentHistory(studentName: string): Promise<PracticeRecord[]> {
    const url = this.getUrl();
    if (!url) return [];

    try {
      const response = await fetch(`${url}?action=getHistory&studentName=${encodeURIComponent(studentName)}`, {
        credentials: 'omit',
        redirect: 'follow'
      });
      const data = await response.json();
      return data.records || [];
    } catch (e) {
      console.error("Failed to fetch history:", e);
      return [];
    }
  },

  async seedSampleData(): Promise<{ success: boolean; message?: string }> {
      const url = this.getUrl();
      if (!url) return { success: false, message: "No URL saved" };
  
      try {
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
            // This is critical for debugging permission errors
            // If permissions are wrong, Google returns HTML "Sign in to continue"
            if (text.includes("<!DOCTYPE html>")) {
                return { success: false, message: "Permission Error: Deployment access must be 'Anyone'." };
            }
            return { success: false, message: "Invalid JSON response. Check URL." };
        }

        if (data.status === 'error') {
            return { success: false, message: data.message };
        }

        return { success: true };
      } catch (e: any) {
        return { success: false, message: e.message || "Network error" };
      }
    }
};