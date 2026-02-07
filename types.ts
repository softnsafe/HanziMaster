
export type ScriptType = 'Simplified' | 'Traditional';

export type AssignmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export type PracticeMode = 'WRITING' | 'PINYIN' | 'FILL_IN_BLANKS';

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
  assignmentsInProgress: number; // New field for tracking active work
  completedWriting?: number; 
  completedPinyin?: number;  
  completedFillBlank?: number; // Specific tracker for Sentence Builder
  averageScore: number;
  lastActive: string;
  totalPracticed: number;
  script?: string; 
}

export interface PracticeRecord {
  id: string;
  character: string;
  score: number;
  details: string; // Renamed from feedback to details
  timestamp: number;
  imageUrl?: string; // Base64 of the attempt
  type?: PracticeMode; // 'WRITING' or 'PINYIN'
}

export interface Lesson {
  id: string;
  title: string;
  characters: string[];
  description: string;
  startDate?: string; // ISO Date String YYYY-MM-DD
  endDate?: string;   // ISO Date String YYYY-MM-DD
  type: PracticeMode; // Strict Type Required
}

export interface Flashcard {
  character: string;
  pinyin: string; // Numbered: ni3
  definition: string;
  emoji: string; // Acts as the 'Picture'
}

export interface LoginLog {
  timestamp: string;
  studentId: string;
  name: string;
  action: string;
}

export enum AppView {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  TEACHER_DASHBOARD = 'TEACHER_DASHBOARD',
  PRACTICE_WRITING = 'PRACTICE_WRITING',
  PRACTICE_PINYIN = 'PRACTICE_PINYIN',
  PRACTICE_FILL_IN_BLANKS = 'PRACTICE_FILL_IN_BLANKS',
  REPORT = 'REPORT'
}

export interface GradingResult {
  score: number;
  feedback: string;
  corrections: string[];
}
