
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Student, Lesson, PracticeRecord, StudentAssignment, CalendarEvent, StudentSummary, LoginLog } from '../types';

let supabase: SupabaseClient | null = null;

export const initSupabase = (url: string, key: string) => {
    supabase = createClient(url, key);
};

// Helper to convert base64 to blob
const base64ToBlob = async (base64: string): Promise<Blob> => {
    const res = await fetch(base64);
    return await res.blob();
};

export const supabaseImpl = {
    // --- STANDALONE UPLOAD (For Hybrid Mode) ---
    async uploadImage(base64Data: string, folder = 'stickers'): Promise<string | null> {
        if (!supabase) return null;
        try {
            if (!base64Data.startsWith('data:')) return base64Data; // Already a URL

            const blob = await base64ToBlob(base64Data);
            const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
            
            const { error } = await supabase.storage.from('stickers').upload(fileName, blob);
            if (error) {
                console.error("Supabase Upload Error:", error);
                return null;
            }
            
            const { data } = supabase.storage.from('stickers').getPublicUrl(fileName);
            return data.publicUrl;
        } catch (e) {
            console.error("Upload exception:", e);
            return null;
        }
    },

    async checkConnection(overrideUrl?: string, overrideKey?: string) {
        let client = supabase;
        if (overrideUrl && overrideKey) {
            try {
                client = createClient(overrideUrl, overrideKey);
            } catch (e: any) {
                return { success: false, message: "Invalid Supabase URL/Key format" };
            }
        }

        if (!client) return { success: false, message: "Not initialized" };
        
        try {
            const { error } = await client.from('students').select('count', { count: 'exact', head: true });
            if (error) return { success: false, message: "Supabase Error: " + error.message };
            return { success: true, message: "Connected to Supabase" };
        } catch (e: any) {
            return { success: false, message: "Connection Failed: " + e.message };
        }
    },

    async loginStudent(student: Student) {
        if (!supabase) throw new Error("No Supabase");
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .ilike('name', student.name.trim()) // Case insensitive match
            .single();

        if (error || !data) {
            return { success: false, message: "User not found. Ask teacher to create account." };
        }

        if (data.password && data.password !== student.password) {
            return { success: false, message: "Incorrect password" };
        }

        // Update login timestamp
        await supabase.from('students').update({ last_login: new Date().toISOString() }).eq('id', data.id);
        
        // Log it
        await supabase.from('login_logs').insert({ 
            student_id: data.id, 
            name: data.name, 
            action: 'Login' 
        });

        // Map snake_case to camelCase
        const mappedStudent: Student = {
            id: data.id,
            name: data.name,
            points: data.points,
            scriptPreference: data.script_preference || 'Simplified',
            stickers: data.stickers || [],
            joinedAt: data.created_at,
            canCreateStickers: data.can_create_stickers,
            customStickers: [] // Loaded separately usually, or we can fetch here
        };

        // Fetch custom stickers
        const { data: customData } = await supabase.from('custom_stickers').select('*').eq('student_id', data.id);
        if (customData) {
            mappedStudent.customStickers = customData.map((s: any) => ({
                id: s.id,
                studentId: s.student_id,
                dataUrl: s.url,
                prompt: s.prompt
            }));
        }

        return { success: true, student: mappedStudent };
    },

    async getAssignments() {
        if (!supabase) return [];
        const { data } = await supabase.from('assignments').select('*').order('created_at', { ascending: false });
        return (data || []).map((row: any) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            characters: row.characters || [],
            startDate: row.start_date,
            endDate: row.end_date,
            type: row.type,
            assignedTo: row.assigned_to
        }));
    },

    async getAssignmentStatuses(studentId: string) {
        if (!supabase) return [];
        const { data } = await supabase.from('student_assignments').select('*').eq('student_id', studentId);
        return (data || []).map((row: any) => ({
            assignmentId: row.assignment_id,
            status: row.status
        }));
    },

    async updateAssignmentStatus(studentId: string, assignmentId: string, status: string) {
        if (!supabase) return;
        const { error } = await supabase.from('student_assignments').upsert({
            student_id: studentId,
            assignment_id: assignmentId,
            status: status,
            updated_at: new Date().toISOString()
        }, { onConflict: 'student_id,assignment_id' });
    },

    async getHistory(studentName: string) {
        if (!supabase) return [];
        // Need to find student ID first technically, but if we store name in progress it's easier for migration
        const { data } = await supabase.from('progress').select('*').eq('student_name', studentName).order('timestamp', { ascending: true });
        
        return (data || []).map((row: any) => ({
            id: row.id,
            character: row.character,
            score: row.score,
            details: row.details,
            timestamp: new Date(row.timestamp).getTime(), // Convert ISO to timestamp number
            type: row.type
        }));
    },

    async saveRecord(payload: any) {
        if (!supabase) return;
        await supabase.from('progress').insert({
            student_name: payload.studentName,
            character: payload.character,
            score: payload.score,
            details: payload.details,
            type: payload.type,
            timestamp: new Date().toISOString()
        });
    },

    async updatePoints(studentId: string, delta: number, reason: string) {
        if (!supabase) return { success: false };
        
        // Use RPC or read-modify-write. RPC is safer for concurrency but let's do RMW for simplicity without defining SQL functions
        const { data: student } = await supabase.from('students').select('points').eq('id', studentId).single();
        if (!student) return { success: false };
        
        const newPoints = Math.max(0, (student.points || 0) + delta);
        await supabase.from('students').update({ points: newPoints }).eq('id', studentId);
        
        // Log
        await supabase.from('point_logs').insert({ student_id: studentId, delta, reason, new_balance: newPoints });
        
        return { success: true, points: newPoints };
    },

    async purchaseSticker(studentId: string, stickerId: string, cost: number) {
        if (!supabase) return { success: false };
        
        const { data: student } = await supabase.from('students').select('points, stickers').eq('id', studentId).single();
        if (!student) return { success: false };
        
        if (student.points < cost) return { success: false, message: "Not enough points" };
        
        const newPoints = student.points - cost;
        const currentStickers = student.stickers || [];
        if (!currentStickers.includes(stickerId)) {
            currentStickers.push(stickerId);
        }
        
        await supabase.from('students').update({ points: newPoints, stickers: currentStickers }).eq('id', studentId);
        await supabase.from('point_logs').insert({ student_id: studentId, delta: -cost, reason: `Bought ${stickerId}`, new_balance: newPoints });
        
        return { success: true, points: newPoints, stickers: currentStickers };
    },

    async saveCustomSticker(studentId: string, dataUrl: string, prompt: string, cost: number) {
        if (!supabase) return { success: false };
        
        // 1. Upload Image (Reuse standalone function if possible, but implementing directly here for transaction context)
        let publicUrl = dataUrl;
        if (dataUrl.startsWith('data:')) {
            publicUrl = await this.uploadImage(dataUrl) || dataUrl;
        }

        if (publicUrl.startsWith('data:')) {
             return { success: false, message: "Image upload failed" };
        }

        // 2. Deduct Points
        const { data: student } = await supabase.from('students').select('points, stickers').eq('id', studentId).single();
        if (!student || student.points < cost) return { success: false, message: "Not enough points" };
        
        const newPoints = student.points - cost;
        const stickerId = `custom-${Date.now()}`;
        const newStickers = [...(student.stickers || []), stickerId];

        // 3. Transaction-ish
        await supabase.from('students').update({ points: newPoints, stickers: newStickers }).eq('id', studentId);
        await supabase.from('custom_stickers').insert({
            id: stickerId,
            student_id: studentId,
            url: publicUrl,
            prompt: prompt
        });

        return { 
            success: true, 
            points: newPoints, 
            sticker: { id: stickerId, dataUrl: publicUrl, prompt } 
        };
    },

    async getAllStudentProgress(startDate?: string, endDate?: string) {
        if (!supabase) return [];
        
        // Fetch students
        const { data: students } = await supabase.from('students').select('*');
        if (!students) return [];

        // We need more complex joins for a full report, but we can do parallel fetches for now
        // 1. Fetch Assignments Count
        const { data: assignData } = await supabase.from('student_assignments').select('*');
        
        // 2. Fetch Practice Scores
        let query = supabase.from('progress').select('student_name, score, timestamp');
        if (startDate) query = query.gte('timestamp', startDate);
        if (endDate) query = query.lte('timestamp', endDate);
        const { data: progressData } = await query;

        // 3. Custom Stickers Map
        const { data: cStickers } = await supabase.from('custom_stickers').select('*');

        return students.map((s: any) => {
            const sAssigns = assignData?.filter((a: any) => a.student_id === s.id) || [];
            const sProgress = progressData?.filter((p: any) => p.student_name === s.name) || []; // Weak link by name
            
            const totalScore = sProgress.reduce((sum: number, r: any) => sum + r.score, 0);
            const avg = sProgress.length > 0 ? Math.round(totalScore / sProgress.length) : 0;

            return {
                id: s.id,
                name: s.name,
                points: s.points,
                script: s.script_preference,
                assignmentsCompleted: sAssigns.filter((a: any) => a.status === 'COMPLETED').length,
                assignmentsInProgress: sAssigns.filter((a: any) => a.status === 'IN_PROGRESS').length,
                totalPracticed: sProgress.length,
                averageScore: avg,
                lastActive: s.last_login,
                canCreateStickers: s.can_create_stickers,
                stickers: s.stickers || [],
                customStickers: cStickers?.filter((c: any) => c.student_id === s.id).map((c: any) => ({
                    id: c.id, studentId: c.student_id, dataUrl: c.url, prompt: c.prompt
                })) || []
            };
        });
    },

    async saveCalendarEvent(event: CalendarEvent) {
        if (!supabase) return { success: false };
        // Upsert based on ID
        const { error } = await supabase.from('calendar').upsert({
            id: event.id,
            date: event.date,
            title: event.title,
            type: event.type,
            description: event.description
        });
        return { success: !error };
    },

    async getCalendarEvents() {
        if (!supabase) return [];
        const { data } = await supabase.from('calendar').select('*');
        return (data || []).map((e: any) => ({
            id: e.id,
            date: e.date,
            title: e.title,
            type: e.type,
            description: e.description
        }));
    },

    async deleteCalendarEvent(id: string) {
        if (!supabase) return { success: false };
        await supabase.from('calendar').delete().eq('id', id);
        return { success: true };
    },

    // Admin
    async createAssignment(lesson: Lesson) {
        if (!supabase) return { success: false };
        const { error } = await supabase.from('assignments').insert({
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            characters: lesson.characters,
            start_date: lesson.startDate,
            end_date: lesson.endDate,
            type: lesson.type,
            assigned_to: lesson.assignedTo
        });
        return { success: !error, message: error?.message };
    },

    async editAssignment(lesson: Lesson) {
        if (!supabase) return { success: false };
        const { error } = await supabase.from('assignments').update({
            title: lesson.title,
            description: lesson.description,
            characters: lesson.characters,
            start_date: lesson.startDate,
            end_date: lesson.endDate,
            type: lesson.type,
            assigned_to: lesson.assignedTo
        }).eq('id', lesson.id);
        return { success: !error, message: error?.message };
    },

    async deleteAssignment(id: string) {
        if(!supabase) return { success: false };
        await supabase.from('assignments').delete().eq('id', id);
        return { success: true };
    },

    async adminGivePoints(studentIds: string[], delta: number, reason: string) {
        if(!supabase) return { success: false };
        
        for (const id of studentIds) {
            await this.updatePoints(id, delta, reason);
        }
        return { success: true };
    },

    async adminGiveSticker(studentIds: string[], sticker: { dataUrl: string, prompt: string }) {
        if(!supabase) return { success: false };
        
        // Upload once if it's base64
        let publicUrl = sticker.dataUrl;
        if (sticker.dataUrl.startsWith('data:')) {
            publicUrl = await this.uploadImage(sticker.dataUrl, 'admin_gifts') || sticker.dataUrl;
        }

        const stickerId = `gift-${Date.now()}`;

        // Update all students
        for (const id of studentIds) {
            const { data: s } = await supabase.from('students').select('stickers').eq('id', id).single();
            if (s) {
                const newStickers = [...(s.stickers || []), stickerId];
                await supabase.from('students').update({ stickers: newStickers }).eq('id', id);
                await supabase.from('custom_stickers').insert({
                    id: stickerId, student_id: id, url: publicUrl, prompt: sticker.prompt
                });
            }
        }
        return { success: true };
    },

    async updatePermission(studentId: string, canCreate: boolean) {
        if(!supabase) return { success: false };
        await supabase.from('students').update({ can_create_stickers: canCreate }).eq('id', studentId);
        return { success: true };
    },

    async submitFeedback(name: string, email: string, message: string) {
        if(!supabase) return { success: false };
        await supabase.from('feedback').insert({ name, email, message });
        return { success: true };
    }
};
