
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useEffect, useState } from 'react';
import { Lesson, Student, StudentAssignment, PracticeMode, PracticeRecord, CalendarEvent, AppView, StoreItem } from '../types';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { convertCharacter } from '../utils/characterConverter';
import { CalendarView } from './CalendarView';
import { StickerStore } from './StickerStore';
import { STICKER_CATALOG } from '../utils/stickerData';

interface DashboardProps {
  student: Student;
  records: PracticeRecord[]; 
  onStartPractice: (lesson: Lesson, mode: PracticeMode) => void;
  onViewReport: () => void;
  onLogout: () => void;
  onRefreshData?: () => Promise<void>; 
}

export const Dashboard: React.FC<DashboardProps> = ({ student, records, onStartPractice, onViewReport, onLogout, onRefreshData }) => {
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  const [statuses, setStatuses] = useState<StudentAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<PracticeMode | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  
  // Sticker Store State
  const [showStore, setShowStore] = useState(false);
  const [storeTab, setStoreTab] = useState<'CATALOG' | 'AI_LAB' | 'COLLECTION'>('CATALOG');

  // Local student state to handle point updates immediately without re-fetching everything
  const [localStudent, setLocalStudent] = useState<Student>(student);

  const loadData = async (forceRefresh = false) => {
    setIsLoading(true);
    // Removed artificial delay for speed
    const [lessons, statusList, items] = await Promise.all([
        sheetService.getAssignments(forceRefresh),
        sheetService.getAssignmentStatuses(student.id, forceRefresh),
        sheetService.getStoreItems(forceRefresh)
    ]);
    setAssignments(lessons);
    setStatuses(statusList);
    setStoreItems(items);
    setIsLoading(false);
  };

  useEffect(() => { loadData(); }, [student.id]);
  useEffect(() => { setLocalStudent(student); }, [student]);

  const handleRefresh = async () => {
      setIsLoading(true);
      if (onRefreshData) await onRefreshData();
      await loadData(true);
  };

  const getStatus = (lessonId: string) => statuses.find(s => s.assignmentId === lessonId)?.status || 'NOT_STARTED';

  const isModeDone = (lesson: Lesson, mode: PracticeMode) => {
     return lesson.characters.every(char => {
         const targetChar = convertCharacter(char, localStudent.scriptPreference);
         return records.some(r => r.character === targetChar && (r.type || 'WRITING') === mode && r.score === 100);
     });
  };

  const visibleAssignments = assignments.filter(lesson => {
    // 1. Check Date Range
    const today = new Date(); today.setHours(0,0,0,0);
    if (lesson.startDate && today < new Date(lesson.startDate)) return false;
    if (lesson.endDate && today > new Date(lesson.endDate)) return false;
    
    // 2. Check "Assigned To" logic
    if (lesson.assignedTo && lesson.assignedTo.length > 0) {
        if (!lesson.assignedTo.includes(localStudent.id)) return false;
    }

    return true;
  });

  const filteredAssignments = visibleAssignments.filter(lesson => !selectedMode || lesson.type === selectedMode);
  
  // MERGE STICKERS: Catalog items (dynamic + legacy) + Custom items
  const myStickers = (localStudent.stickers || []).map(id => {
      // Try dynamic store first
      const storeItem = storeItems.find(s => s.id === id);
      if (storeItem) return { id: storeItem.id, name: storeItem.name, imageUrl: storeItem.imageUrl, type: 'standard' };

      // Try legacy catalog
      const catalogItem = STICKER_CATALOG.find(s => s.id === id);
      if (catalogItem) return { ...catalogItem, type: 'standard' };
      
      // Try custom list
      const customItem = localStudent.customStickers?.find(s => s.id === id);
      if (customItem) return { id: customItem.id, name: customItem.prompt, imageUrl: customItem.dataUrl, type: 'custom' };
      
      return null;
  }).filter(Boolean);

  const openStore = (tab: 'CATALOG' | 'COLLECTION') => {
      setStoreTab(tab);
      setShowStore(true);
  };

  if (showStore) {
      return (
          <StickerStore 
            student={localStudent} 
            onUpdateStudent={(updates) => setLocalStudent(prev => ({ ...prev, ...updates }))}
            onClose={() => setShowStore(false)} 
            initialTab={storeTab}
          />
      );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2rem] p-8 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full translate-x-1/3 -translate-y-1/3"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
                <h1 className="text-3xl font-extrabold mb-2">Hello, {localStudent.name}! 👋</h1>
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-white/20 rounded-full font-bold text-sm backdrop-blur-md border border-white/20 flex items-center gap-1">
                        ⭐ {localStudent.points} Points
                    </span>
                    <button 
                        onClick={() => openStore('CATALOG')}
                        className="px-3 py-1 bg-amber-400 text-amber-900 rounded-full font-black text-sm hover:bg-amber-300 transition-colors shadow-lg"
                    >
                        🛍️ StickerStar
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={() => setShowCalendar(!showCalendar)}>
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
      
      {/* My Stickers Section (Mini) */}
      {myStickers.length > 0 && !showCalendar && (
          <div 
            onClick={() => openStore('COLLECTION')}
            className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 overflow-x-auto cursor-pointer hover:shadow-md transition-shadow group relative"
          >
              <h3 className="text-slate-400 font-bold text-xs uppercase mb-3 tracking-widest flex items-center gap-2">
                  My Collection
                  <span className="bg-indigo-100 text-indigo-500 px-2 rounded-full text-[10px] group-hover:bg-indigo-500 group-hover:text-white transition-colors">Open</span>
              </h3>
              <div className="flex gap-4 pb-2">
                  {myStickers.map((sticker: any, i) => (
                      <div key={i} className="relative group/sticker cursor-pointer hover:scale-110 transition-transform" title={sticker?.name}>
                          {sticker.imageUrl ? (
                              <img src={sticker.imageUrl} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" alt={sticker.name} />
                          ) : (
                              <div className="text-4xl filter drop-shadow-sm sticker-emoji">{sticker.emoji}</div>
                          )}
                      </div>
                  ))}
              </div>
          </div>
      )}

      {showCalendar ? (
          <div className="space-y-6">
             <div className="flex items-center gap-4">
                 <Button variant="ghost" onClick={() => setShowCalendar(false)}>← Back to Homework</Button>
                 <h2 className="text-xl font-extrabold text-slate-800">School Schedule</h2>
             </div>
             <CalendarView />
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
                         ].map(mode => (
                             <div key={mode.id} onClick={() => setSelectedMode(mode.id)} className={`group bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-transparent hover:border-${mode.color}-100 transition-all cursor-pointer hover:-translate-y-1`}>
                                 <div className={`w-16 h-16 bg-${mode.color}-100 text-${mode.color}-600 rounded-3xl flex items-center justify-center text-4xl mb-4`}>{mode.icon}</div>
                                 <h3 className="text-xl font-extrabold text-slate-800">{mode.label}</h3>
                                 <p className="text-slate-500 font-bold text-sm">{mode.desc}</p>
                             </div>
                         ))}
                     </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredAssignments.length > 0 ? (
                        filteredAssignments.map((lesson, idx) => {
                            const isDone = isModeDone(lesson, selectedMode);
                            const status = getStatus(lesson.id);
                            const isCompleted = isDone || status === 'COMPLETED';
                            const isInProgress = status === 'IN_PROGRESS' && !isCompleted;

                            return (
                                <div key={lesson.id} className={`bg-white rounded-[2rem] p-6 shadow-lg border-2 transition-all hover:-translate-y-1 ${isCompleted ? 'border-emerald-200' : isInProgress ? 'border-amber-200' : 'border-indigo-100'}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center font-bold text-slate-400">#{idx + 1}</div>
                                        {isCompleted && <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">Completed</span>}
                                        {isInProgress && <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">Active</span>}
                                    </div>
                                    <h3 className="font-bold text-lg text-slate-800 mb-1">{lesson.title}</h3>
                                    <p className="text-slate-500 text-sm mb-6 line-clamp-2">{lesson.description}</p>
                                    <Button onClick={() => onStartPractice(lesson, selectedMode)} className="w-full" variant={isCompleted ? 'outline' : 'primary'}>
                                        {isCompleted ? 'Practice Again' : isInProgress ? 'Continue' : 'Start'}
                                    </Button>
                                </div>
                            );
                        })
                        ) : (
                        <div className="col-span-full text-center py-16 bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
                            <p className="text-slate-500 font-bold mb-4">No assignments yet. Take a break! ☕</p>
                            <Button variant="ghost" onClick={() => setSelectedMode(null)}>Back to Modes</Button>
                        </div>
                        )}
                    </div>
                 )}
              </>
            )}
          </section>
      )}
    </div>
  );
};
