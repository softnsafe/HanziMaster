export type ScriptType = 'Simplified' | 'Traditional';

export type AssignmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface StudentAssignment {
  assignmentId: string;
  status: AssignmentStatus;
}

export interface Student {
  id: string;
  name: string;
  password?: string; // Added for authentication
  joinedAt: string;
  scriptPreference: ScriptType;
}

export interface StudentSummary {
  id: string;
  name: string;
  assignmentsCompleted: number;
  averageScore: number;
  lastActive: string;
  totalPracticed: number;
  script?: string; // Added script tracking
}

export interface PracticeRecord {
  id: string;
  character: string;
  score: number;
  feedback: string;
  timestamp: number;
  imageUrl?: string; // Base64 of the attempt
}

export interface Lesson {
  id: string;
  title: string;
  characters: string[];
  description: string;
  startDate?: string; // ISO Date String YYYY-MM-DD
  endDate?: string;   // ISO Date String YYYY-MM-DD
}

export enum AppView {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  TEACHER_DASHBOARD = 'TEACHER_DASHBOARD',
  PRACTICE = 'PRACTICE',
  REPORT = 'REPORT'
}

export interface GradingResult {
  score: number;
  feedback: string;
  corrections: string[];
}

declare global {
  interface Window {
    HanziWriter: any;
  }
}