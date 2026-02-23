
import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { Lesson, StudentSummary, CalendarEvent, CalendarEventType, StoreItem, LoginLog, ClassGoal, ContributionLog, RewardRule, Sticker } from '../types';
import { CalendarView } from './CalendarView';
import { generateSticker, generateDictionaryEntry } from '../services/geminiService';
import { STICKER_CATALOG, convertDriveLink, convertAudioDriveLink } from '../utils/stickerData';
import { playAudioUrl } from '../services/geminiService';
import { parseLocalDate } from '../utils/dateUtils';

interface TeacherDashboardProps {
  onLogout: () => void;
  onOpenSetup: () => void;
  onUpdateTheme: (bg: string) => void;
  onResetTheme: () => void;
}

type TabType = 'create' | 'progress' | 'assignments' | 'calendar' | 'rewards' | 'logs' | 'dictionary';

// Client-side resizing optimized for uploads
const resizeImage = (base64Str: string, maxWidth = 200): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`;
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png', 0.8));
      } else {
          resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

const CollectionModal = ({ student, onClose }: { student: StudentSummary, onClose: () => void }) => {
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  
  useEffect(() => {
    sheetService.getStoreItems().then(setStoreItems);
  }, []);

  const ownedStandard = [...storeItems, ...STICKER_CATALOG].filter(s => (student.stickers || []).includes(s.id));
  const uniqueStandard = Array.from(new Set(ownedStandard.map(s => s.id))).map(id => ownedStandard.find(s => s.id === id)).filter(Boolean);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-indigo-500/20 backdrop-blur-lg p-4 animate-fade-in" onClick={onClose}>
        <div className="bg-white rounded-[2rem] p-8 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl animate-bounce-in border-4 border-white/20" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-2xl font-extrabold text-slate-800">{student.name}'s Collection</h3>
                    <p className="text-slate-400 font-bold text-sm">Stickers & Creations</p>
                </div>
                <button onClick={onClose} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2">
                <div className="space-y-8">
                    {uniqueStandard.length > 0 && (
                        <div>
                            <h4 className="text-slate-400 font-bold text-xs uppercase mb-3">Store Stickers</h4>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                                {uniqueStandard.map((s, idx) => (
                                    <div key={`${s!.id}-${idx}`} className="aspect-square bg-white rounded-2xl flex items-center justify-center border-2 border-slate-100 p-2 relative">
                                        {s!.imageUrl ? (
                                            <img src={convertDriveLink(s!.imageUrl || '')} className="w-full h-full object-contain" alt={s!.name} />
                                        ) : (
                                            <div className="text-4xl select-none">{(s as any).emoji}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {student.customStickers && student.customStickers.length > 0 && (
                        <div>
                            <h4 className="text-purple-400 font-bold text-xs uppercase mb-3">AI Creations / Gifts</h4>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                                {student.customStickers.map((s, idx) => (
                                    <div key={idx} className="aspect-square bg-purple-50 rounded-2xl border-2 border-purple-100 overflow-hidden relative group">
                                        {/* Use object-contain and padding to ensure full visibility without clicking */}
                                        <img src={s.dataUrl} alt={s.prompt} className="w-full h-full object-contain p-2" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                                            <span className="text-[10px] text-white font-bold leading-tight">{s.prompt}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {uniqueStandard.length === 0 && (!student.customStickers || student.customStickers.length === 0) && (
                        <div className="text-center py-20 text-slate-400 font-bold">
                            No stickers yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onLogout, onOpenSetup, onUpdateTheme, onResetTheme }) => {
  const [activeTab, setActiveTab] = useState<TabType>('create');
  const [isClassOpen, setIsClassOpen] = useState(true);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  
  // Homework State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [chars, setChars] = useState('');
  const [type, setType] = useState<'WRITING' | 'PINYIN' | 'FILL_IN_BLANKS'>('WRITING');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
     const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0];
  });
  const [assignmentPoints, setAssignmentPoints] = useState<number>(30); // Default points
  const [customAudioMap, setCustomAudioMap] = useState<Record<string, string>>({});
  const [currentAssignedTo, setCurrentAssignedTo] = useState<string[]>([]); // Preserve assignments when editing

  // Dictionary State
  const [dictionary, setDictionary] = useState<Record<string, {pinyin: string, definition: string, audio: string}>>({});
  const [dictChar, setDictChar] = useState('');
  const [dictPinyin, setDictPinyin] = useState('');
  const [dictDef, setDictDef] = useState('');
  const [dictAudio, setDictAudio] = useState('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [altScript, setAltScript] = useState<{simp: string, trad: string} | null>(null); // New state for script preview
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rewards Tab State
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [rewardMode, setRewardMode] = useState<'POINTS' | 'STICKER' | 'STORE' | 'RULES'>('POINTS');
  const [rewardPoints, setRewardPoints] = useState(5);
  const [rewardReason, setRewardReason] = useState("Good Job!");
  const [selectedSticker, setSelectedSticker] = useState<StoreItem | Sticker | null>(null);
  const [previewSticker, setPreviewSticker] = useState<StoreItem | Sticker | null>(null);
  const [viewingStudent, setViewingStudent] = useState<StudentSummary | null>(null);
  const [activeGoals, setActiveGoals] = useState<ClassGoal[]>([]);
  const [recentContributions, setRecentContributions] = useState<ContributionLog[]>([]);
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([]);
  
  // Sales Report State
  const [showSalesReport, setShowSalesReport] = useState(false);
  const [salesData, setSalesData] = useState<{date: string, studentName: string, stickerId: string, cost: number}[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Calendar State
  const [calEventId, setCalEventId] = useState<string | null>(null);
  const [calDate, setCalDate] = useState(new Date().toISOString().split('T')[0]);
  const [calTitle, setCalTitle] = useState('');
  const [calType, setCalType] = useState<CalendarEventType>('SCHOOL_DAY');
  const [calDesc, setCalDesc] = useState('');
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState(0);

  // Store Management State
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreUrl, setNewStoreUrl] = useState('');
  const [newStoreCost, setNewStoreCost] = useState(100);
  const [newStoreCategory, setNewStoreCategory] = useState('');

  // Logs State
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);

  // Add Student State
  const [newStudentName, setNewStudentName] = useState('');
  const [isAddingStudent, setIsAddingStudent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [lastSuccess, setLastSuccess] = useState('');
  const [lastError, setLastError] = useState('');

  const [studentData, setStudentData] = useState<StudentSummary[]>([]);
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  
  // On mount
  useEffect(() => {
    const fetchStudents = async () => {
        const data = await sheetService.getAllStudentProgress(false);
        setStudentData(data);
    };
    const fetchStatus = async () => {
        setIsLoadingStatus(true);
        const { isOpen } = await sheetService.getClassStatus();
        setIsClassOpen(isOpen);
        setIsLoadingStatus(false);
    };
    fetchStudents();
    fetchStatus();
  }, []);

  useEffect(() => {
      loadTabData();
  }, [activeTab]);

  useEffect(() => {
      if (viewingStudent) {
          const fresh = studentData.find(s => s.id === viewingStudent.id);
          if (fresh) setViewingStudent(fresh);
      }
  }, [studentData]);

  const loadTabData = async () => {
      setIsLoadingData(true);
      if (activeTab === 'progress' || activeTab === 'rewards') {
          // Force refresh student data when in these tabs to show latest list
          const students = await sheetService.getAllStudentProgress(true);
          setStudentData(students);
          
          if (activeTab === 'rewards') {
              const [items, goals, contributions, rules] = await Promise.all([
                  sheetService.getStoreItems(true),
                  sheetService.getClassGoals(true),
                  sheetService.getRecentGoalContributions(true),
                  sheetService.getRewardRules(true)
              ]);
              setStoreItems(items);
              setActiveGoals(goals);
              setRecentContributions(contributions);
              setRewardRules(rules);
          }
      }
      else if (activeTab === 'assignments') {
          setAssignments(await sheetService.getAssignments(true));
      }
      else if (activeTab === 'logs') {
          setLoginLogs(await sheetService.getLoginLogs(true));
      }
      else if (activeTab === 'dictionary') {
          const dict = await sheetService.getFullDictionary(true);
          setDictionary(dict);
      }
      setIsLoadingData(false);
  };

  const loadSalesReport = async () => {
      setLoadingSales(true);
      setShowSalesReport(true);
      const data = await sheetService.getPurchaseReport();
      setSalesData(data);
      setLoadingSales(false);
  };

  const handleToggleClassStatus = async () => {
      const newState = !isClassOpen;
      setIsClassOpen(newState);
      const result = await sheetService.setClassStatus(newState);
      if (!result.success) {
          setIsClassOpen(!newState);
          alert("Failed to update status");
      }
  };

  const handleResetForm = () => {
      setEditingId(null);
      setTitle('');
      setDesc('');
      setChars('');
      setType('WRITING');
      setStartDate(new Date().toISOString().split('T')[0]);
      const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
      setEndDate(nextWeek.toISOString().split('T')[0]);
      setAssignmentPoints(30); // Reset points
      setCustomAudioMap({});
      setCurrentAssignedTo([]);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newStudentName.trim()) return;
      
      setIsAddingStudent(true);
      const result = await sheetService.addStudent(newStudentName.trim());
      setIsAddingStudent(false);
      
      if (result.success) {
          setLastSuccess("Student Added! They can now login.");
          setNewStudentName('');
          // Refresh list
          const students = await sheetService.getAllStudentProgress(true);
          setStudentData(students);
          setTimeout(() => setLastSuccess(''), 3000);
      } else {
          setLastError(result.message || "Failed to add student.");
          setTimeout(() => setLastError(''), 3000);
      }
  };

  const handleCreateOrUpdateHomework = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      
      let charList: string[] = [];
      if (type === 'FILL_IN_BLANKS') {
          charList = chars.split('\n').map(s => s.trim()).filter(Boolean);
      } else {
          charList = chars.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      }

      const lesson: Lesson = {
          id: editingId || `lesson-${Date.now()}`,
          title,
          description: desc,
          characters: charList,
          type,
          startDate,
          endDate,
          assignedTo: editingId ? currentAssignedTo : [], // Preserve assignments when editing
          metadata: { 
              customAudio: customAudioMap,
              points: assignmentPoints
          }
      };

      let res;
      if (editingId) {
          res = await sheetService.editAssignment(lesson);
      } else {
          res = await sheetService.createAssignment(lesson);
      }

      if (res.success) {
          setLastSuccess("Assignment Saved!");
          if (!editingId) {
             handleResetForm();
          }
          await loadTabData();
          setTimeout(() => setLastSuccess(''), 3000);
      } else {
          setLastError("Failed to save assignment.");
      }
      setIsSubmitting(false);
  };

  const handleDeleteAssignment = async (id: string) => {
      if(!confirm("Are you sure?")) return;
      await sheetService.deleteAssignment(id);
      await loadTabData();
  };

  const handleEditAssignment = (lesson: Lesson) => {
      // 1. Set State immediately
      setEditingId(lesson.id);
      setTitle(lesson.title);
      setDesc(lesson.description);
      // Ensure safe join
      const joinedChars = (lesson.characters || []).join('\n');
      setChars(joinedChars);
      
      setType(lesson.type);
      setStartDate(lesson.startDate ? lesson.startDate.split('T')[0] : '');
      setEndDate(lesson.endDate ? lesson.endDate.split('T')[0] : '');
      setCustomAudioMap(lesson.metadata?.customAudio || {});
      setAssignmentPoints(lesson.metadata?.points || 30);
      setCurrentAssignedTo(lesson.assignedTo || []);
      
      // 2. Switch Tab
      setActiveTab('create');
      
      // 3. Scroll to top
      setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      if (file.size > 2000000) { alert("File too large. < 2MB only."); return; }
      setIsUploadingAudio(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          if (base64) {
              const result = await sheetService.uploadMedia(base64);
              if (result.success && result.url) {
                  setDictAudio(result.url);
                  setLastSuccess("Audio Uploaded!");
              } else {
                  setLastError("Upload failed: " + result.message);
              }
          }
          setIsUploadingAudio(false);
      };
      reader.readAsDataURL(file);
  };

  const handleAutoFill = async () => {
      if (!dictChar) return;
      setIsSubmitting(true);
      setAltScript(null);
      try {
          const data = await generateDictionaryEntry(dictChar);
          if (data) {
              setDictPinyin(data.pinyin);
              setDictDef(data.definition);
              // Auto-set audio path if not present. Use lowercased clean pinyin.
              if (!dictAudio) {
                  setDictAudio(`/audio/${data.pinyin.toLowerCase().replace(/\s+/g,'')}.mp3`);
              }
              setAltScript({ simp: data.simplified, trad: data.traditional });
              setLastSuccess("AI Data Generated!");
              setTimeout(() => setLastSuccess(''), 3000);
          } else {
              setLastError("AI Generation Failed");
              setTimeout(() => setLastError(''), 3000);
          }
      } catch(e: any) {
          setLastError("Error: " + e.message);
      }
      setIsSubmitting(false);
  };

  const handleAddToDictionary = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!dictChar) return;
      setIsSubmitting(true);
      const result = await sheetService.addToDictionary({
          character: dictChar,
          pinyin: dictPinyin,
          definition: dictDef,
          audioUrl: dictAudio
      });
      if (result.success) {
          setLastSuccess("Added to Dictionary!");
          setDictChar(''); setDictPinyin(''); setDictDef(''); setDictAudio(''); setAltScript(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          await loadTabData();
      } else {
          setLastError("Failed to save.");
      }
      setIsSubmitting(false);
  };

  const handleDeleteFromDictionary = async (char: string) => {
      if (!confirm(`Delete "${char}"?`)) return;
      await sheetService.deleteFromDictionary(char);
      await loadTabData();
  };

  const handleTestAudio = async () => {
      if (!dictAudio) return;
      try {
          const url = dictAudio.startsWith('/') ? dictAudio : convertAudioDriveLink(dictAudio);
          const success = await playAudioUrl(url);
          if (!success) {
              alert("Audio Play Error: Could not play audio from " + url);
          }
      } catch (e: any) {
          alert("Invalid URL: " + e.message);
      }
  };

  const setLocalAudio = () => {
      if (!dictPinyin) {
          alert("Please enter pinyin first.");
          return;
      }
      const clean = dictPinyin.trim().toLowerCase().replace(/\s+/g, '');
      setDictAudio(`/audio/${clean}.mp3`);
  };

  const toggleStudent = (id: string) => {
      const newSet = new Set(selectedStudentIds);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setSelectedStudentIds(newSet);
  };

  const toggleSelectAll = () => {
      if (selectedStudentIds.size === studentData.length) setSelectedStudentIds(new Set());
      else setSelectedStudentIds(new Set(studentData.map(s => s.id)));
  };

  const handleGivePoints = async () => {
      if (selectedStudentIds.size === 0) return;
      setIsSubmitting(true);
      await sheetService.adminGivePoints(Array.from(selectedStudentIds), rewardPoints, rewardReason);
      setLastSuccess(`Awarded ${rewardPoints} points!`);
      await loadTabData();
      setIsSubmitting(false);
      setTimeout(() => setLastSuccess(''), 3000);
  };

  const handleGiveSticker = async () => {
      if (selectedStudentIds.size === 0 || !selectedSticker) return;
      setIsSubmitting(true);
      
      const stickerPayload = {
          id: selectedSticker.id, // IMPORTANT: Sending ID tells backend this is a standard sticker, not a new custom creation
          dataUrl: selectedSticker.imageUrl || (selectedSticker as any).emoji || '',
          prompt: selectedSticker.name
      };
      
      await sheetService.adminGiveSticker(Array.from(selectedStudentIds), stickerPayload);
      setLastSuccess(`Sent ${selectedSticker.name} sticker!`);
      setSelectedSticker(null); // Clear selection after sending
      await loadTabData();
      setIsSubmitting(false);
      setTimeout(() => setLastSuccess(''), 3000);
  };

  const handleAddStoreItem = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      await sheetService.addStoreItem({ name: newStoreName, imageUrl: newStoreUrl, cost: newStoreCost, category: newStoreCategory || 'Misc.' });
      setLastSuccess("Item Added!");
      setNewStoreName(''); setNewStoreUrl(''); setNewStoreCost(100);
      await loadTabData();
      setIsSubmitting(false);
  };

  const handleDeleteStoreItem = async (id: string) => {
      if(!confirm("Delete this item?")) return;
      await sheetService.deleteStoreItem(id);
      await loadTabData();
  };

  const handleTogglePermission = async (studentId: string, canCreate: boolean) => {
      await sheetService.updateStudentPermission(studentId, canCreate);
      await loadTabData();
  };

  const handleCreatePizzaParty = async () => {
      if(!confirm("Start a new Pizza Party goal?")) return;
      await sheetService.createClassGoal("Pizza Party", 500);
      await loadTabData();
  };

  const handleDeleteGoal = async (id: string) => {
      await sheetService.deleteClassGoal(id);
      await loadTabData();
  };

  const handleToggleGoal = async (id: string, currentStatus: string) => {
      const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      await sheetService.toggleClassGoalStatus(id, newStatus);
      await loadTabData();
  };

  // --- Calendar Handlers ---
  const handleDateSelect = (date: Date) => {
      // Adjust for timezone offset to prevent date shifting
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - (offset*60*1000));
      setCalDate(localDate.toISOString().split('T')[0]);
      
      setCalEventId(null);
      setCalTitle('');
      setCalType('SCHOOL_DAY');
      setCalDesc('');
  };

  const handleEventClick = (event: CalendarEvent) => {
      setCalEventId(event.id);
      setCalDate(event.date); // already YYYY-MM-DD string
      setCalTitle(event.title);
      setCalType(event.type);
      setCalDesc(event.description || '');
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!calTitle || !calDate) return;
      
      setIsSubmitting(true);
      const payload = {
          id: calEventId || `evt-${Date.now()}`,
          date: calDate,
          title: calTitle,
          type: calType,
          description: calDesc
      };
      await sheetService.saveCalendarEvent(payload);
      setLastSuccess(calEventId ? "Event Updated" : "Event Created");
      setCalendarRefreshTrigger(prev => prev + 1);
      
      // Reset form
      setCalEventId(null); setCalTitle(''); setCalDesc('');
      setIsSubmitting(false);
      setTimeout(() => setLastSuccess(''), 3000);
  };

  const handleDeleteEvent = async () => {
      if (!calEventId || !confirm("Delete this event?")) return;
      setIsSubmitting(true);
      await sheetService.deleteCalendarEvent(calEventId);
      setLastSuccess("Event Deleted");
      setCalendarRefreshTrigger(prev => prev + 1);
      
      setCalEventId(null); setCalTitle(''); setCalDesc('');
      setIsSubmitting(false);
      setTimeout(() => setLastSuccess(''), 3000);
  };

  // --- UI Components ---
  const SectionHeader = ({ title, subtitle, rightElement }: { title: string, subtitle?: string, rightElement?: React.ReactNode }) => (
      <div className="mb-8 border-b-2 border-slate-100 pb-4 flex justify-between items-start">
          <div>
              <h2 className="text-3xl font-extrabold text-slate-700 tracking-tight">{title}</h2>
              {subtitle && <p className="text-slate-500 font-medium text-lg mt-2">{subtitle}</p>}
          </div>
          {rightElement}
      </div>
  );

  const InputLabel = ({ label }: { label: string }) => (
      <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2 ml-1">{label}</label>
  );

  // Derived categories for the datalist (always dynamically updated)
  const existingCategories = Array.from(new Set(storeItems.map(i => i.category || 'Misc.'))).sort();

  // STICKER PREVIEW MODAL RENDERER
  const renderStickerPreview = () => {
    if (!previewSticker) return null;
    const imageUrl = previewSticker.imageUrl;
    const emoji = (previewSticker as any).emoji;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setPreviewSticker(null)}>
            <div className="bg-white rounded-[2rem] p-6 max-w-sm w-full shadow-2xl relative border-4 border-white animate-bounce-in" onClick={e => e.stopPropagation()}>
                <button onClick={() => setPreviewSticker(null)} className="absolute top-4 right-4 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 font-bold">✕</button>
                
                <div className="text-center mt-2">
                    <h3 className="text-2xl font-extrabold text-slate-800 mb-6">{previewSticker.name}</h3>
                    
                    <div className="aspect-square bg-slate-50 rounded-[2rem] border-4 border-slate-100 p-8 flex items-center justify-center mb-6 relative overflow-hidden">
                         <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                         
                         {imageUrl ? (
                             <img src={convertDriveLink(imageUrl)} className="w-full h-full object-contain filter drop-shadow-lg" alt={previewSticker.name} />
                         ) : (
                             <div className="text-9xl drop-shadow-xl select-none">{emoji}</div>
                         )}
                    </div>

                    {rewardMode === 'STICKER' && (
                        <Button 
                            className="w-full py-3 text-lg" 
                            onClick={() => {
                                setSelectedSticker(previewSticker);
                                setPreviewSticker(null);
                            }}
                        >
                            Select for Gift
                        </Button>
                    )}
                    
                    {rewardMode === 'STORE' && (
                       <div className="text-sm font-bold text-slate-400 uppercase tracking-widest bg-slate-100 py-2 rounded-xl">Preview Mode</div>
                    )}
                </div>
            </div>
        </div>
    )
  }

  // --- SALES REPORT RENDERER ---
  const renderSalesReport = () => {
      if (!showSalesReport) return null;

      // Group data for stats
      const totalRevenue = salesData.reduce((acc, curr) => acc + curr.cost, 0);
      
      const popularity: Record<string, number> = {};
      salesData.forEach(p => { popularity[p.stickerId] = (popularity[p.stickerId] || 0) + 1; });
      
      const sortedStickers = Object.entries(popularity).sort((a,b) => b[1] - a[1]).slice(0, 5);
      
      // Determine category breakdown
      const categoryCounts: Record<string, number> = {};
      salesData.forEach(p => {
          const item = storeItems.find(s => s.id === p.stickerId);
          const cat = item?.category || 'Misc.';
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      const sortedCategories = Object.entries(categoryCounts).sort((a,b) => b[1] - a[1]);

      return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-indigo-900/30 backdrop-blur-md p-4 animate-fade-in" onClick={() => setShowSalesReport(false)}>
              <div className="bg-white rounded-[2rem] p-8 max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl animate-slide-up border-4 border-white/50" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6 shrink-0">
                      <div>
                          <h3 className="text-3xl font-extrabold text-slate-800">Store Analytics</h3>
                          <p className="text-slate-400 font-bold">Purchase History & Trends</p>
                      </div>
                      <button onClick={() => setShowSalesReport(false)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">✕</button>
                  </div>

                  {loadingSales ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                          <div className="animate-spin text-4xl mb-4">🔄</div>
                          <div className="font-bold">Crunching Numbers...</div>
                      </div>
                  ) : (
                      <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                          
                          {/* Left Col: Stats */}
                          <div className="space-y-6">
                              <div className="bg-emerald-50 p-6 rounded-2xl border-2 border-emerald-100">
                                  <div className="text-sm font-black text-emerald-600 uppercase tracking-wide">Total Sales</div>
                                  <div className="text-4xl font-extrabold text-emerald-800 mt-2">{salesData.length} Items</div>
                                  <div className="text-sm font-bold text-emerald-600 mt-1">
                                      Generating <span className="text-emerald-800">{totalRevenue} Points</span>
                                  </div>
                              </div>

                              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                                  <div className="text-sm font-black text-slate-400 uppercase tracking-wide mb-4">Top Sellers</div>
                                  <div className="space-y-3">
                                      {sortedStickers.map(([id, count], idx) => {
                                          const item = storeItems.find(s => s.id === id);
                                          return (
                                              <div key={id} className="flex items-center gap-3">
                                                  <div className="font-black text-slate-300 w-4">#{idx+1}</div>
                                                  <div className="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0">
                                                      {item?.imageUrl ? <img src={convertDriveLink(item.imageUrl)} className="w-full h-full object-contain p-0.5"/> : (item as any)?.emoji || '📦'}
                                                  </div>
                                                  <div className="flex-1 truncate text-sm font-bold text-slate-700">{item?.name || id}</div>
                                                  <div className="text-xs font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">{count}</div>
                                              </div>
                                          );
                                      })}
                                      {sortedStickers.length === 0 && <div className="text-slate-400 text-sm">No sales yet.</div>}
                                  </div>
                              </div>

                              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                                  <div className="text-sm font-black text-slate-400 uppercase tracking-wide mb-4">Top Categories</div>
                                  <div className="flex flex-wrap gap-2">
                                      {sortedCategories.map(([cat, count]) => (
                                          <div key={cat} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                                              <span className="text-xs font-bold text-slate-600">{cat}</span>
                                              <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-1.5 rounded-full">{count}</span>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          </div>

                          {/* Right Col: Transaction Log */}
                          <div className="md:col-span-2 bg-white rounded-2xl border-2 border-slate-100 overflow-hidden flex flex-col">
                              <div className="bg-slate-50 p-4 border-b border-slate-100 font-bold text-slate-500 text-sm flex justify-between">
                                  <span>Transaction Log</span>
                                  <span>{salesData.length} records</span>
                              </div>
                              <div className="flex-1 overflow-y-auto">
                                  <table className="w-full text-left text-sm">
                                      <thead className="bg-white sticky top-0 z-10 shadow-sm">
                                          <tr>
                                              <th className="p-4 font-bold text-slate-400">Date</th>
                                              <th className="p-4 font-bold text-slate-400">Student</th>
                                              <th className="p-4 font-bold text-slate-400">Item</th>
                                              <th className="p-4 font-bold text-slate-400 text-right">Cost</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                          {salesData.map((tx, i) => {
                                              const item = storeItems.find(s => s.id === tx.stickerId);
                                              return (
                                                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                      <td className="p-4 text-slate-500 font-medium whitespace-nowrap">
                                                          {new Date(tx.date).toLocaleDateString()}
                                                      </td>
                                                      <td className="p-4 font-bold text-slate-700">{tx.studentName}</td>
                                                      <td className="p-4">
                                                          <div className="flex items-center gap-2">
                                                              <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                                                  {item?.imageUrl ? <img src={convertDriveLink(item.imageUrl)} className="w-full h-full object-contain"/> : (item as any)?.emoji || '📦'}
                                                              </div>
                                                              <span className="font-bold text-slate-600 truncate max-w-[120px]">{item?.name || tx.stickerId}</span>
                                                          </div>
                                                      </td>
                                                      <td className="p-4 text-right font-black text-amber-500">
                                                          -{tx.cost}
                                                      </td>
                                                  </tr>
                                              );
                                          })}
                                          {salesData.length === 0 && (
                                              <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold">No purchases found.</td></tr>
                                          )}
                                      </tbody>
                                  </table>
                              </div>
                          </div>

                      </div>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-8 pb-20 font-nunito bg-[#f8fafc] min-h-screen p-6">
      {/* Sticker Modal */}
      {renderStickerPreview()}
      {/* Sales Report Modal */}
      {renderSalesReport()}

      {/* Top Nav */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 sticky top-4 z-40">
        <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-4xl border border-indigo-100 text-indigo-500">🍎</div>
            <div>
                <h1 className="text-2xl font-extrabold text-slate-700">Teacher Portal</h1>
                <p className="text-slate-400 font-bold">Class Management</p>
            </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all cursor-pointer select-none ${isClassOpen ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`} onClick={handleToggleClassStatus}>
                {isLoadingStatus ? (
                    <span className="text-slate-400 text-sm font-bold">Checking...</span>
                ) : (
                    <>
                        <div className={`w-3 h-3 rounded-full ${isClassOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                        <div className={`text-sm font-black uppercase ${isClassOpen ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {isClassOpen ? 'Class Open' : 'Class Closed'}
                        </div>
                    </>
                )}
            </div>
            <Button variant="ghost" onClick={onOpenSetup} className="text-slate-500 hover:bg-slate-50 hover:text-slate-700">⚙️ Settings</Button>
            <Button variant="outline" onClick={onLogout} className="border-slate-300 text-slate-600 hover:bg-slate-50">Log Out</Button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="bg-white p-3 rounded-[2rem] flex flex-wrap gap-3 justify-center shadow-sm border border-slate-200">
          {[
              { id: 'create', label: 'Create Task', icon: '✨' },
              { id: 'calendar', label: 'Calendar', icon: '📅' },
              { id: 'progress', label: 'Progress', icon: '📊' },
              { id: 'dictionary', label: 'Dictionary', icon: '📖' },
              { id: 'rewards', label: 'Rewards', icon: '🎁' },
              { id: 'assignments', label: 'Library', icon: '📚' },
              { id: 'logs', label: 'Activity', icon: '🕒' },
          ].map(tab => (
              <button 
                key={tab.id} 
                className={`
                    px-8 py-4 rounded-2xl font-bold text-lg transition-all flex items-center gap-3
                    ${activeTab === tab.id 
                        ? 'bg-indigo-50 text-indigo-700 shadow-inner border border-indigo-100 ring-2 ring-indigo-100 ring-offset-2' 
                        : 'bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
                `}
                onClick={() => setActiveTab(tab.id as TabType)}
              >
                  <span className="text-2xl">{tab.icon}</span>
                  {tab.label}
              </button>
          ))}
      </div>
      
      {(lastSuccess || lastError) && (
          <div className={`p-6 rounded-2xl text-center text-lg font-bold animate-bounce-in shadow-sm border-l-8 ${lastSuccess ? 'bg-emerald-50 text-emerald-700 border-emerald-400' : 'bg-rose-50 text-rose-700 border-rose-400'}`}>
              {lastSuccess || lastError}
          </div>
      )}

      {/* CREATE TAB */}
      {activeTab === 'create' && (
          <div className="max-w-3xl mx-auto bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <SectionHeader 
                title={editingId ? "Edit Assignment" : "Create New Task"} 
                subtitle="Assign work to your students." 
                rightElement={editingId ? (
                    <Button variant="secondary" size="sm" onClick={handleResetForm}>
                        + New
                    </Button>
                ) : undefined}
              />
              <form onSubmit={handleCreateOrUpdateHomework} className="space-y-6">
                  <div><InputLabel label="Title" /><input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-indigo-400" placeholder="Week 1 Homework" required /></div>
                  <div><InputLabel label="Description" /><textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-indigo-400" placeholder="Practice these words..." rows={2} /></div>
                  
                  <div className="grid grid-cols-2 gap-6">
                      <div>
                          <InputLabel label="Type" />
                          <div className="flex gap-2">
                              {['WRITING', 'PINYIN', 'FILL_IN_BLANKS'].map(t => (
                                  <button key={t} type="button" onClick={() => setType(t as any)} className={`flex-1 py-3 rounded-xl font-bold text-xs ${type === t ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                      {t === 'FILL_IN_BLANKS' ? 'SENTENCE' : t}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <div>
                          <InputLabel label="Due Date" />
                          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-indigo-400" />
                      </div>
                  </div>

                  {/* Points Input - Enhanced */}
                  <div>
                      <InputLabel label="Points Reward" />
                      <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border-2 border-slate-200 w-fit">
                              <span className="text-xl">⭐</span>
                              <input 
                                type="number" 
                                min="1" 
                                max="1000"
                                value={assignmentPoints} 
                                onChange={e => setAssignmentPoints(Number(e.target.value))} 
                                className="w-20 bg-transparent font-black text-lg outline-none text-amber-500" 
                              />
                          </div>
                          {/* Quick Presets */}
                          <div className="flex gap-2">
                              {[5, 10, 20, 50].map(pt => (
                                  <button
                                    key={pt}
                                    type="button"
                                    onClick={() => setAssignmentPoints(pt)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${assignmentPoints === pt ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-slate-400 border-slate-200 hover:border-amber-200'}`}
                                  >
                                      {pt} pts
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>

                  <div>
                      <InputLabel label={type === 'FILL_IN_BLANKS' ? "Sentences (One per line, use # for blanks)" : "Characters (Comma or space separated)"} />
                      <textarea value={chars} onChange={e => setChars(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-lg text-slate-900 outline-none focus:border-indigo-400" rows={5} placeholder={type === 'FILL_IN_BLANKS' ? "我#是#学生\n你好#吗" : "你, 好, 吗"} required />
                  </div>

                  <div className="flex gap-4 pt-4">
                      {editingId && <Button type="button" variant="ghost" onClick={handleResetForm}>Cancel Edit</Button>}
                      <Button type="submit" isLoading={isSubmitting} className="flex-1 text-lg">Save Assignment</Button>
                  </div>
              </form>
          </div>
      )}

      {/* DICTIONARY TAB */}
      {activeTab === 'dictionary' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                  <SectionHeader title="Add Word" subtitle="Build your audio library." />
                  <form onSubmit={handleAddToDictionary} className="space-y-6">
                      <div>
                          <InputLabel label="Character" />
                          <div className="flex gap-2">
                              <input value={dictChar} onChange={e => setDictChar(e.target.value)} placeholder="e.g. 你好" className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-indigo-400" required />
                              <Button type="button" onClick={handleAutoFill} disabled={isSubmitting || !dictChar} variant="secondary" title="Auto-Fill Pinyin, Definition & Audio" className="whitespace-nowrap px-4">
                                  ✨ Auto-Fill
                              </Button>
                          </div>
                          {altScript && (
                              <div className="text-xs text-slate-400 font-bold mt-2 bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col gap-1 animate-fade-in">
                                  <div className="flex justify-between"><span>Simplified:</span> <span className="text-slate-600">{altScript.simp}</span></div>
                                  <div className="flex justify-between"><span>Traditional:</span> <span className="text-slate-600">{altScript.trad}</span></div>
                              </div>
                          )}
                      </div>
                      <div><InputLabel label="Pinyin (Optional)" /><input value={dictPinyin} onChange={e => setDictPinyin(e.target.value)} placeholder="e.g. ni3 hao3" className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-indigo-400" /></div>
                      <div><InputLabel label="Definition (Optional)" /><input value={dictDef} onChange={e => setDictDef(e.target.value)} placeholder="e.g. Hello" className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-indigo-400" /></div>
                      <div>
                          <InputLabel label="Audio (Upload or Link)" />
                          <div className="flex flex-col gap-2">
                              <div className="flex gap-2">
                                  <input 
                                      value={dictAudio} 
                                      onChange={e => setDictAudio(e.target.value)} 
                                      placeholder="https://... or /audio/..." 
                                      className="flex-1 px-5 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium text-xs text-slate-700 outline-none focus:border-indigo-400" 
                                  />
                                  {dictAudio && <button type="button" onClick={handleTestAudio} className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-200">Test 🔊</button>}
                              </div>
                              <div className="flex gap-2">
                                  <button type="button" onClick={setLocalAudio} className="flex-1 py-3 px-4 rounded-xl bg-slate-100 text-slate-500 font-bold text-xs hover:bg-slate-200 transition-colors">Use Local Path</button>
                                  <div className="flex-1 relative">
                                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" className="hidden" id="audio-upload" />
                                      <label htmlFor="audio-upload" className={`w-full h-full py-3 px-4 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center cursor-pointer hover:bg-indigo-100 transition-colors ${isUploadingAudio ? 'opacity-50 cursor-wait' : ''}`}>
                                          {isUploadingAudio ? 'Uploading...' : '📁 Upload'}
                                      </label>
                                  </div>
                              </div>
                          </div>
                      </div>
                      <Button type="submit" isLoading={isSubmitting || isUploadingAudio} disabled={!dictChar || isUploadingAudio} className="w-full">
                          {isUploadingAudio ? 'Uploading Audio...' : 'Save to Dictionary'}
                      </Button>
                  </form>
              </div>
              <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-extrabold text-slate-700">Word List ({Object.keys(dictionary).length})</h3>
                      <Button variant="outline" onClick={loadTabData} size="sm">Refresh</Button>
                  </div>
                  <div className="overflow-y-auto max-h-[600px] pr-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(dictionary).map(([char, data]: [string, { pinyin: string; definition: string; audio: string }]) => (
                              <div key={char} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center group hover:border-indigo-200 transition-all">
                                  <div><div className="text-2xl font-bold text-slate-800">{char}</div><div className="text-xs font-bold text-slate-400">{data.pinyin} • {data.definition}</div></div>
                                  <div className="flex items-center gap-2">
                                      {data.audio && <button onClick={() => { const url = data.audio.startsWith('/') ? data.audio : convertAudioDriveLink(data.audio); playAudioUrl(url); }} className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-200" title="Play Audio">🔊</button>}
                                      <button onClick={() => handleDeleteFromDictionary(char)} className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center hover:bg-rose-200 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">🗑️</button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* ASSIGNMENTS TAB */}
      {activeTab === 'assignments' && (
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <SectionHeader title="Assignment Library" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assignments
                    .slice() // Copy to avoid mutation
                    .sort((a, b) => {
                        // Priority 1: Creation Timestamp (from ID)
                        const getTs = (id: string) => {
                            if (!id || !id.includes('-')) return 0;
                            const parts = id.split('-');
                            const num = parseInt(parts[parts.length - 1]);
                            return !isNaN(num) ? num : 0;
                        };
                        const tsA = getTs(a.id);
                        const tsB = getTs(b.id);
                        if (tsA > 0 && tsB > 0 && tsA !== tsB) return tsB - tsA;

                        // Priority 2: Start Date
                        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
                        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
                        return dateB - dateA;
                    })
                    .map(lesson => {
                      const now = new Date(); now.setHours(0,0,0,0);
                      const start = lesson.startDate ? parseLocalDate(lesson.startDate) : null;
                      const end = lesson.endDate ? parseLocalDate(lesson.endDate) : null;
                      const points = lesson.metadata?.points || 30;
                      let status = { label: 'Active', color: 'bg-emerald-100 text-emerald-700' };
                      if (start && now < start) status = { label: 'Scheduled', color: 'bg-amber-100 text-amber-700' };
                      else if (end && now > end) status = { label: 'Expired', color: 'bg-slate-200 text-slate-500' };
                      return (
                      <div key={lesson.id} className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 hover:border-indigo-200 transition-all group relative">
                          <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${status.color}`}>{status.label}</div>
                          <div className="flex justify-between items-start mb-4 pr-16"><h3 className="font-extrabold text-xl text-slate-800 line-clamp-1">{lesson.title}</h3></div>
                          <div className="mb-4 flex items-center gap-2">
                              <span className="bg-white px-2 py-1 rounded-md text-xs font-bold text-slate-400 shadow-sm border border-slate-100">{lesson.type}</span>
                              <span className="bg-amber-100 px-2 py-1 rounded-md text-xs font-bold text-amber-600 shadow-sm border border-amber-200 flex items-center gap-1">⭐ {points}</span>
                          </div>
                          <p className="text-slate-500 text-sm mb-4 line-clamp-2 h-10">{lesson.description}</p>
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">{lesson.characters.length} Items • Due {parseLocalDate(lesson.endDate).toLocaleDateString()}</div>
                          <div className="flex gap-2 mt-4">
                              <Button size="sm" variant="secondary" onClick={() => handleEditAssignment(lesson)} className="flex-1">Edit</Button>
                              <Button size="sm" variant="danger" onClick={() => handleDeleteAssignment(lesson.id)}>Delete</Button>
                          </div>
                      </div>
                  )})}
                  {assignments.length === 0 && <div className="col-span-full text-center py-20 text-slate-400 font-bold">No assignments found.</div>}
              </div>
          </div>
      )}

      {/* CALENDAR TAB */}
      {activeTab === 'calendar' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2"><CalendarView isTeacher onDateSelect={handleDateSelect} onEventClick={handleEventClick} refreshTrigger={calendarRefreshTrigger} /></div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 h-fit">
                  <SectionHeader title={calEventId ? "Edit Event" : "Add Event"} subtitle={new Date(calDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric'})} />
                  <form onSubmit={handleSaveEvent} className="space-y-4">
                      <div><InputLabel label="Event Title" /><input value={calTitle} onChange={e => setCalTitle(e.target.value)} placeholder="e.g., Pizza Party" className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400" required /></div>
                      <div><InputLabel label="Event Type" />
                          <select value={calType} onChange={e => setCalType(e.target.value as CalendarEventType)} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400">
                              <option value="SCHOOL_DAY">School Day 🏫</option><option value="SPECIAL_EVENT">Fun Event 🎈</option><option value="NO_SCHOOL">No School / Holiday 🧸</option>
                          </select>
                      </div>
                      <div><InputLabel label="Description (Optional)" /><textarea value={calDesc} onChange={e => setCalDesc(e.target.value)} placeholder="Details..." className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-400" rows={2} /></div>
                      <div className="flex gap-2 pt-2"><Button type="submit" isLoading={isSubmitting} className="flex-1">{calEventId ? "Update" : "Save Event"}</Button>{calEventId && (<Button type="button" variant="danger" onClick={handleDeleteEvent}>Delete</Button>)}</div>
                      {calEventId && <Button type="button" variant="ghost" onClick={() => { setCalEventId(null); setCalTitle(''); setCalDesc(''); }} className="w-full">Cancel</Button>}
                  </form>
              </div>
          </div>
      )}

      {/* PROGRESS TAB */}
      {activeTab === 'progress' && (
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                  <SectionHeader title="Student Progress" />
                  
                  {/* Add Student Form */}
                  <form onSubmit={handleAddStudent} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <input 
                          type="text" 
                          value={newStudentName} 
                          onChange={e => setNewStudentName(e.target.value)} 
                          placeholder="New Student Name" 
                          className="px-3 py-2 bg-white rounded-lg text-sm font-bold border border-slate-200 outline-none focus:border-indigo-400 w-48"
                      />
                      <Button type="submit" size="sm" isLoading={isAddingStudent} disabled={!newStudentName.trim()}>
                          + Add
                      </Button>
                  </form>
              </div>

              <div className="overflow-x-auto">
                  <table className="w-full text-left">
                      <thead>
                          <tr className="border-b-2 border-slate-100">
                              <th className="pb-4 pl-4 font-extrabold text-slate-400 uppercase text-xs">Student</th>
                              <th className="pb-4 font-extrabold text-slate-400 uppercase text-xs">Last Active</th>
                              <th className="pb-4 font-extrabold text-slate-400 uppercase text-xs">Assignments</th>
                              <th className="pb-4 font-extrabold text-slate-400 uppercase text-xs">Avg Score</th>
                              <th className="pb-4 pr-4 text-right font-extrabold text-slate-400 uppercase text-xs">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                          {studentData.map(s => (
                              <tr key={s.id} className="group hover:bg-slate-50 transition-colors">
                                  <td className="py-4 pl-4 font-bold text-slate-700">{s.name}</td>
                                  <td className="py-4 text-slate-500 text-sm">{s.lastActive ? new Date(s.lastActive).toLocaleDateString() : '-'}</td>
                                  <td className="py-4"><span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">{s.assignmentsCompleted} Done</span></td>
                                  <td className="py-4 font-bold text-indigo-600">{s.averageScore}%</td>
                                  <td className="py-4 pr-4 text-right"><button onClick={() => setViewingStudent(s)} className="text-indigo-500 font-bold text-xs hover:underline">View Collection</button></td>
                              </tr>
                          ))}
                          {studentData.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-slate-400 font-bold">No students found.</td></tr>}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* REWARDS TAB */}
      {activeTab === 'rewards' && (
          <div className="space-y-8">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                      <SectionHeader title="Class Rewards" subtitle="Gamify your classroom." />
                      <div className="flex gap-2">
                          <Button size="sm" variant={rewardMode === 'POINTS' ? 'primary' : 'outline'} onClick={() => setRewardMode('POINTS')}>Points</Button>
                          <Button size="sm" variant={rewardMode === 'STICKER' ? 'primary' : 'outline'} onClick={() => setRewardMode('STICKER')}>Sticker Gift</Button>
                          <Button size="sm" variant={rewardMode === 'STORE' ? 'primary' : 'outline'} onClick={() => setRewardMode('STORE')}>Manage Store</Button>
                      </div>
                  </div>

                  {/* POINTS MODE */}
                  {rewardMode === 'POINTS' && (
                      <div>
                          <div className="flex flex-col gap-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                              <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-500 text-sm">Amount:</span>
                                      <input type="number" value={rewardPoints} onChange={e => setRewardPoints(Number(e.target.value))} className="w-20 px-3 py-2 rounded-lg border-2 border-slate-200 font-bold outline-none" />
                                  </div>
                                  <div className="flex-1">
                                      <input value={rewardReason} onChange={e => setRewardReason(e.target.value)} placeholder="Reason (e.g. Good Participation)" className="w-full px-4 py-2 rounded-lg border-2 border-slate-200 font-medium outline-none" />
                                  </div>
                                  <Button onClick={handleGivePoints} disabled={selectedStudentIds.size === 0}>Give to {selectedStudentIds.size || '0'} Students</Button>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                  {['Answered Question', 'Helping Others', 'Great Focus', 'Teamwork'].map(r => (
                                      <button 
                                          key={r} 
                                          onClick={() => setRewardReason(r)}
                                          className="px-3 py-1 bg-white hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-full text-xs font-bold transition-colors border border-slate-200"
                                      >
                                          {r}
                                      </button>
                                  ))}
                              </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">{studentData.map(s => (<div key={s.id} onClick={() => toggleStudent(s.id)} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedStudentIds.has(s.id) ? 'bg-indigo-50 border-indigo-400 shadow-md transform -translate-y-1' : 'bg-white border-slate-100 hover:border-indigo-200'}`}><div className="flex justify-between items-start mb-2"><div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedStudentIds.has(s.id) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>{selectedStudentIds.has(s.id) && <span className="text-white text-xs">✓</span>}</div><span className="font-black text-amber-500 text-xs">⭐ {s.points}</span></div><p className="font-bold text-slate-700 truncate">{s.name}</p></div>))}</div>
                          {studentData.length === 0 && <div className="text-center py-10 text-slate-400">No students found.</div>}<div className="mt-4"><Button variant="ghost" size="sm" onClick={toggleSelectAll}>Select All</Button></div>
                      </div>
                  )}
                  
                  {/* STICKER GIFT MODE - Updated to open preview */}
                  {rewardMode === 'STICKER' && (<div><div className="mb-6"><h4 className="font-extrabold text-slate-600 mb-3">1. Select Students ({selectedStudentIds.size})</h4><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[150px] overflow-y-auto pr-2">{studentData.map(s => (<div key={s.id} onClick={() => toggleStudent(s.id)} className={`p-2 rounded-xl border cursor-pointer text-xs font-bold transition-all flex items-center gap-2 ${selectedStudentIds.has(s.id) ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-slate-100 text-slate-500'}`}><div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedStudentIds.has(s.id) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>{selectedStudentIds.has(s.id) && <span className="text-white text-[10px]">✓</span>}</div><span className="truncate">{s.name}</span></div>))}</div>{studentData.length === 0 && <div className="text-center py-4 text-slate-400 text-xs">No students found.</div>}<Button variant="ghost" size="sm" onClick={toggleSelectAll} className="mt-2 text-xs h-8">Select All</Button></div><div className="border-t border-slate-100 pt-6"><div className="flex justify-between items-center mb-4"><h4 className="font-extrabold text-slate-600">2. Select Sticker</h4><Button onClick={handleGiveSticker} disabled={selectedStudentIds.size === 0 || !selectedSticker}>Send {selectedSticker ? selectedSticker.name : 'Sticker'}</Button></div>
                  {/* Selected Preview Box */}
                  {selectedSticker && (
                      <div className="mb-6 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl flex items-center gap-4 animate-bounce-in">
                          <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center border-2 border-emerald-100">
                              {selectedSticker.imageUrl ? <img src={convertDriveLink(selectedSticker.imageUrl)} className="w-full h-full object-contain p-1" /> : <span className="text-3xl">{(selectedSticker as any).emoji}</span>}
                          </div>
                          <div>
                              <div className="font-bold text-emerald-800 text-sm">Ready to Send</div>
                              <div className="font-black text-emerald-600 text-lg">{selectedSticker.name}</div>
                          </div>
                      </div>
                  )}
                  <div className="max-h-[400px] overflow-y-auto pr-2">{(() => { const allItems = [...storeItems, ...STICKER_CATALOG]; const grouped: Record<string, typeof allItems> = {}; allItems.forEach(item => { const cat = item.category || 'Misc.'; if (!grouped[cat]) grouped[cat] = []; if (!grouped[cat].find(i => i.id === item.id)) { grouped[cat].push(item); } }); return Object.entries(grouped).sort().map(([category, items]) => (<div key={category} className="mb-6"><h5 className="font-black text-slate-400 text-xs uppercase mb-3 sticky top-0 bg-white z-10 py-2 border-b border-slate-100">{category}</h5><div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">{items.map((item, idx) => (<div key={`${item.id}-${idx}`} onClick={() => setPreviewSticker(item)} className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-2 cursor-pointer transition-all ${selectedSticker?.id === item.id ? 'bg-emerald-50 border-emerald-400 shadow-md transform -translate-y-1' : 'bg-white border-slate-100 hover:border-slate-300'}`} title={item.name}>{item.imageUrl ? <img src={convertDriveLink(item.imageUrl)} alt={item.name} className="w-full h-full object-contain" /> : <div className="text-4xl select-none">{(item as any).emoji}</div>}</div>))}</div></div>)); })()}</div></div></div>)}
                  
                  {/* STORE MANAGEMENT MODE - Redesigned to Grid */}
                  {rewardMode === 'STORE' && (
                      <div className="space-y-8 animate-fade-in">
                          <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-200">
                              <h4 className="font-extrabold text-slate-600 mb-4">Add Store Item</h4>
                              <form onSubmit={handleAddStoreItem} className="space-y-4">
                                  <input value={newStoreName} onChange={e => setNewStoreName(e.target.value)} placeholder="Item Name" className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none" required />
                                  <input value={newStoreUrl} onChange={e => setNewStoreUrl(e.target.value)} placeholder="Image URL (Google Drive Link)" className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-medium outline-none" required />
                                  <div className="flex gap-4">
                                      <input type="number" value={newStoreCost} onChange={e => setNewStoreCost(Number(e.target.value))} placeholder="Cost" className="w-24 px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none" required />
                                      {/* Updated Category Input with Suggestions from existing Store Items */}
                                      <div className="flex-1 relative">
                                          <input 
                                            list="category-suggestions" 
                                            value={newStoreCategory} 
                                            onChange={e => setNewStoreCategory(e.target.value)} 
                                            placeholder="Category"
                                            className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none" 
                                          />
                                          <datalist id="category-suggestions">
                                              {/* Populate suggestions dynamically from what is actually in the store */}
                                              {Array.from(new Set(storeItems.map(i => i.category || 'Misc.'))).sort().map(c => (
                                                  <option key={c} value={c} />
                                              ))}
                                              <option value="Animals" />
                                              <option value="Food" />
                                              <option value="Rewards" />
                                          </datalist>
                                      </div>
                                  </div>
                                  <Button type="submit" isLoading={isSubmitting} className="w-full">Add Item</Button>
                              </form>
                          </div>
                          <div>
                              <div className="flex justify-between items-center mb-4">
                                  <h4 className="font-extrabold text-slate-600">Store Inventory ({storeItems.length})</h4>
                                  <Button variant="outline" size="sm" onClick={loadSalesReport} className="text-xs">📊 Sales Stats</Button>
                              </div>
                              <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                      {storeItems.map(item => (
                                          <div key={item.id} className="bg-white rounded-2xl border-2 border-slate-100 p-4 flex flex-col items-center shadow-sm hover:border-indigo-200 transition-all relative group cursor-pointer" onClick={() => setPreviewSticker(item)}>
                                              <div className="aspect-square w-full bg-slate-50 rounded-xl mb-3 flex items-center justify-center relative overflow-hidden">
                                                  {item.imageUrl ? (
                                                      <img src={convertDriveLink(item.imageUrl)} className="w-full h-full object-contain p-2" />
                                                  ) : (
                                                      <div className="text-5xl">{(item as any).emoji || '📦'}</div>
                                                  )}
                                              </div>
                                              <div className="text-center w-full mb-2">
                                                  <div className="font-bold text-slate-700 truncate">{item.name}</div>
                                                  <div className="flex justify-center items-center gap-2 mt-1">
                                                      <span className="text-xs font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md">⭐ {item.cost}</span>
                                                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md uppercase">{item.category || 'Misc.'}</span>
                                                  </div>
                                              </div>
                                              <button 
                                                  onClick={(e) => { e.stopPropagation(); handleDeleteStoreItem(item.id); }}
                                                  className="w-full py-2 rounded-lg bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 transition-colors opacity-0 group-hover:opacity-100"
                                              >
                                                  Delete
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                              {storeItems.length === 0 && <div className="text-center py-10 text-slate-400 font-bold">Store is empty.</div>}
                          </div>
                      </div>
                  )}
              </div>
              
              {/* Class Goal Section */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm"><div className="flex justify-between items-center mb-6"><h3 className="font-extrabold text-2xl text-slate-700">Class Goals</h3><Button size="sm" onClick={handleCreatePizzaParty}>+ New Pizza Party</Button></div><div className="space-y-4">{activeGoals.map(goal => (<div key={goal.id} className={`p-6 rounded-2xl border-2 flex items-center justify-between ${goal.status === 'PAUSED' ? 'bg-slate-50 border-slate-200 opacity-75' : 'bg-orange-50 border-orange-100'}`}><div className="flex items-center gap-4"><div className="text-4xl">{goal.status === 'PAUSED' ? '⏸️' : '🍕'}</div><div><h4 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">{goal.title}{goal.status === 'PAUSED' && <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded font-black uppercase">Paused</span>}</h4><div className="text-sm font-bold text-orange-600">{goal.current} / {goal.target} Points</div></div></div><div className="flex items-center gap-4">{goal.status === 'COMPLETED' ? <span className="px-4 py-2 bg-emerald-200 text-emerald-800 rounded-lg font-bold">Completed!</span> : <div className="w-32 h-3 bg-orange-200 rounded-full overflow-hidden"><div className="h-full bg-orange-500" style={{width: `${(goal.current/goal.target)*100}%`}}></div></div>}<button onClick={() => handleToggleGoal(goal.id, goal.status)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300" title={goal.status === 'ACTIVE' ? "Pause Goal" : "Resume Goal"}>{goal.status === 'ACTIVE' ? '⏸️' : '▶️'}</button><button onClick={() => handleDeleteGoal(goal.id)} className="text-slate-400 hover:text-rose-500 text-sm font-bold">✕</button></div></div>))}{activeGoals.length === 0 && <div className="text-center py-8 text-slate-400 font-bold">No active class goals.</div>}</div></div>
          </div>
      )}

      {/* LOGS TAB */}
      {activeTab === 'logs' && (
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <SectionHeader title="Activity Logs" />
              <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left">
                      <thead className="sticky top-0 bg-white">
                          <tr className="border-b-2 border-slate-100">
                              <th className="pb-4 pl-4 font-extrabold text-slate-400 uppercase text-xs w-1/3">Time</th>
                              <th className="pb-4 font-extrabold text-slate-400 uppercase text-xs">User</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                          {loginLogs.map((log, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                  <td className="py-3 pl-4 text-xs font-bold text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                                  <td className="py-3 font-bold text-slate-700">{log.name}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* Collection Modal */}
      {viewingStudent && <CollectionModal student={viewingStudent} onClose={() => setViewingStudent(null)} />}
    </div>
  );
};
