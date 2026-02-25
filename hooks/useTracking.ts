import { useCallback } from 'react';
import { sheetService } from '../services/sheetService';
import { Student } from '../types';

export const useTracking = () => {
  const track = useCallback((student: Student | null, action: string, details: string = '', metadata: any = {}) => {
    if (!student) return;
    
    // Console log for dev
    console.log(`[Tracking] ${student.name} - ${action}: ${details}`, metadata);
    
    // Send to backend
    sheetService.logActivity(student.id, student.name, action, details, metadata);
  }, []);

  return { track };
};
