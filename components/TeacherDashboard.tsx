
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { Lesson, StudentSummary, CalendarEvent, CalendarEventType, StoreItem, LoginLog } from '../types';
import { CalendarView } from './CalendarView';
import { generateSticker } from '../services/geminiService';
import { STICKER_CATALOG, convertDriveLink } from '../utils/stickerData';

interface TeacherDashboardProps {
  onLogout: () => void;
  onOpenSetup: () => void;
  onUpdateTheme: (bg: string) => void;
  onResetTheme: () => void;
}

// Removed 'logs' from types
type TabType = 'create' | 'progress' | 'assignments' | 'calendar' | 'rewards' | 'logs';

// Client-side resizing for stickers 
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
          // Medium compression PNG
          resolve(canvas.toDataURL('image/png', 0.8));
      } else {
          resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

const STICKER_KEYWORDS = {
  'Characters': ['Panda', 'Tiger', 'Cat', 'Dog', 'Rabbit', 'Dragon', 'Robot', 'Unicorn', 'Monkey', 'Owl'],
  'Items': ['Star', 'Trophy', 'Medal', 'Book', 'Pencil', 'Rocket', 'Sun', 'Moon', 'Flower', 'Gem'],
  'Styles': ['3D Cartoon', 'Watercolor', 'Pixel Art', 'Doodle', 'Vector', 'Pop Art', 'Origami', 'Clay'],
  'Mood': ['Happy', 'Cool', 'Sleepy', 'Excited', 'Studious', 'Funny', 'Proud', 'Silly']
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
  const [assignedTo, setAssignedTo] = useState<string[]>([]); // Empty = All students

  // Calendar Event State
  const [calEditingId, setCalEditingId] = useState<string | null>(null);
  const [calDate, setCalDate] = useState(new Date().toISOString().split('T')[0]);
  const [calTitle, setCalTitle] = useState('');
  const [calType, setCalType] = useState<CalendarEventType>('SCHOOL_DAY');
  const [calDesc, setCalDesc] = useState('');
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState(0);

  // Rewards Tab State
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [rewardMode, setRewardMode] = useState<'POINTS' | 'STICKER' | 'STORE'>('POINTS');
  const [rewardPoints, setRewardPoints] = useState(5);
  const [rewardReason, setRewardReason] = useState("Good Job!");
  const [stickerPrompt, setStickerPrompt] = useState("");
  const [stickerModel, setStickerModel] = useState<'FAST' | 'QUALITY' | 'OFFLINE'>('FAST');
  const [generatedSticker, setGeneratedSticker] = useState<string | null>(null);
  const [viewingStudent, setViewingStudent] = useState<StudentSummary | null>(null);
  const [selectedStoreItem, setSelectedStoreItem] = useState<StoreItem | null>(null);

  // Store Management State
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreUrl, setNewStoreUrl] = useState('');
  const [newStoreCost, setNewStoreCost] = useState(100);

  // Progress Filter State
  const [progressStartDate, setProgressStartDate] = useState('');
  const [progressEndDate, setProgressEndDate] = useState('');
  
  // Logs State
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [lastSuccess, setLastSuccess] = useState('');
  const [lastError, setLastError] = useState('');

  const [studentData, setStudentData] = useState<StudentSummary[]>([]);
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  
  // On mount, fetch students so we can populate the dropdown even on 'create' tab
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

  // Sync viewingStudent if data updates (e.g. after gifting)
  useEffect(() => {
      if (viewingStudent) {
          const fresh = studentData.find(s => s.id === viewingStudent.id);
          if (fresh) setViewingStudent(fresh);
      }
  }, [studentData]);

  const loadTabData = async () => {
      setIsLoadingData(true);
      if (activeTab === 'progress' || activeTab === 'rewards') {
          // Force refresh to get latest stickers
          const forceRefresh = true; 
          setStudentData(await sheetService.getAllStudentProgress(forceRefresh, progressStartDate, progressEndDate));
          // Load store items for rewards page
          if (activeTab === 'rewards') {
              const items = await sheetService.getStoreItems(true);
              setStoreItems(items);
          }
      }
      else if (activeTab === 'assignments') {
          setAssignments(await sheetService.getAssignments(true));
      }
      else if (activeTab === 'logs') {
          const logs = await sheetService.getLoginLogs(true);
          setLoginLogs(logs);
      }
      
      setIsLoadingData(false);
  };

  // --- Handlers ---

  const handleToggleClassStatus = async () => {
      const newState = !isClassOpen;
      setIsClassOpen(newState); // Optimistic UI
      const result = await sheetService.setClassStatus(newState);
      if (!result.success) {
          setIsClassOpen(!newState); // Revert on fail
          alert("Failed to update status");
      }
  };

  const handleCreateOrUpdateHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload: Lesson = {
        id: editingId || `w-${Date.now()}`,
        title, description: desc,
        characters: chars.split(/[,，\s\n]+/).map(c => c.trim()).filter(c => c),
        startDate, endDate, type,
        assignedTo
    };
    const result = editingId ? await sheetService.editAssignment(payload) : await sheetService.createAssignment(payload);
    setIsSubmitting(false);
    if (result.success) {
        setLastSuccess("Assignment Published Successfully!");
        setEditingId(null); setTitle(''); setDesc(''); setChars(''); setAssignedTo([]);
        setTimeout(() => setLastSuccess(''), 3000);
    } else { setLastError(result.message || "Error"); }
  };

  const toggleStudent = (id: string) => {
      if (assignedTo.includes(id)) {
          setAssignedTo(prev => prev.filter(s => s !== id));
      } else {
          setAssignedTo(prev => [...prev, id]);
      }
  };

  const handleSaveCalendarEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const event: CalendarEvent = {
        id: calEditingId || `cal-${Date.now()}`,
        date: calDate, title: calTitle, type: calType, description: calDesc
    };
    const result = await sheetService.saveCalendarEvent(event);
    setIsSubmitting(false);
    if (result.success) {
        setLastSuccess("Calendar event saved!");
        setCalEditingId(null); setCalTitle(''); setCalDesc('');
        setCalendarRefreshTrigger(prev => prev + 1); // Trigger calendar refresh
        setTimeout(() => setLastSuccess(''), 3000);
    } else { setLastError("Error saving calendar event"); }
  };

  const handleDeleteCalendarEvent = async (id: string) => {
      if (!confirm("Delete this event?")) return;
      await sheetService.deleteCalendarEvent(id);
      setLastSuccess("Event deleted");
      setCalendarRefreshTrigger(prev => prev + 1); // Trigger calendar refresh
      setTimeout(() => setLastSuccess(''), 3000);
  };

  // Reward Handlers
  const toggleRewardSelection = (id: string) => {
      const newSet = new Set(selectedStudentIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedStudentIds(newSet);
  };

  const toggleSelectAllRewards = () => {
      if (selectedStudentIds.size === studentData.length) {
          setSelectedStudentIds(new Set());
      } else {
          setSelectedStudentIds(new Set(studentData.map(s => s.id)));
      }
  };

  const handleGivePoints = async () => {
      if (selectedStudentIds.size === 0) {
          setLastError("Select at least one student."); return;
      }
      setIsSubmitting(true);
      const result = await sheetService.adminGivePoints(Array.from(selectedStudentIds), rewardPoints, rewardReason);
      if (result.success) {
          setLastSuccess(`Awarded ${rewardPoints} points to ${selectedStudentIds.size} student(s)!`);
          loadTabData(); // Refresh points display
          setTimeout(() => setLastSuccess(''), 3000);
      } else {
          setLastError("Failed to update points.");
      }
      setIsSubmitting(false);
  };

  const handleGenerateSticker = async () => {
      if (!stickerPrompt) return;
      setIsSubmitting(true);
      setGeneratedSticker(null);
      // Pass the selected model (FAST, QUALITY, or OFFLINE) to the service
      const img = await generateSticker(stickerPrompt, stickerModel);
      if (img) setGeneratedSticker(img);
      else setLastError("Failed to generate sticker. Try again.");
      setIsSubmitting(false);
  };

  const handleGiftSticker = async () => {
      if (selectedStudentIds.size === 0) { setLastError("Select students first."); return; }
      if (!generatedSticker) { setLastError("Generate a sticker first."); return; }
      
      setIsSubmitting(true);
      
      // Resize to 200px (Balance between quality and upload speed)
      const resized = await resizeImage(generatedSticker, 200);
      
      const result = await sheetService.adminGiveSticker(Array.from(selectedStudentIds), { dataUrl: resized, prompt: stickerPrompt });
      if (result.success) {
          setLastSuccess(`Gifted sticker to ${selectedStudentIds.size} student(s)!`);
          setGeneratedSticker(null);
          setStickerPrompt("");
          // CRITICAL: Reload data so it shows up in the "View Collection" modal immediately
          await loadTabData();
          
          setTimeout(() => setLastSuccess(''), 3000);
      } else {
          // Show detailed error if available
          setLastError(result.message || "Failed to save sticker. Check network.");
          if (result.message?.includes('Invalid action')) {
              alert("⚠️ Backend outdated. Please go to Settings -> Google Apps Script and update your deployment code.");
          }
      }
      setIsSubmitting(false);
  };

  // STORE MANAGEMENT HANDLERS
  const handleAddStoreItem = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newStoreName || !newStoreUrl) return;
      
      setIsSubmitting(true);
      const convertedUrl = convertDriveLink(newStoreUrl);
      const result = await sheetService.addStoreItem({
          name: newStoreName,
          imageUrl: convertedUrl,
          cost: newStoreCost
      });
      
      if (result.success) {
          setLastSuccess("Sticker added to store!");
          setNewStoreName(''); setNewStoreUrl('');
          const items = await sheetService.getStoreItems(true);
          setStoreItems(items);
      } else {
          setLastError("Failed to add item.");
      }
      setIsSubmitting(false);
  };

  const handleDeleteStoreItem = async (id: string) => {
      if (!confirm("Remove this sticker from the store?")) return;
      await sheetService.deleteStoreItem(id);
      const items = await sheetService.getStoreItems(true);
      setStoreItems(items);
  };

  const handleGiftStoreItem = async () => {
      if (!selectedStoreItem) return;
      if (selectedStudentIds.size === 0) { setLastError("Select students first."); return; }
      
      setIsSubmitting(true);
      // We pass the Store Item data as if it were a generated sticker, but using its existing ID
      const result = await sheetService.adminGiveSticker(Array.from(selectedStudentIds), { 
          id: selectedStoreItem.id, // Important: Reuse ID so it stacks properly
          dataUrl: selectedStoreItem.imageUrl, 
          prompt: selectedStoreItem.name 
      });
      
      if (result.success) {
          setLastSuccess(`Gifted ${selectedStoreItem.name} to ${selectedStudentIds.size} students!`);
          await loadTabData();
          setSelectedStoreItem(null);
          setTimeout(() => setLastSuccess(''), 3000);
      } else {
          setLastError("Failed to send gift.");
      }
      setIsSubmitting(false);
  };

  const handleTogglePermission = async (studentId: string, currentStatus: boolean) => {
      // Toggle logic
      const newStatus = !currentStatus;
      // Optimistic Update
      setStudentData(prev => prev.map(s => s.id === studentId ? { ...s, canCreateStickers: newStatus } : s));
      
      const result = await sheetService.updateStudentPermission(studentId, newStatus);
      if (!result.success) {
          // Revert if failed
          setStudentData(prev => prev.map(s => s.id === studentId ? { ...s, canCreateStickers: currentStatus } : s));
          setLastError("Failed to update permission");
      }
  };

  const addToPrompt = (word: string) => {
      setStickerPrompt(prev => {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${word}` : word;
      });
  };

  // --- UI Components ---

  const SectionHeader = ({ title, subtitle }: { title: string, subtitle?: string }) => (
      <div className="mb-8 border-b-2 border-slate-100 pb-4">
          <h2 className="text-3xl font-extrabold text-slate-700 tracking-tight">{title}</h2>
          {subtitle && <p className="text-slate-500 font-medium text-lg mt-2">{subtitle}</p>}
      </div>
  );

  const InputLabel = ({ label }: { label: string }) => (
      <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2 ml-1">{label}</label>
  );

  const CollectionModal = ({ student, onClose }: { student: StudentSummary, onClose: () => void }) => {
      const ownedIds = student.stickers || [];
      // Combine Store Items and Catalog for "Standard" display
      const allStandardItems = [...storeItems, ...STICKER_CATALOG];
      
      // Filter distinct stickers owned by student
      const ownedStandardStickers = allStandardItems.filter(s => ownedIds.includes(s.id));
      // De-duplicate in case of overlap between store/catalog
      const uniqueOwned = Array.from(new Set(ownedStandardStickers.map(s => s.id)))
          .map(id => ownedStandardStickers.find(s => s.id === id));

      const customStickers = student.customStickers || [];

      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
              <div className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl animate-bounce-in" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-4">
                          <h3 className="text-2xl font-extrabold text-slate-800">{student.name}'s Collection</h3>
                          {/* Manual Refresh Button inside Modal */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); loadTabData(); }}
                            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 flex items-center justify-center transition-colors"
                            title="Refresh Data"
                          >
                            🔄
                          </button>
                      </div>
                      <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition-colors">✕</button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-2">
                      {uniqueOwned.length === 0 && customStickers.length === 0 ? (
                          <div className="text-center py-16 text-slate-400">
                              <div className="text-6xl mb-2 grayscale opacity-50">🛍️</div>
                              <p className="font-bold">No stickers yet.</p>
                          </div>
                      ) : (
                          <div className="space-y-8">
                              {/* Standard Stickers */}
                              {uniqueOwned.length > 0 && (
                                  <div>
                                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Store Stickers ({uniqueOwned.length})</h4>
                                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-4">
                                          {uniqueOwned.map((s, idx) => {
                                              if (!s) return null;
                                              return (
                                                <div key={`${s.id}-${idx}`} className="aspect-square bg-slate-50 rounded-2xl flex items-center justify-center text-4xl border-2 border-slate-100 overflow-hidden relative" title={s.name}>
                                                    {s.imageUrl ? <img src={s.imageUrl} className="w-full h-full object-cover" alt={s.name} /> : s.emoji}
                                                </div>
                                              );
                                          })}
                                      </div>
                                  </div>
                              )}

                              {/* Custom Stickers */}
                              {customStickers.length > 0 && (
                                  <div>
                                      <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest mb-3">AI Creations ({customStickers.length})</h4>
                                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                                          {customStickers.map(s => (
                                              <div key={s.id} className="aspect-square bg-purple-50 rounded-2xl border-2 border-purple-100 overflow-hidden relative group">
                                                  <img src={s.dataUrl} alt={s.prompt} className="w-full h-full object-cover" />
                                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                                                      <span className="text-[10px] text-white font-bold leading-tight line-clamp-3">{s.prompt}</span>
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-8 pb-20 font-nunito bg-[#f8fafc] min-h-screen p-6">
      {/* Top Navigation Bar */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 sticky top-4 z-40">
        <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-4xl border border-indigo-100 text-indigo-500">🍎</div>
            <div>
                <h1 className="text-2xl font-extrabold text-slate-700">Teacher Portal</h1>
                <p className="text-slate-400 font-bold">Class Management</p>
            </div>
        </div>
        
        {/* RIGHT SIDE CONTROLS */}
        <div className="flex flex-wrap items-center gap-4">
            {/* CLASS TOGGLE SWITCH */}
            <div className={`
                flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all cursor-pointer select-none
                ${isClassOpen ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}
            `} onClick={handleToggleClassStatus}>
                {isLoadingStatus ? (
                    <span className="text-slate-400 text-sm font-bold">Checking...</span>
                ) : (
                    <>
                        <div className={`w-3 h-3 rounded-full ${isClassOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                        <div className={`text-sm font-black uppercase ${isClassOpen ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {isClassOpen ? 'Class Open' : 'Class Closed'}
                        </div>
                        <div className={`
                            w-10 h-6 bg-slate-200 rounded-full relative transition-colors ml-2
                            ${isClassOpen ? 'bg-emerald-400' : 'bg-slate-300'}
                        `}>
                            <div className={`
                                absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform
                                ${isClassOpen ? 'translate-x-4' : 'translate-x-0'}
                            `}></div>
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
      
      {/* Notifications */}
      {(lastSuccess || lastError) && (
          <div className={`p-6 rounded-2xl text-center text-lg font-bold animate-bounce-in shadow-sm border-l-8 ${lastSuccess ? 'bg-emerald-50 text-emerald-700 border-emerald-400' : 'bg-rose-50 text-rose-700 border-rose-400'}`}>
              {lastSuccess || lastError}
          </div>
      )}

      {/* ... (REWARDS TAB Logic matches existing, just verifying update propagation) ... */}
      {activeTab === 'rewards' && (
        <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-200">
             <SectionHeader title="Student Rewards" subtitle="Give points or custom stickers to your class." />

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Student Selection */}
                <div className="lg:col-span-1 bg-slate-50 rounded-[2rem] border border-slate-200 p-6 flex flex-col h-[600px]">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
                        <h3 className="font-bold text-slate-700 text-lg">Class Roster</h3>
                        <button 
                            onClick={toggleSelectAllRewards}
                            className="text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-lg transition-colors"
                        >
                            {selectedStudentIds.size === studentData.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                        {studentData.map(s => {
                            const isSelected = selectedStudentIds.has(s.id);
                            return (
                                <div 
                                    key={s.id}
                                    onClick={() => toggleRewardSelection(s.id)}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${isSelected ? 'bg-indigo-100 border-indigo-300 shadow-sm' : 'bg-white border-transparent hover:border-slate-200'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                                            {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                                        </div>
                                        <div>
                                            <span className={`font-bold block ${isSelected ? 'text-indigo-900' : 'text-slate-600'}`}>{s.name}</span>
                                            <span className="text-[10px] text-slate-400 font-bold">⭐ {s.points}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-1">
                                        {/* View Collection Button */}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setViewingStudent(s); }}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors"
                                            title="View Collection"
                                        >
                                            👁️
                                        </button>

                                        {/* Permission Toggle */}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleTogglePermission(s.id, !!s.canCreateStickers); }}
                                            className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg hover:bg-slate-100 transition-colors ${s.canCreateStickers ? 'grayscale-0' : 'grayscale'}`}
                                            title={s.canCreateStickers ? "AI Creator Allowed" : "AI Creator Locked"}
                                        >
                                            {s.canCreateStickers ? '🔓' : '🔒'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200 text-center text-slate-400 font-bold text-xs">
                        <p>{selectedStudentIds.size} Selected</p>
                        <p className="mt-1">Click 🔒 to enable AI creation.<br/>Click 👁️ to see collection.</p>
                    </div>
                </div>

                {/* Right Column: Action Panel */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    {/* Mode Toggle */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl self-start overflow-x-auto max-w-full">
                        <button 
                            onClick={() => setRewardMode('POINTS')}
                            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${rewardMode === 'POINTS' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <span>⭐</span> Give Points
                        </button>
                        <button 
                            onClick={() => setRewardMode('STICKER')}
                            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${rewardMode === 'STICKER' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <span>🎨</span> AI Sticker
                        </button>
                        <button 
                            onClick={() => setRewardMode('STORE')}
                            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${rewardMode === 'STORE' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <span>🛍️</span> Manage Store
                        </button>
                    </div>

                    {/* POINTS MODE */}
                    {rewardMode === 'POINTS' && (
                        <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 animate-fade-in flex-1 flex flex-col justify-center">
                            <div className="max-w-md mx-auto w-full space-y-8">
                                <div className="text-center">
                                    <div className="text-6xl mb-4">🏆</div>
                                    <h3 className="text-2xl font-extrabold text-slate-800">Award Class Points</h3>
                                    <p className="text-slate-500 font-medium">Motivate selected students with stars.</p>
                                </div>

                                <div className="space-y-4">
                                    <InputLabel label="Amount" />
                                    <div className="grid grid-cols-4 gap-3">
                                        {[1, 5, 10, 20].map(amt => (
                                            <button 
                                                key={amt}
                                                onClick={() => setRewardPoints(amt)}
                                                className={`py-3 rounded-xl font-black text-lg border-2 transition-all ${rewardPoints === amt ? 'bg-indigo-500 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'}`}
                                            >
                                                +{amt}
                                            </button>
                                        ))}
                                    </div>
                                    <input 
                                        type="number" 
                                        value={rewardPoints}
                                        onChange={e => setRewardPoints(Number(e.target.value))}
                                        className="w-full text-center py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 focus:border-indigo-400 outline-none"
                                    />
                                </div>

                                <div>
                                    <InputLabel label="Reason" />
                                    <input 
                                        type="text" 
                                        value={rewardReason}
                                        onChange={e => setRewardReason(e.target.value)}
                                        placeholder="e.g. Great Participation!"
                                        className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-medium text-slate-700 focus:border-indigo-400 outline-none"
                                    />
                                </div>

                                <Button 
                                    onClick={handleGivePoints}
                                    isLoading={isSubmitting}
                                    disabled={selectedStudentIds.size === 0}
                                    className="w-full py-4 text-lg shadow-xl"
                                >
                                    Send Rewards ({selectedStudentIds.size})
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* AI STICKER MODE */}
                    {rewardMode === 'STICKER' && (
                        <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 animate-fade-in flex-1">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                                 <div className="flex flex-col justify-center space-y-6">
                                     <div>
                                         <h3 className="text-2xl font-extrabold text-slate-800 mb-2">AI Sticker Studio</h3>
                                         <p className="text-slate-500 text-sm">Create a unique AI sticker and add it to student collections.</p>
                                     </div>
                                     
                                     <div>
                                         <div className="flex items-center justify-between mb-2">
                                            <InputLabel label="Describe Sticker" />
                                            {/* Model Toggle Switch */}
                                            <div className="flex bg-slate-200 p-1 rounded-lg gap-1">
                                                <button
                                                    onClick={() => setStickerModel('FAST')}
                                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${stickerModel === 'FAST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                    title="Nano Banana (Fast)"
                                                >
                                                    ⚡ Nano Fast
                                                </button>
                                                <button
                                                    onClick={() => setStickerModel('QUALITY')}
                                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${stickerModel === 'QUALITY' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                    title="Pro (High Quality)"
                                                >
                                                    ✨ Pro HD
                                                </button>
                                                <button
                                                    onClick={() => setStickerModel('OFFLINE')}
                                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${stickerModel === 'OFFLINE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                    title="Toy Mode (No API Quota)"
                                                >
                                                    🧸 Toy
                                                </button>
                                            </div>
                                         </div>
                                         
                                         {/* Keyword Chips */}
                                         <div className="mb-4 space-y-2">
                                            {Object.entries(STICKER_KEYWORDS).map(([category, words]) => (
                                                <div key={category} className="flex flex-wrap gap-2 items-center">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase w-16">{category}</span>
                                                    {words.map(word => (
                                                        <button
                                                            key={word}
                                                            onClick={() => addToPrompt(word)}
                                                            className="px-2 py-1 bg-white border border-slate-200 text-slate-600 rounded-full text-xs font-bold hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600 transition-colors"
                                                        >
                                                            {word}
                                                        </button>
                                                    ))}
                                                </div>
                                            ))}
                                         </div>

                                         <textarea 
                                             value={stickerPrompt}
                                             onChange={e => setStickerPrompt(e.target.value)}
                                             placeholder="e.g. A happy tiger eating watermelon"
                                             className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-medium text-slate-700 focus:border-purple-400 outline-none resize-none h-24"
                                         />
                                     </div>
                                     
                                     <Button 
                                         variant="secondary" 
                                         onClick={handleGenerateSticker}
                                         isLoading={isSubmitting && !generatedSticker}
                                         disabled={!stickerPrompt}
                                     >
                                         ✨ Generate Preview
                                     </Button>
                                 </div>

                                 <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-6 relative">
                                     {generatedSticker ? (
                                         <div className="text-center animate-fade-in">
                                             <img src={generatedSticker} alt="Preview" className="w-48 h-48 object-contain mb-6 drop-shadow-xl" />
                                             <Button 
                                                 onClick={handleGiftSticker}
                                                 isLoading={isSubmitting}
                                                 disabled={selectedStudentIds.size === 0}
                                                 className="w-full bg-purple-600 hover:bg-purple-700 border-purple-800 shadow-purple-200"
                                             >
                                                 Gift to {selectedStudentIds.size} Students
                                             </Button>
                                             <button onClick={() => setGeneratedSticker(null)} className="mt-4 text-xs font-bold text-slate-400 hover:text-rose-500">Discard</button>
                                         </div>
                                     ) : (
                                         <div className="text-center text-slate-300">
                                             <div className="text-6xl mb-2 opacity-50">🎨</div>
                                             <p className="font-bold text-sm">Preview will appear here</p>
                                         </div>
                                     )}
                                 </div>
                             </div>
                        </div>
                    )}

                    {/* STORE MANAGEMENT MODE */}
                    {rewardMode === 'STORE' && (
                        <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 animate-fade-in flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Import Stickers</h3>
                                        <p className="text-slate-500 text-sm">Add Google Drive links here. Students can buy these for 100 points.</p>
                                    </div>

                                    <form onSubmit={handleAddStoreItem} className="space-y-4">
                                        <div>
                                            <InputLabel label="Sticker Name" />
                                            <input 
                                                value={newStoreName}
                                                onChange={e => setNewStoreName(e.target.value)}
                                                placeholder="e.g. Red Dragon"
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <InputLabel label="Google Drive Link" />
                                            <input 
                                                value={newStoreUrl}
                                                onChange={e => setNewStoreUrl(e.target.value)}
                                                placeholder="https://drive.google.com/..."
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                                                required
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1 ml-1">Paste standard sharing link. Make sure it's "Anyone with link".</p>
                                        </div>
                                        <div>
                                            <InputLabel label="Cost (Points)" />
                                            <input 
                                                type="number"
                                                value={newStoreCost}
                                                onChange={e => setNewStoreCost(Number(e.target.value))}
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                                                required
                                            />
                                        </div>
                                        <Button type="submit" isLoading={isSubmitting} variant="secondary" className="w-full">
                                            Add to Store
                                        </Button>
                                    </form>
                                </div>

                                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col h-[400px]">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Current Inventory</h4>
                                    <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                                        {storeItems.map(item => (
                                            <div key={item.id} className={`flex items-center gap-3 p-2 border rounded-xl group transition-all cursor-pointer ${selectedStoreItem?.id === item.id ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50'}`} onClick={() => setSelectedStoreItem(item)}>
                                                <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover bg-slate-100" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-slate-700 truncate">{item.name}</p>
                                                    <p className="text-xs text-slate-400 font-bold">⭐ {item.cost}</p>
                                                </div>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteStoreItem(item.id); }}
                                                    className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        ))}
                                        {storeItems.length === 0 && <p className="text-center text-slate-400 text-sm mt-10">Store is empty.</p>}
                                    </div>
                                    
                                    {selectedStoreItem && (
                                        <div className="pt-4 mt-2 border-t border-slate-100">
                                            <Button 
                                                onClick={handleGiftStoreItem} 
                                                className="w-full text-xs py-2"
                                                disabled={selectedStudentIds.size === 0}
                                            >
                                                Gift Selected Sticker ({selectedStudentIds.size})
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
             </div>
        </div>
      )}

      {/* --- CREATE TAB --- */}
      {activeTab === 'create' && (
        <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-200">
            <SectionHeader title={editingId ? 'Edit Assignment' : 'Create New Assignment'} subtitle="Design a practice session. It will appear on students' dashboards immediately." />
            
            <form onSubmit={handleCreateOrUpdateHomework} className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div>
                        <InputLabel label="Title" />
                        <input 
                            type="text" 
                            required 
                            value={title} 
                            onChange={e => setTitle(e.target.value)} 
                            placeholder="e.g., Week 1: Family Members" 
                            className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 outline-none font-bold text-xl text-slate-700 transition-all placeholder-slate-300" 
                        />
                    </div>
                    <div>
                        <InputLabel label="Task Type" />
                        <div className="relative">
                            <select 
                                value={type} 
                                onChange={e => setType(e.target.value as any)} 
                                className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 outline-none font-bold text-xl text-slate-700 appearance-none cursor-pointer"
                            >
                                <option value="WRITING">✍️ Writing Practice</option>
                                <option value="PINYIN">🗣️ Pinyin Tones</option>
                                <option value="FILL_IN_BLANKS">🧩 Sentence Builder</option>
                            </select>
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                        </div>
                    </div>
                </div>

                <div>
                    <InputLabel label="Instructions (Optional)" />
                    <textarea 
                        value={desc} 
                        onChange={e => setDesc(e.target.value)} 
                        placeholder="Add specific instructions for your students..." 
                        className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 outline-none font-medium text-lg text-slate-700 min-h-[120px] resize-y" 
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div>
                        <InputLabel label="Start Date" />
                        <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 font-bold text-lg text-slate-700" />
                    </div>
                    <div>
                        <InputLabel label="Due Date" />
                        <input type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 font-bold text-lg text-slate-700" />
                    </div>
                </div>
                
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                     <InputLabel label="Assign To Specific Students (Optional)" />
                     <div className="flex flex-wrap gap-4 mt-4">
                         <button 
                            type="button" 
                            onClick={() => setAssignedTo([])} 
                            className={`px-6 py-3 rounded-full text-base font-bold transition-all border-2 ${assignedTo.length === 0 ? 'bg-indigo-500 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'}`}
                         >
                            All Class
                         </button>
                         {studentData.map(student => (
                             <button
                                key={student.id}
                                type="button"
                                onClick={() => toggleStudent(student.id)}
                                className={`px-6 py-3 rounded-full text-base font-bold transition-all border-2 ${assignedTo.includes(student.id) ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'}`}
                             >
                                {student.name}
                             </button>
                         ))}
                     </div>
                </div>

                <div>
                    <InputLabel label="Content (Characters / Sentences)" />
                    <p className="text-base text-slate-400 mb-3 font-medium">Separate items with spaces or commas. For Sentence Builder, separate words with # (e.g., 我#爱#妈妈).</p>
                    <textarea 
                        required 
                        value={chars} 
                        onChange={e => setChars(e.target.value)} 
                        placeholder="Paste characters here..." 
                        className="w-full px-8 py-8 h-64 rounded-[2rem] bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 text-3xl font-serif-sc text-slate-800 leading-relaxed shadow-inner" 
                    />
                </div>

                <Button type="submit" isLoading={isSubmitting} className="w-full py-6 text-xl font-black rounded-2xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200/50">
                    {editingId ? 'Update Assignment' : '🚀 Publish Assignment'}
                </Button>
            </form>
        </div>
      )}

      {/* --- PROGRESS TAB --- */}
      {activeTab === 'progress' && (
         <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-200">
             <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-10 gap-8">
                 <div>
                    <SectionHeader title="Student Progress" subtitle="Track performance and completion rates." />
                 </div>
                 
                 {/* Filters */}
                 <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-5 rounded-[2rem] border border-slate-100">
                    <div className="flex items-center gap-3">
                        <span className="text-slate-400 font-bold text-sm uppercase">From</span>
                        <input 
                            type="date" 
                            value={progressStartDate} 
                            onChange={e => setProgressStartDate(e.target.value)} 
                            className="px-4 py-2 rounded-xl border border-slate-200 text-base font-bold text-slate-700 focus:border-indigo-300 outline-none bg-white"
                        />
                    </div>
                    <span className="text-slate-300 font-bold text-xl">→</span>
                    <div className="flex items-center gap-3">
                        <span className="text-slate-400 font-bold text-sm uppercase">To</span>
                        <input 
                            type="date" 
                            value={progressEndDate} 
                            onChange={e => setProgressEndDate(e.target.value)} 
                            className="px-4 py-2 rounded-xl border border-slate-200 text-base font-bold text-slate-700 focus:border-indigo-300 outline-none bg-white"
                        />
                    </div>
                    <Button onClick={loadTabData} isLoading={isLoadingData} variant="secondary" className="px-8 py-3 text-base rounded-xl ml-4">
                        Refresh Data
                    </Button>
                 </div>
             </div>
             
             {isLoadingData ? (
                 <div className="text-center py-20 text-slate-400 font-bold text-xl animate-pulse">Loading progress data...</div>
             ) : (
                 <div className="overflow-hidden rounded-[2rem] border border-slate-100 shadow-sm">
                     <table className="w-full text-left border-collapse">
                         <thead className="bg-slate-50 text-slate-500 font-bold text-sm uppercase tracking-wider">
                             <tr>
                                 <th className="p-6">Student Name</th>
                                 <th className="p-6">Avg Score</th>
                                 <th className="p-6">Completed Tasks</th>
                                 <th className="p-6">Items Practiced</th>
                                 <th className="p-6">Last Active</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100 text-slate-700 font-medium text-lg bg-white">
                             {studentData.length > 0 ? studentData.map((s, idx) => (
                                 <tr key={s.id} className="hover:bg-indigo-50/30 transition-colors even:bg-slate-50/30">
                                     <td className="p-6 font-bold text-slate-800">{s.name}</td>
                                     <td className="p-6">
                                         <span className={`px-4 py-2 rounded-xl text-base font-black ${s.averageScore >= 90 ? 'bg-emerald-100 text-emerald-700' : s.averageScore >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                             {s.averageScore}%
                                         </span>
                                     </td>
                                     <td className="p-6">{s.assignmentsCompleted}</td>
                                     <td className="p-6 text-slate-500">{s.totalPracticed}</td>
                                     <td className="p-6 text-base text-slate-400 font-mono">
                                         {s.lastActive ? new Date(s.lastActive).toLocaleDateString() : '-'}
                                     </td>
                                 </tr>
                             )) : (
                                <tr><td colSpan={5} className="p-16 text-center text-slate-400 text-lg">No activity found for this period.</td></tr>
                             )}
                         </tbody>
                     </table>
                 </div>
             )}
         </div>
      )}

      {/* --- LOGS TAB --- */}
      {activeTab === 'logs' && (
        <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-8">
                <SectionHeader title="Activity Logs" subtitle="Recent sign-ins and system events." />
                <Button onClick={loadTabData} isLoading={isLoadingData} variant="secondary">
                    Refresh Logs
                </Button>
            </div>
            
            {isLoadingData ? (
                <div className="text-center py-20 text-slate-400 font-bold text-xl animate-pulse">Loading logs...</div>
            ) : (
                <div className="overflow-hidden rounded-[2rem] border border-slate-100 shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-sm uppercase tracking-wider">
                            <tr>
                                <th className="p-6">Time</th>
                                <th className="p-6">Student</th>
                                <th className="p-6">Action</th>
                                <th className="p-6">Device</th>
                                <th className="p-6">ID</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium text-base bg-white">
                            {loginLogs.length > 0 ? loginLogs.map((log, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-6 text-slate-500 font-mono text-sm">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="p-6 font-bold">{log.name}</td>
                                    <td className="p-6">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${log.action === 'Login' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="p-6 text-sm font-bold text-indigo-500">
                                        {log.device || 'Unknown'}
                                    </td>
                                    <td className="p-6 text-slate-400 text-xs font-mono">{log.studentId}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan={5} className="p-16 text-center text-slate-400">No logs found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      )}

      {/* --- CALENDAR TAB --- */}
      {activeTab === 'calendar' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-200">
                  <SectionHeader title={calEditingId ? 'Edit Event' : 'Add Event'} subtitle="Manage school schedule." />
                  
                  <form onSubmit={handleSaveCalendarEvent} className="space-y-8">
                      <div>
                          <InputLabel label="Date" />
                          <input type="date" value={calDate} onChange={e => setCalDate(e.target.value)} required className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 outline-none font-bold text-lg text-slate-700" />
                      </div>
                      <div>
                          <InputLabel label="Event Title" />
                          <input type="text" value={calTitle} onChange={e => setCalTitle(e.target.value)} placeholder="e.g. Mid-term Exam" required className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 outline-none font-bold text-lg text-slate-700" />
                      </div>
                      <div>
                          <InputLabel label="Event Type" />
                          <div className="relative">
                            <select value={calType} onChange={e => setCalType(e.target.value as CalendarEventType)} className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 outline-none font-bold text-lg text-slate-700 appearance-none">
                                <option value="SCHOOL_DAY">🏫 School Day</option>
                                <option value="SPECIAL_EVENT">🎈 Special Event</option>
                                <option value="NO_SCHOOL">🧸 No School (Toys/Play)</option>
                            </select>
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                          </div>
                      </div>
                      <div>
                          <InputLabel label="Description (Optional)" />
                          <textarea value={calDesc} onChange={e => setCalDesc(e.target.value)} rows={3} className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:bg-white focus:border-indigo-300 outline-none font-medium text-lg text-slate-700 resize-none" />
                      </div>
                      <div className="flex gap-4 pt-4">
                          <Button type="submit" className="flex-1 py-5 text-lg rounded-2xl shadow-lg bg-indigo-600" isLoading={isSubmitting}>Save Event</Button>
                          {calEditingId && (
                              <>
                                <Button variant="danger" type="button" onClick={() => handleDeleteCalendarEvent(calEditingId)} className="rounded-2xl">Delete</Button>
                                <Button variant="ghost" type="button" onClick={() => setCalEditingId(null)} className="rounded-2xl">Cancel</Button>
                              </>
                          )}
                      </div>
                  </form>
              </div>
              
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col">
                  <h3 className="text-xl font-bold text-slate-400 uppercase tracking-widest mb-8 px-2">Calendar Preview</h3>
                  <div className="flex-1">
                    <CalendarView 
                        isTeacher 
                        onEventClick={e => {
                            setCalEditingId(e.id); 
                            setCalDate(e.date); 
                            setCalTitle(e.title); 
                            setCalType(e.type); 
                            setCalDesc(e.description || "");
                            setLastSuccess(""); 
                        }} 
                        refreshTrigger={calendarRefreshTrigger}
                    />
                  </div>
              </div>
          </div>
      )}

      {/* --- ASSIGNMENTS LIST TAB --- */}
      {activeTab === 'assignments' && (
          <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-200">
               <SectionHeader title="Library" subtitle="All created assignments." />
               
               {isLoadingData ? (
                   <div className="text-center py-20 text-slate-400 font-bold text-xl">Loading...</div>
               ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {assignments.map(l => (
                            <div key={l.id} className="border-2 border-slate-100 rounded-[2rem] p-8 flex flex-col justify-between hover:border-indigo-200 hover:bg-indigo-50/20 transition-all group shadow-sm hover:shadow-md bg-white">
                                <div className="mb-6">
                                    <div className="flex justify-between items-start mb-3">
                                        <h3 className="font-bold text-2xl text-slate-800">{l.title}</h3>
                                        <span className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase tracking-wide">
                                            {l.type.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <div className="text-base text-slate-500 font-medium space-y-2">
                                        <p className="flex items-center gap-2">📅 {l.startDate} → {l.endDate}</p>
                                        <p className="flex items-center gap-2">🔢 {l.characters.length} Items</p>
                                        {l.assignedTo && l.assignedTo.length > 0 && <p className="text-indigo-600 font-bold flex items-center gap-2">👤 {l.assignedTo.length} Student(s)</p>}
                                    </div>
                                </div>
                                <div className="flex justify-end pt-6 border-t border-slate-100">
                                     <button onClick={() => {
                                         setEditingId(l.id); setTitle(l.title); setDesc(l.description); setChars(l.characters.join(' ')); setType(l.type); setStartDate(l.startDate || ''); setEndDate(l.endDate || ''); setAssignedTo(l.assignedTo || []); setActiveTab('create');
                                     }} className="px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-100 rounded-xl text-sm font-bold hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm">
                                        Edit Assignment
                                     </button>
                                </div>
                            </div>
                        ))}
                    </div>
               )}
          </div>
      )}

      {/* --- COLLECTION MODAL --- */}
      {viewingStudent && (
          <CollectionModal 
              student={viewingStudent} 
              onClose={() => setViewingStudent(null)} 
          />
      )}
    </div>
  );
};
