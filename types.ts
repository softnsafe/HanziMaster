

export type ScriptType = 'Simplified' | 'Traditional';

export type AssignmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export type PracticeMode = 'WRITING' | 'PINYIN' | 'FILL_IN_BLANKS';

export type CalendarEventType = 'SCHOOL_DAY' | 'SPECIAL_EVENT' | 'NO_SCHOOL';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: CalendarEventType;
  description?: string;
}

export interface StudentAssignment {
  assignmentId: string;
  status: AssignmentStatus;
}

export interface CustomStickerData {
  id: string;
  studentId: string;
  dataUrl: string; // Base64 image
  prompt: string;
}

export interface StoreItem {
  id: string;
  name: string;
  imageUrl: string;
  cost: number;
  category: string;
  active: boolean;
}

export interface Student {
  id: string;
  name: string;
  password?: string;
  joinedAt: string;
  scriptPreference: ScriptType;
  points: number;
  stickers: string[]; // Array of sticker IDs (standard or custom)
  customStickers?: CustomStickerData[]; // Hydrated custom stickers
  canCreateStickers?: boolean; // Permission flag
}

export interface StudentSummary {
  id: string;
  name: string;
  assignmentsCompleted: number;
  assignmentsInProgress: number;
  averageScore: number;
  lastActive: string;
  totalPracticed: number;
  script?: string; 
  points: number;
  canCreateStickers?: boolean;
  stickers?: string[];
  customStickers?: CustomStickerData[];
}

export interface Sticker {
  id: string;
  name: string;
  emoji?: string;
  imageUrl?: string;
  cost: number;
  category: 'ANIMAL' | 'FOOD' | 'CELESTIAL' | 'OBJECT' | 'CUSTOM' | 'STORE';
  description: string;
}

export interface PracticeRecord {
  id: string;
  character: string;
  score: number;
  details: string;
  timestamp: number;
  imageUrl?: string;
  type?: PracticeMode;
}

export interface Lesson {
  id: string;
  title: string;
  characters: string[];
  description: string;
  startDate?: string;
  endDate?: string;
  type: PracticeMode;
  assignedTo?: string[]; // Array of student IDs. If empty/undefined, assigned to all.
}

export interface Flashcard {
  character: string;
  pinyin: string;
  definition: string;
  emoji: string;
}

export interface LoginLog {
  timestamp: string;
  studentId: string;
  name: string;
  action: string;
  device?: string;
}

export enum AppView {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  TEACHER_DASHBOARD = 'TEACHER_DASHBOARD',
  PRACTICE_WRITING = 'PRACTICE_WRITING',
  PRACTICE_PINYIN = 'PRACTICE_PINYIN',
  PRACTICE_FILL_IN_BLANKS = 'PRACTICE_FILL_IN_BLANKS',
  REPORT = 'REPORT',
  STICKER_STORE = 'STICKER_STORE'
}

export interface GradingResult {
  score: number;
  feedback: string;
  corrections: string[];
}