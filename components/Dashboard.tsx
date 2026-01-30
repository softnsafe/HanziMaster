/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useEffect, useState } from 'react';
import { Lesson, Student, StudentAssignment, PracticeMode, PracticeRecord } from '../types';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { convertCharacter } from '../utils/characterConverter';

interface DashboardProps {
  student: Student;
  records: PracticeRecord[]; // Passed from App to check partial progress
  onStartPractice: (lesson: Lesson, mode: PracticeMode) => void;
  onViewReport: () => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ student, records, onStartPractice, onViewReport, onLogout }) => {
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  const [statuses, setStatuses] = useState<StudentAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<PracticeMode | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      // Artificial delay (optional) to let the animation show for at least 800ms prevents flickering
      const minLoadTime = new Promise(resolve => setTimeout(resolve, 800));
      
      const [lessons, statusList] = await Promise.all([
         sheetService.getAssignments(),
         sheetService.getAssignmentStatuses(student.id),
         minLoadTime
      ]);
      setAssignments(lessons);
      setStatuses(statusList);
      setIsLoading(false);
    };
    loadData();
  }, [student.id]);

  const getStatus = (lessonId: string) => {
    return statuses.find(s => s.assignmentId === lessonId)?.status || 'NOT_STARTED';
  };

  const isModeDone = (lesson: Lesson, mode: PracticeMode) => {
     if (mode === 'FILL_IN_BLANKS') {
         // Special handling: key is the "Answer" part.
         // Characters array is ["Q # A", "Q # A"]
         // Records character is "A".
         return lesson.characters.every(item => {
             const parts = item.split('#');
             if (parts.length < 2) return true; // skip invalid
             const answer = parts[1].trim();
             const targetChar = convertCharacter(answer, student.scriptPreference);
             return records.some(r => r.character === targetChar && r.type === 'FILL_IN_BLANKS' && r.score === 100);
         });
     }

     // Standard Check
     return lesson.characters.every(char => {
         const targetChar = convertCharacter(char, student.scriptPreference);
         // Strict match on record type
         const targetType = mode; 
         return records.some(r => r.character === targetChar && (r.type || 'WRITING') === targetType && r.score === 100);
     });
  };

  const getVisibleAssignments = () => {
    const today = new Date();
    today.setHours(0,0,0,0);
    return assignments.filter(lesson => {
      if (!lesson.startDate && !lesson.endDate) return true;
      let isVisible = true;
      if (lesson.startDate) {
        const start = new Date(lesson.startDate);
        start.setHours(0,0,0,0);
        if (today < start) isVisible = false;
      }
      if (lesson.endDate) {
        const end = new Date(lesson.endDate);
        end.setHours(0,0,0,0);
        if (today > end) isVisible = false;
      }
      return isVisible;
    });
  };

  const visibleAssignments = getVisibleAssignments();
  
  const filteredAssignments = visibleAssignments.filter(lesson => {
      if (!selectedMode) return false;
      // Strict filter
      return lesson.type === selectedMode;
  });

  const renderBadge = (type: PracticeMode) => {
     if (type === 'PINYIN') {
         return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-600 text-[10px] font-extrabold uppercase tracking-wide border border-sky-100">🗣️ Pinyin Only</span>;
     }
     if (type === 'FILL_IN_BLANKS') {
         return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-600 text-[10px] font-extrabold uppercase tracking-wide border border-purple-100">🧩 Fill Blanks</span>;
     }
     return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-extrabold uppercase tracking-wide border border-indigo-100">✍️ Writing Only</span>;
  };

  const renderContentPreview = (lesson: Lesson) => {
      if (lesson.type === 'FILL_IN_BLANKS') {
          return (
              <div className="flex flex-col gap-2 mb-6">
                  {lesson.characters.slice(0, 3).map((item, i) => {
                      const q = item.split('#')[0];
                      return (
                          <div key={i} className="text-xs bg-slate-50 p-2 rounded border border-slate-100 truncate text-slate-500 font-mono">
                              {q}
                          </div>
                      );
                  })}
                  {lesson.characters.length > 3 && <div className="text-xs text-slate-400 font-bold pl-1">+{lesson.characters.length - 3} more questions</div>}
              </div>
          );
      }
      return (
        <div className="flex flex-wrap gap-2 mb-6">
            {lesson.characters.slice(0, 4).map((char, i) => (
            <span key={i} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl text-slate-700 font-serif-sc font-bold border border-slate-100">
                {convertCharacter(char, student.scriptPreference)}
            </span>
            ))}
            {lesson.characters.length > 4 && (
                <span className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl text-slate-400 text-xs font-bold">
                    +{lesson.characters.length - 4}
                </span>
            )}
        </div>
      );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2rem] p-8 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full translate-x-1/3 -translate-y-1/3"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
                <h1 className="text-3xl font-extrabold mb-2">Hello, {student.name}! 👋</h1>
                <p className="opacity-90 font-medium">Ready to practice your Chinese?</p>
            </div>
            <div className="flex gap-3">
                <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white" onClick={onViewReport}>
                    🏆 My Progress
                </Button>
                <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white" onClick={onLogout}>
                    Logout
                </Button>
            </div>
        </div>
      </div>

      <section>
        {/* Navigation / Header */}
        <div className="mb-6 flex items-center gap-4">
             {selectedMode && (
                 <Button variant="ghost" onClick={() => setSelectedMode(null)} className="pl-0 hover:bg-transparent text-slate-400 hover:text-slate-600">
                     ← Back
                 </Button>
             )}
             <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                <span className="text-2xl">
                    {!selectedMode ? '🚀' : selectedMode === 'WRITING' ? '✍️' : selectedMode === 'PINYIN' ? '🗣️' : '🧩'}
                </span> 
                {selectedMode === 'WRITING' ? 'Writing Assignments' : 
                 selectedMode === 'PINYIN' ? 'Pinyin Assignments' : 
                 selectedMode === 'FILL_IN_BLANKS' ? 'Fill in Blanks' :
                 'Choose Practice Mode'}
             </h2>
        </div>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
             {/* Loading Illustration */}
             <div className="relative w-64 h-64 mb-6">
                 {/* Decorative Blobs */}
                 <div className="absolute top-10 left-10 w-32 h-32 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-pulse"></div>
                 <div className="absolute top-10 right-10 w-32 h-32 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-pulse" style={{ animationDelay: '1s' }}></div>
                 
                 {/* Main Icon */}
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <div className="text-8xl mb-4 animate-[bounce_1s_infinite]">🎒</div>
                     <div className="w-24 h-3 bg-slate-100 rounded-full overflow-hidden mt-2">
                         <div className="h-full bg-indigo-400 animate-[pulse_1.5s_cubic-bezier(0.4,0,0.6,1)_infinite] w-full origin-left scale-x-50"></div>
                     </div>
                 </div>
             </div>
             
             <h3 className="text-2xl font-extrabold text-slate-700 mb-2">Unpacking Backpack...</h3>
             <p className="text-slate-400 font-bold">Checking for new assignments</p>
          </div>
        ) : (
          <>
             {/* MODE SELECTION SCREEN */}
             {!selectedMode && (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div 
                        onClick={() => setSelectedMode('WRITING')}
                        className="group relative bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-transparent hover:border-indigo-100 transition-all cursor-pointer hover:-translate-y-1 overflow-hidden"
                     >
                         <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                         <div className="relative z-10">
                             <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center text-4xl mb-4 shadow-sm">
                                ✍️
                             </div>
                             <h3 className="text-xl font-extrabold text-slate-800 mb-2">Writing</h3>
                             <p className="text-slate-500 font-bold text-sm">Stroke order & writing.</p>
                         </div>
                     </div>

                     <div 
                        onClick={() => setSelectedMode('PINYIN')}
                        className="group relative bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-transparent hover:border-sky-100 transition-all cursor-pointer hover:-translate-y-1 overflow-hidden"
                     >
                         <div className="absolute top-0 right-0 w-32 h-32 bg-sky-50 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                         <div className="relative z-10">
                             <div className="w-16 h-16 bg-sky-100 text-sky-600 rounded-3xl flex items-center justify-center text-4xl mb-4 shadow-sm">
                                🗣️
                             </div>
                             <h3 className="text-xl font-extrabold text-slate-800 mb-2">Pinyin</h3>
                             <p className="text-slate-500 font-bold text-sm">Tones & recognition.</p>
                         </div>
                     </div>

                     <div 
                        onClick={() => setSelectedMode('FILL_IN_BLANKS')}
                        className="group relative bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-transparent hover:border-purple-100 transition-all cursor-pointer hover:-translate-y-1 overflow-hidden"
                     >
                         <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                         <div className="relative z-10">
                             <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-3xl flex items-center justify-center text-4xl mb-4 shadow-sm">
                                🧩
                             </div>
                             <h3 className="text-xl font-extrabold text-slate-800 mb-2">Fill Blank</h3>
                             <p className="text-slate-500 font-bold text-sm">Vocab & grammar.</p>
                         </div>
                     </div>
                 </div>
             )}

             {/* ASSIGNMENTS LIST SCREEN */}
             {selectedMode && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAssignments.length > 0 ? (
                    filteredAssignments.map((lesson, idx) => {
                        const isDone = isModeDone(lesson, selectedMode);
                        
                        return (
                            <div 
                                key={lesson.id} 
                                className={`group bg-white rounded-[2rem] p-6 shadow-lg border-2 transition-all hover:-translate-y-1 ${
                                    isDone ? 'border-emerald-200 shadow-emerald-100' : 
                                    'border-indigo-100 shadow-indigo-100'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                                        #{idx + 1}
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        {isDone && <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">Completed</span>}
                                        {!isDone && <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold">To Do</span>}
                                    </div>
                                </div>
                                
                                <div className="mb-4">
                                    {renderBadge(lesson.type)}
                                </div>

                                <h3 className="font-bold text-lg text-slate-800 mb-1">{lesson.title}</h3>
                                <p className="text-slate-500 text-sm mb-6 line-clamp-2">{lesson.description}</p>
                                
                                {renderContentPreview(lesson)}
                                
                                <Button 
                                    onClick={() => onStartPractice(lesson, selectedMode)} 
                                    className={`w-full ${isDone ? 'opacity-80' : ''}`}
                                    variant={isDone ? 'outline' : 'primary'}
                                >
                                    {isDone ? 'Practice Again' : 'Start Practice'}
                                </Button>
                            </div>
                        );
                    })
                    ) : (
                    <div className="col-span-full text-center py-16 bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
                        <div className="text-4xl mb-4">💤</div>
                        <p className="text-slate-500 font-bold mb-2">No assignments found for this mode.</p>
                        <Button variant="ghost" onClick={() => setSelectedMode(null)} className="mt-4">
                            Go Back
                        </Button>
                    </div>
                    )}
                </div>
             )}
          </>
        )}
      </section>
    </div>
  );
};