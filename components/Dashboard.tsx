
import React, { useEffect, useState, useRef } from 'react';
import { Lesson, Student, StudentAssignment, PracticeMode, CalendarEvent, StoreItem, PointLogEntry, ClassGoal, RewardRule } from '../types';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { CalendarView } from './CalendarView';
import { StickerStore } from './StickerStore';
import { parseLocalDate } from '../utils/dateUtils';

interface DashboardProps {
  student: Student;
  records: any[]; 
  onStartPractice: (lesson: Lesson, mode: PracticeMode) => void;
  onViewReport: () => void;
  onLogout: () => void;
  onRefreshData?: () => Promise<void>; 
  rewardRules?: RewardRule[];
  onUpdateStudent: (updates: Partial<Student>) => void;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  emoji: string;
  angle: number;
}

export const Dashboard: React.FC<DashboardProps> = ({ student, records, onStartPractice, onViewReport, onLogout, onRefreshData, rewardRules = [], onUpdateStudent }) => {
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  const [statuses, setStatuses] = useState<StudentAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<PracticeMode | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState(0); 
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [activeGoal, setActiveGoal] = useState<ClassGoal | null>(null);
  
  // Sticker Store State
  const [showStore, setShowStore] = useState(false);
  const [storeTab, setStoreTab] = useState<'CATALOG' | 'AI_LAB' | 'COLLECTION'>('CATALOG');

  // Point History State
  const [showPointHistory, setShowPointHistory] = useState(false);
  const [pointLogs, setPointLogs] = useState<PointLogEntry[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);

  // Contribution State
  const [contributing, setContributing] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const contributeBtnRef = useRef<HTMLButtonElement>(null);

  // Local student state to handle point updates immediately without re-fetching everything
  const [localStudent, setLocalStudent] = useState<Student>(student);

  const loadData = async (forceRefresh = false) => {
    if (assignments.length === 0 || forceRefresh) setIsLoading(true);
    
    try {
        const [lessons, statusList, items, goals] = await Promise.all([
            sheetService.getAssignments(forceRefresh),
            sheetService.getAssignmentStatuses(student.id, forceRefresh),
            sheetService.getStoreItems(forceRefresh),
            sheetService.getClassGoals(forceRefresh)
        ]);
        setAssignments(lessons);
        setStatuses(statusList);
        setStoreItems(items);
        
        const active = goals.find(g => g.status === 'ACTIVE' || g.status === 'COMPLETED') || null;
        setActiveGoal(active);
    } catch (e) {
        console.error("Dashboard load failed", e);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => { 
      loadData(true); 
  }, [student.id, student.points]);
  
  useEffect(() => { setLocalStudent(student); }, [student]);

  const handleRefresh = async () => {
      setIsLoading(true);
      if (onRefreshData) await onRefreshData();
      await loadData(true);
  };

  const handleShowPoints = async () => {
      setShowPointHistory(true);
      setLoadingPoints(true);
      const logs = await sheetService.getPointLogs(student.id);
      setPointLogs(logs);
      setLoadingPoints(false);
  };

  const spawnParticles = () => {
      if (!contributeBtnRef.current) return;
      const rect = contributeBtnRef.current.getBoundingClientRect();
      const count = 12;
      const newParticles: Particle[] = [];
      
      for (let i = 0; i < count; i++) {
          newParticles.push({
              id: Date.now() + i,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              emoji: ['🍕', '⭐', '🎉', '🧀', '🥤'][Math.floor(Math.random() * 5)],
              angle: (Math.random() - 0.5) * 60 
          });
      }
      
      setParticles(prev => [...prev, ...newParticles]);
      setTimeout(() => {
          setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
      }, 1500);
  };

  const handleContribute = async (amount: number) => {
      if (!activeGoal) return;
      if (localStudent.points < amount) return;

      setContributing(true);
      const result = await sheetService.contributeToGoal(localStudent.id, amount, activeGoal.id);
      if (result.success && result.points !== undefined && result.goalCurrent !== undefined) {
          // Update both local and parent state to ensure consistency
          const updates = { points: result.points! };
          setLocalStudent(prev => ({ ...prev, ...updates }));
          onUpdateStudent(updates);

          setActiveGoal(prev => prev ? { 
              ...prev, 
              current: result.goalCurrent!, 
              status: (result.goalStatus as 'ACTIVE' | 'COMPLETED') || prev.status
          } : null);
          
          spawnParticles();
      }
      setContributing(false);
  };

  const getStatus = (lessonId: string) => statuses.find(s => s.assignmentId === lessonId)?.status || 'NOT_STARTED';

  const visibleAssignments = assignments.filter(lesson => {
    const today = new Date(); today.setHours(0,0,0,0);
    const start = lesson.startDate ? parseLocalDate(lesson.startDate) : null;
    const end = lesson.endDate ? parseLocalDate(lesson.endDate) : null;

    if (start && today < start) return false;
    if (end && today > end) return false;
    
    if (lesson.assignedTo && lesson.assignedTo.length > 0) {
        if (!lesson.assignedTo.includes(localStudent.id)) return false;
    }

    return true;
  });

  const filteredAssignments = visibleAssignments.filter(lesson => !selectedMode || lesson.type === selectedMode);
  
  const openStore = (tab: 'CATALOG' | 'COLLECTION') => {
      setStoreTab(tab);
      setShowStore(true);
  };

  const isGoalReached = activeGoal && activeGoal.current >= activeGoal.target;

  return (
    <div className="space-y-8 animate-fade-in pb-10 relative">
      {particles.length > 0 && (
          <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
              {particles.map((p, i) => (
                  <div 
                    key={p.id}
                    className="absolute text-2xl animate-float-up"
                    style={{ 
                        left: p.x, 
                        top: p.y,
                        '--tw-translate-x': `${p.angle}px`,
                        '--tw-translate-y': `-${100 + Math.random() * 100}px`,
                        animation: `flyUp 1s ease-out forwards`
                    } as any}
                  >
                      {p.emoji}
                  </div>
              ))}
              <style>{`
                @keyframes flyUp {
                    0% { transform: translate(0, 0) scale(0.5); opacity: 1; }
                    100% { transform: translate(var(--tw-translate-x), var(--tw-translate-y)) scale(1.5); opacity: 0; }
                }
              `}</style>
          </div>
      )}

      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2rem] p-8 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full translate-x-1/3 -translate-y-1/3"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
                <h1 className="text-3xl font-extrabold mb-2">Hello, {localStudent.name}! 👋</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <button 
                        onClick={handleShowPoints}
                        className="px-3 py-1 bg-white/20 rounded-full font-bold text-sm backdrop-blur-md border border-white/20 flex items-center gap-1 hover:bg-white/30 hover:scale-105 transition-all cursor-pointer shadow-sm"
                        title="View History"
                    >
                        ⭐ {localStudent.points} Points
                    </button>
                    <button 
                        onClick={() => openStore('CATALOG')}
                        className="px-3 py-1 bg-white text-indigo-600 rounded-full font-black text-sm hover:bg-indigo-50 transition-colors shadow-lg flex items-center gap-1"
                    >
                        🛍️ Store
                    </button>
                    <button 
                        onClick={() => openStore('COLLECTION')}
                        className="px-3 py-1 bg-amber-400 text-amber-900 rounded-full font-black text-sm hover:bg-amber-300 transition-colors shadow-lg flex items-center gap-1"
                    >
                        📖 My Book
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={() => {
                    if (!showCalendar) setCalendarRefreshTrigger(prev => prev + 1);
                    setShowCalendar(!showCalendar);
                }}>
                    {showCalendar ? '📖 Homework' : '📅 School Calendar'}
                </Button>
                <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={onViewReport}>
                    🏆 My Progress
                </Button>
                <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={onLogout}>
                    Logout
                </Button>
            </div>
        </div>
      </div>
      
      {activeGoal && (
          <div className={`
              rounded-[2rem] p-6 shadow-lg border-4 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden transition-all
              ${isGoalReached ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-orange-300' : 'bg-white border-orange-100'}
          `}>
             <div className="absolute -right-10 -bottom-10 text-9xl opacity-10 rotate-12 pointer-events-none">
                 {isGoalReached ? '🎉' : '🍕'}
             </div>

             <div className="flex items-center gap-4 z-10">
                 <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-5xl shadow-inner ${isGoalReached ? 'bg-orange-400 text-white animate-bounce' : 'bg-orange-100 text-orange-500'}`}>
                    {activeGoal.type === 'PIZZA' ? '🍕' : '🎯'}
                 </div>
                 <div>
                     <h3 className="font-extrabold text-2xl text-slate-800">{activeGoal.title}</h3>
                     <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">
                         {isGoalReached ? 'Goal Reached!' : 'Class Fund'}
                     </p>
                 </div>
             </div>

             <div className="flex-1 w-full z-10">
                 <div className="flex justify-between text-xs font-black text-orange-400 uppercase tracking-wide mb-1">
                     <span>{isGoalReached ? 'PARTY TIME!' : 'Progress'}</span>
                     <span>{activeGoal.current} / {activeGoal.target} Points</span>
                 </div>
                 <div className="h-8 bg-slate-100 rounded-full overflow-hidden shadow-inner relative border-2 border-white">
                     <div 
                        className={`h-full transition-all duration-1000 relative ${isGoalReached ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-orange-400'}`} 
                        style={{ width: `${Math.min(100, (activeGoal.current / activeGoal.target) * 100)}%` }}
                     >
                        <div className="absolute inset-0 bg-white/20 animate-[pulse_2s_infinite]"></div>
                        {isGoalReached && (
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-white tracking-widest">
                                COMPLETED
                            </div>
                        )}
                     </div>
                 </div>
             </div>

             <div className="z-10 flex flex-col items-center">
                 {isGoalReached ? (
                     <div className="px-6 py-3 bg-white border-2 border-orange-200 text-orange-600 font-black rounded-xl shadow-sm">
                         Hooray! 🎉
                     </div>
                 ) : (
                     <>
                        <button 
                            ref={contributeBtnRef}
                            onClick={() => handleContribute(10)}
                            disabled={contributing || localStudent.points < 10}
                            className="px-6 py-3 bg-orange-500 text-white font-bold rounded-xl shadow-[0_4px_0_#c2410c] hover:bg-orange-600 active:scale-95 active:shadow-none active:translate-y-1 disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none disabled:bg-slate-300 transition-all flex items-center gap-2"
                        >
                            {contributing ? 'Giving...' : (
                                <>
                                    <span>Give 10 ⭐</span>
                                </>
                            )}
                        </button>
                        {localStudent.points < 10 && (
                            <span className="text-[10px] text-rose-500 font-bold mt-1 bg-white/80 px-2 py-0.5 rounded">
                                Need 10 pts
                            </span>
                        )}
                     </>
                 )}
             </div>
          </div>
      )}
      
      {showCalendar ? (
          <div className="space-y-6">
             <div className="flex items-center gap-4">
                 <Button variant="ghost" onClick={() => setShowCalendar(false)}>← Back to Homework</Button>
                 <h2 className="text-xl font-extrabold text-slate-800">School Schedule</h2>
             </div>
             <CalendarView refreshTrigger={calendarRefreshTrigger} />
          </div>
      ) : (
          <section>
            <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                 <div className="flex items-center gap-4">
                     {selectedMode && (
                         <Button variant="ghost" onClick={() => setSelectedMode(null)} className="pl-0 text-slate-400">← Back</Button>
                     )}
                     <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                        <span>{!selectedMode ? '🚀' : selectedMode === 'WRITING' ? '✍️' : selectedMode === 'PINYIN' ? '🗣️' : '🧩'}</span> 
                        {selectedMode === 'WRITING' ? 'Writing Assignments' : selectedMode === 'PINYIN' ? 'Pinyin Assignments' : selectedMode === 'FILL_IN_BLANKS' ? 'Sentence Builder' : 'Practice Modes'}
                     </h2>
                 </div>
                 <Button variant="ghost" onClick={handleRefresh} className="text-slate-400">🔄 Sync Status</Button>
            </div>
            
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                 <div className="text-8xl mb-4 animate-bounce">🎒</div>
                 <h3 className="text-2xl font-extrabold text-slate-700">Loading assignments...</h3>
              </div>
            ) : (
              <>
                 {!selectedMode ? (
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                         {[
                             { id: 'WRITING' as PracticeMode, icon: '✍️', label: 'Writing', desc: 'Stroke order practice.', color: 'indigo' },
                             { id: 'PINYIN' as PracticeMode, icon: '🗣️', label: 'Pinyin', desc: 'Tones & recognition.', color: 'sky' },
                             { id: 'FILL_IN_BLANKS' as PracticeMode, icon: '🧩', label: 'Sentence Builder', desc: 'Lego-style grammar.', color: 'purple' }
                         ].map(mode => {
                             const activeCount = visibleAssignments.filter(a => a.type === mode.id && getStatus(a.id) !== 'COMPLETED').length;
                             const totalCount = visibleAssignments.filter(a => a.type === mode.id).length;
                             
                             return (
                                 <div key={mode.id} onClick={() => setSelectedMode(mode.id)} className={`group bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-transparent hover:border-${mode.color}-100 transition-all cursor-pointer hover:-translate-y-1`}>
                                     <div className={`w-16 h-16 bg-${mode.color}-100 rounded-2xl flex items-center justify-center text-4xl mb-4 group-hover:scale-110 transition-transform`}>
                                         {mode.icon}
                                     </div>
                                     <h3 className="text-2xl font-extrabold text-slate-800 mb-2">{mode.label}</h3>
                                     <p className="text-slate-500 font-medium">{mode.desc}</p>
                                     <div className={`mt-6 py-2 px-4 rounded-xl bg-${mode.color}-50 text-${mode.color}-600 font-bold text-sm inline-block`}>
                                         {activeCount > 0 
                                            ? `${activeCount} Task${activeCount === 1 ? '' : 's'} Due` 
                                            : totalCount > 0 ? 'All Done! 🎉' : 'No Tasks'}
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                 ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         {filteredAssignments.length > 0 ? filteredAssignments.map(lesson => {
                             const status = getStatus(lesson.id);
                             const points = lesson.metadata?.points || 30;
                             
                             return (
                                 <div key={lesson.id} className="bg-white rounded-[2.5rem] p-8 shadow-lg border-2 border-slate-100 hover:border-indigo-200 transition-all flex flex-col justify-between">
                                     <div>
                                         <div className="flex justify-between items-start mb-4">
                                             <h3 className="text-xl font-bold text-slate-800 line-clamp-2">{lesson.title}</h3>
                                             {status === 'COMPLETED' ? (
                                                 <span className="text-xl" title="Completed">✅</span>
                                             ) : status === 'IN_PROGRESS' ? (
                                                 <span className="text-xl" title="In Progress">⏳</span>
                                             ) : (
                                                 <span className="text-xl" title="New">🆕</span>
                                             )}
                                         </div>
                                         <p className="text-slate-500 text-sm mb-6 line-clamp-3">{lesson.description || "No description provided."}</p>
                                         <div className="flex items-center gap-2 mb-6">
                                             <div className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                 {lesson.characters.length} Items
                                             </div>
                                             <div className="bg-amber-100 px-3 py-1 rounded-lg text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                                                 ⭐ {points}
                                             </div>
                                             {lesson.endDate && (
                                                 <div className="bg-rose-50 px-3 py-1 rounded-lg text-xs font-bold text-rose-500 uppercase tracking-wider">
                                                     Due {parseLocalDate(lesson.endDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                                 </div>
                                             )}
                                         </div>
                                     </div>
                                     <Button 
                                         onClick={() => onStartPractice(lesson, lesson.type)}
                                         className={`w-full py-3 rounded-xl font-bold shadow-md ${status === 'COMPLETED' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                     >
                                         {status === 'COMPLETED' ? 'Practice Again' : status === 'IN_PROGRESS' ? 'Continue' : 'Start'}
                                     </Button>
                                 </div>
                             );
                         }) : (
                             <div className="col-span-full py-20 text-center text-slate-400">
                                 <div className="text-6xl mb-4 grayscale opacity-30">📭</div>
                                 <p className="text-xl font-bold">No assignments found for this mode.</p>
                                 <Button variant="ghost" onClick={() => setSelectedMode(null)} className="mt-4">Go Back</Button>
                             </div>
                         )}
                     </div>
                 )}
              </>
            )}
          </section>
      )}

      {showPointHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowPointHistory(false)}>
              <div className="bg-white rounded-[2rem] p-6 max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl animate-bounce-in" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                      <div>
                          <h3 className="text-xl font-extrabold text-slate-800">Points History</h3>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Recent Activity</p>
                      </div>
                      <button onClick={() => setShowPointHistory(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold">✕</button>
                  </div>
                  
                  {rewardRules.length > 0 && (
                      <div className="mb-4 bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                          <h4 className="text-xs font-black text-yellow-600 uppercase mb-2 flex items-center gap-1">
                              <span>💡</span> How to Earn Points
                          </h4>
                          <div className="space-y-1">
                              {rewardRules.map(rule => (
                                  <div key={rule.id} className="flex justify-between text-xs font-bold text-yellow-800">
                                      <span>{rule.description}</span>
                                      <span className="bg-yellow-200 px-1.5 rounded text-yellow-900">+{rule.points}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  <div className="flex-1 overflow-y-auto pr-1">
                      {loadingPoints ? (
                          <div className="text-center py-10 text-slate-400 font-bold">Loading...</div>
                      ) : pointLogs.length === 0 ? (
                          <div className="text-center py-10 text-slate-400 font-bold">No history yet.</div>
                      ) : (
                          <div className="space-y-2">
                              {pointLogs.map((log, idx) => (
                                  <div key={idx} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                                      <div>
                                          <div className="font-bold text-slate-700 text-sm">{log.reason}</div>
                                          <div className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleDateString()}</div>
                                      </div>
                                      <div className={`font-black text-lg ${log.delta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                          {log.delta > 0 ? '+' : ''}{log.delta}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {showStore && (
          <StickerStore 
            student={localStudent} 
            onUpdateStudent={(updates) => {
                setLocalStudent(prev => ({ ...prev, ...updates }));
                onUpdateStudent(updates); // Sync with parent App state
            }}
            onClose={() => setShowStore(false)} 
            initialTab={storeTab}
          />
      )}
    </div>
  );
};
