
import React, { useEffect, useState } from 'react';
import { PracticeRecord, Student, Lesson, StudentAssignment, PracticeMode } from '../types';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { convertCharacter } from '../utils/characterConverter';

interface ProgressReportProps {
  student: Student;
  records: PracticeRecord[];
  onBack: () => void;
}

export const ProgressReport: React.FC<ProgressReportProps> = ({ student, records: initialRecords, onBack }) => {
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  const [statuses, setStatuses] = useState<StudentAssignment[]>([]);
  // Local state for records allows us to refresh history without reloading the whole App
  const [records, setRecords] = useState<PracticeRecord[]>(initialRecords);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async (force = false) => {
    setIsLoading(true);

    try {
        const [fetchedAssignments, fetchedStatuses, fetchedHistory] = await Promise.all([
            sheetService.getAssignments(force),
            sheetService.getAssignmentStatuses(student.id, force),
            sheetService.getStudentHistory(student.name, force)
        ]);
        setAssignments(fetchedAssignments);
        setStatuses(fetchedStatuses);
        setRecords(fetchedHistory);
    } catch (e) {
        console.error("Failed to refresh report data", e);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial load uses cache if available
    loadData(false);
  }, [student.id]);

  const handleRefresh = () => {
      // Manual refresh forces network fetch
      loadData(true);
  };

  const getStatus = (lessonId: string) => statuses.find(s => s.assignmentId === lessonId)?.status || 'NOT_STARTED';

  const getLessonProgress = (lesson: Lesson) => {
    // Strictly switch based on lesson type
    const type = lesson.type;
    
    let targets: string[] = [];
    let completedCount = 0;

    if (type === 'FILL_IN_BLANKS') {
         // Handle Standard (Word#Word) format
         targets = lesson.characters.map(c => {
             // Standard Format: "我#是#学生" -> "我是学生"
             // Remove all # to create the target string the user constructed
             return c.split('#').map(p => p.trim()).join('');
         }).filter(Boolean).map(c => convertCharacter(c, student.scriptPreference));
         
         // Check strictly for FILL_IN_BLANKS records
         completedCount = targets.filter(char => 
            records.some(r => r.character === char && r.type === 'FILL_IN_BLANKS' && r.score === 100)
         ).length;

    } else if (type === 'PINYIN') {
         targets = lesson.characters.map(c => convertCharacter(c, student.scriptPreference));
         
         // Check strictly for PINYIN records
         completedCount = targets.filter(char => 
            records.some(r => r.character === char && r.type === 'PINYIN' && r.score === 100)
         ).length;

    } else {
         // WRITING
         targets = lesson.characters.map(c => convertCharacter(c, student.scriptPreference));
         
         // Check strictly for WRITING records
         // Note: We accept records with undefined type as Writing for backward compatibility with old records,
         // but the Lesson MUST be 'WRITING'.
         completedCount = targets.filter(char => 
            records.some(r => r.character === char && (r.type || 'WRITING') === 'WRITING' && r.score === 100)
         ).length;
    }

    return { done: completedCount, total: targets.length, type };
  };

  const renderBadge = (type: PracticeMode) => {
    if (type === 'PINYIN') {
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-600 text-[10px] font-extrabold uppercase tracking-wide border border-sky-100">🗣️ Pinyin</span>;
    }
    if (type === 'FILL_IN_BLANKS') {
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-600 text-[10px] font-extrabold uppercase tracking-wide border border-purple-100">🧩 Sentence Builder</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-extrabold uppercase tracking-wide border border-indigo-100">✍️ Writing</span>;
 };

  const getBarColor = (type: PracticeMode) => {
      if (type === 'PINYIN') return 'bg-sky-400';
      if (type === 'FILL_IN_BLANKS') return 'bg-purple-400';
      return 'bg-indigo-400';
  };

  const getBarLabelColor = (type: PracticeMode) => {
      if (type === 'PINYIN') return 'text-sky-400';
      if (type === 'FILL_IN_BLANKS') return 'text-purple-400';
      return 'text-indigo-400';
  };

  if (isLoading) {
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center animate-fade-in py-12">
            <div className="relative w-48 h-48 mb-8">
                 {/* Orbiting Ring */}
                 <div className="absolute inset-0 border-4 border-dashed border-slate-200 rounded-full animate-[spin_10s_linear_infinite]"></div>
                 {/* Inner Ring */}
                 <div className="absolute inset-4 border-4 border-indigo-100 rounded-full animate-[spin_4s_linear_infinite_reverse]"></div>
                 
                 {/* Floating Trophy */}
                 <div className="absolute inset-0 flex items-center justify-center text-8xl animate-float">
                    🏆
                 </div>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Calculating Scores...</h2>
            <p className="text-slate-400 font-bold">Reviewing your amazing progress</p>
        </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={onBack}>← Back</Button>
            <h1 className="text-2xl font-extrabold text-slate-800">My Trophy Room 🏆</h1>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
            Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-indigo-500 text-white p-6 rounded-[2rem] shadow-lg shadow-indigo-200">
            <p className="opacity-80 font-bold text-sm uppercase">Tasks Done</p>
            <p className="text-5xl font-extrabold mt-2">
                {statuses.filter(s => s.status === 'COMPLETED').length}
            </p>
        </div>
        <div className="bg-sky-400 text-white p-6 rounded-[2rem] shadow-lg shadow-sky-200">
            <p className="opacity-80 font-bold text-sm uppercase">Characters</p>
            <p className="text-5xl font-extrabold mt-2">{records.length}</p>
        </div>
        <div className="bg-emerald-400 text-white p-6 rounded-[2rem] shadow-lg shadow-emerald-200">
            <p className="opacity-80 font-bold text-sm uppercase">Score</p>
            <p className="text-5xl font-extrabold mt-2">
                {records.length > 0 ? Math.round(records.reduce((a,b) => a + b.score, 0) / records.length) : '-'}
            </p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50">
             <h3 className="font-extrabold text-xl text-slate-800">Homework History</h3>
        </div>
        <div className="divide-y divide-slate-100">
            {assignments.map(lesson => {
                const status = getStatus(lesson.id);
                const { done, total, type } = getLessonProgress(lesson);
                
                return (
                    <div key={lesson.id} className="p-6 hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-3">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <div className="font-bold text-slate-800 text-lg">{lesson.title}</div>
                                    {renderBadge(type)}
                                </div>
                                <div className="text-slate-400 text-sm font-medium">{lesson.characters.length} items</div>
                            </div>
                            <div>
                                {status === 'COMPLETED' ? (
                                    <span className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full font-bold text-sm">Completed</span>
                                ) : (
                                     <span className="px-4 py-2 bg-slate-100 text-slate-500 rounded-full font-bold text-sm">To Do</span>
                                )}
                            </div>
                        </div>
                        
                        {/* Single Progress Bar based on Type */}
                        <div className="mt-2">
                            <div className={`flex justify-between text-xs font-bold ${getBarLabelColor(type)} mb-1 uppercase tracking-wider`}>
                                <span>Progress</span>
                                <span>{done}/{total}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all ${getBarColor(type)}`} 
                                    style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};
