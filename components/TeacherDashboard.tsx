
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { Lesson, StudentSummary, LoginLog } from '../types';
import { generateLobbyBackground } from '../services/geminiService';

interface TeacherDashboardProps {
  onLogout: () => void;
  onOpenSetup: () => void;
  onUpdateTheme: (bg: string) => void;
  onResetTheme: () => void;
}

type TabType = 'create' | 'progress' | 'assignments' | 'logs';

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onLogout, onOpenSetup, onUpdateTheme, onResetTheme }) => {
  const [activeTab, setActiveTab] = useState<TabType>('create');
  
  // Create/Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [chars, setChars] = useState('');
  const [type, setType] = useState<'WRITING' | 'PINYIN' | 'FILL_IN_BLANKS'>('WRITING');
  
  // Dates
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
     const d = new Date();
     d.setDate(d.getDate() + 7);
     return d.toISOString().split('T')[0];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSuccess, setLastSuccess] = useState('');
  const [lastError, setLastError] = useState('');

  // Progress State
  const [studentData, setStudentData] = useState<StudentSummary[]>([]);
  
  // Assignments List State
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Logs State
  const [logs, setLogs] = useState<LoginLog[]>([]);

  // Theme State
  const [isGeneratingTheme, setIsGeneratingTheme] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Polling Refs
  const isPolling = useRef(false);
  const pollTimeout = useRef<number | undefined>(undefined);

  // Clear polling on unmount or tab change
  useEffect(() => {
      // Cleanup previous poll if any
      clearTimeout(pollTimeout.current);
      isPolling.current = false;

      // Start new Poll routine based on tab
      const startPoll = async () => {
          // Avoid overlapping calls
          if (isPolling.current) return;
          isPolling.current = true;

          try {
             if (activeTab === 'progress') {
                const data = await sheetService.getAllStudentProgress();
                setStudentData(data);
             } else if (activeTab === 'assignments') {
                const data = await sheetService.getAssignments();
                setAssignments(data.filter(l => l.id !== 'mock-1'));
             } else if (activeTab === 'logs') {
                const data = await sheetService.getLoginLogs();
                setLogs(data);
             }
          } catch(e) {
             console.error("Poll failed", e);
          } finally {
             isPolling.current = false;
             // Schedule next poll only if still on the same tab
             pollTimeout.current = window.setTimeout(startPoll, 10000); 
          }
      };

      // Initial Call
      startPoll();

      return () => {
          clearTimeout(pollTimeout.current);
          isPolling.current = false;
      };
  }, [activeTab]);

  const loadProgress = async (silent = false) => {
      try {
        const data = await sheetService.getAllStudentProgress();
        setStudentData(data);
      } catch (e) {
        console.error("Manual refresh failed", e);
      }
  };

  const loadAssignments = async () => {
      const data = await sheetService.getAssignments();
      setAssignments(data.filter(l => l.id !== 'mock-1'));
  };

  const loadLogs = async () => {
      const data = await sheetService.getLoginLogs();
      setLogs(data);
  };

  const handleEdit = (lesson: Lesson) => {
      setEditingId(lesson.id);
      setTitle(lesson.title);
      setDesc(lesson.description);
      setStartDate(lesson.startDate || '');
      setEndDate(lesson.endDate || '');
      setType(lesson.type);

      if (lesson.type === 'FILL_IN_BLANKS') {
          // Join by newline for text area
          setChars(lesson.characters.join('\n').replace(/，/g, ','));
      } else {
          setChars(lesson.characters.join(' '));
      }
      
      setLastSuccess('');
      setLastError('');
      setActiveTab('create');
  };
  
  const handleDelete = async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this assignment?")) return;
      
      setDeletingId(id);
      const result = await sheetService.deleteAssignment(id);
      setDeletingId(null);
      
      if (result.success) {
          setLastSuccess("Assignment deleted.");
          loadAssignments(); // refresh list
      } else {
          setLastError("Failed to delete: " + result.message);
      }
  };

  const handleCancelEdit = () => {
      setEditingId(null);
      setTitle('');
      setDesc('');
      setChars('');
      // Keep date/type as is for convenience
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !chars) return;

    setIsSubmitting(true);
    setLastSuccess('');
    setLastError('');

    let charArray: string[] = [];

    if (type === 'FILL_IN_BLANKS') {
        // Parse line by line
        charArray = chars.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            // Sanitize commas
            .map(line => line.replace(/,/g, '，')); 
        
        // Validation for new format: Must contain #
        const valid = charArray.every(line => line.includes('#'));

        if (!valid || charArray.length === 0) {
            setLastError("Invalid format. Please use 'Word # Word # Word' to separate blocks.");
            setIsSubmitting(false);
            return;
        }
    } else {
        // Standard split
        charArray = chars.split(/[,，\s]+/).map(c => c.trim()).filter(c => c.length > 0);
    }

    const payload: Lesson = {
        id: editingId ? editingId : `w-${Date.now()}`,
        title: title,
        description: desc,
        characters: charArray,
        startDate: startDate,
        endDate: endDate,
        type: type
    };

    let result;
    if (editingId) {
        result = await sheetService.editAssignment(payload);
    } else {
        result = await sheetService.createAssignment(payload);
    }
    
    setIsSubmitting(false);
    if (result.success) {
        setLastSuccess(editingId ? `Successfully updated: ${title}` : `Successfully created: ${title}`);
        if (!editingId) {
            setTitle('');
            setDesc('');
            setChars('');
        } else {
            // If editing, clear edit mode after success
            setEditingId(null);
            setTitle('');
            setDesc('');
            setChars('');
        }
    } else {
        setLastError(`Error: ${result.message}`);
    }
  };
  
  const handleGenerateTheme = async () => {
     setIsGeneratingTheme(true);
     setLastSuccess('');
     setLastError('');
     
     const img = await generateLobbyBackground();
     if (img) {
         setPreviewImage(img);
     } else {
         setLastError("Failed to generate theme. Please try again.");
     }
     setIsGeneratingTheme(false);
  };

  const handleApplyTheme = () => {
      if (previewImage) {
          onUpdateTheme(previewImage);
          setLastSuccess("Classroom theme updated successfully!");
          setPreviewImage(null);
      }
  };
  
  const handleResetTheme = () => {
      onResetTheme();
      setLastSuccess("Theme reset to default.");
  };

  const renderTypeBadge = (type: string | undefined) => {
    const normalized = type ? type.toUpperCase().trim() : 'WRITING';
    
    if (normalized === 'PINYIN') {
        return <span className="inline-block px-3 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-extrabold uppercase tracking-wide border border-sky-200">Pinyin</span>;
    }
    if (normalized === 'FILL_IN_BLANKS') {
        return <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-extrabold uppercase tracking-wide border border-purple-200">Sentence Builder</span>;
    }
    return <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-extrabold uppercase tracking-wide border border-indigo-200">Writing</span>;
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-8">
      {/* Teacher Header */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-[2rem] shadow-lg border border-orange-100 gap-6">
        <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-3xl">🍎</div>
            <div>
                <h1 className="text-2xl font-extrabold text-slate-800">Teacher Portal</h1>
                <p className="text-slate-500 font-medium">Fo Guang Shan Chinese School</p>
            </div>
        </div>
        <div className="flex flex-wrap gap-3">
             <div className="flex gap-2">
                <Button variant="ghost" onClick={handleGenerateTheme} disabled={isGeneratingTheme} className="border border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100">
                    {isGeneratingTheme ? <span className="animate-spin">🔄</span> : '🎨'} {isGeneratingTheme ? 'Creating...' : 'Theme'}
                </Button>
                <Button variant="ghost" onClick={handleResetTheme} className="border border-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100" title="Reset Theme">
                    ❌
                </Button>
             </div>
            <Button variant="ghost" onClick={onOpenSetup} className="border border-slate-200">
               ⚙️ Backend
            </Button>
            <Button variant="outline" onClick={onLogout}>Exit</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-white/50 rounded-2xl border border-white backdrop-blur overflow-x-auto">
          {[
              { id: 'create', label: editingId ? '✏️ Edit Homework' : '✨ Create Homework' },
              { id: 'assignments', label: '📋 View Assignments' },
              { id: 'progress', label: '📊 Student Progress' },
              { id: 'logs', label: '🕒 Login Logs' }
          ].map(tab => (
              <button 
                key={tab.id}
                className={`flex-1 min-w-[140px] py-3 rounded-xl font-bold transition-all ${
                    activeTab === tab.id 
                    ? 'bg-indigo-500 text-white shadow-md' 
                    : 'text-slate-500 hover:bg-white hover:text-indigo-500'
                }`}
                onClick={() => setActiveTab(tab.id as TabType)}
              >
                  {tab.label}
              </button>
          ))}
      </div>
      
      {(lastSuccess || lastError) && (
          <div className={`p-4 rounded-xl text-center font-bold animate-fade-in border ${lastSuccess ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
              {lastSuccess || lastError}
          </div>
      )}

      {/* CREATE / EDIT TAB */}
      {activeTab === 'create' && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-extrabold text-slate-800">
                    {editingId ? 'Edit Assignment' : 'Create New Assignment'}
                </h2>
                {editingId && (
                    <Button variant="ghost" onClick={handleCancelEdit} className="text-rose-500 hover:bg-rose-50">
                        Cancel Edit
                    </Button>
                )}
            </div>

            <form onSubmit={handleCreateOrUpdate} className="space-y-6">
                <div>
                    <label className="block text-sm font-bold text-slate-500 uppercase mb-2">Title</label>
                    <input 
                        type="text" 
                        required
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="e.g. Lesson 5: Colors"
                        className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 focus:border-indigo-400 outline-none font-bold text-slate-700"
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-500 uppercase mb-2">Description</label>
                    <textarea 
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                        placeholder="Optional instructions for students..."
                        className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 focus:border-indigo-400 outline-none font-medium text-slate-600 resize-none h-24"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-500 uppercase mb-2">Start Date</label>
                        <input 
                            type="date" 
                            required
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 focus:border-indigo-400 outline-none font-bold text-slate-700"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-500 uppercase mb-2">Due Date</label>
                        <input 
                            type="date" 
                            required
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 focus:border-indigo-400 outline-none font-bold text-slate-700"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-500 uppercase mb-2">Homework Type</label>
                    <div className="relative">
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as any)}
                            className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-400 outline-none font-bold text-slate-700 appearance-none bg-white cursor-pointer"
                        >
                            <option value="WRITING">✍️ Writing Practice</option>
                            <option value="PINYIN">🗣️ Pinyin Practice</option>
                            <option value="FILL_IN_BLANKS">🧩 Sentence Builder</option>
                        </select>
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            ▼
                        </div>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-end mb-2">
                        <label className="block text-sm font-bold text-slate-500 uppercase">
                             {type === 'FILL_IN_BLANKS' ? 'Sentences' : 'Characters to Practice'}
                        </label>
                        {type === 'FILL_IN_BLANKS' && (
                             <button
                                type="button"
                                onClick={() => setChars("我#有#一本#書。?你#有#幾本?\n我#是#學生。")}
                                className="text-xs font-bold text-indigo-500 hover:text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg transition-colors border border-indigo-100"
                             >
                                 ✨ Load Example Data
                             </button>
                        )}
                    </div>
                    {type === 'FILL_IN_BLANKS' && (
                        <p className="text-xs text-slate-400 mb-2">
                            Format: Use <code>#</code> to separate Lego blocks. <br/>
                            Example: <code>我 # 有 # 一本 # 書。</code> will create blocks for [我] [有] [一本] [書。]
                        </p>
                    )}
                    <textarea 
                        required
                        value={chars}
                        onChange={e => setChars(e.target.value)}
                        placeholder={
                            type === 'FILL_IN_BLANKS' 
                            ? "我 # 喜欢 # 吃 # 苹果。\n她 # 是 # 老师。" 
                            : "Type Chinese characters separated by space (e.g. 红 橙 黄 绿)"
                        }
                        className="w-full px-5 py-4 h-48 rounded-2xl border-2 border-slate-100 focus:border-indigo-400 outline-none font-serif-sc text-xl"
                    />
                </div>

                <Button type="submit" isLoading={isSubmitting} className="w-full py-4 text-lg">
                    {editingId ? 'Update Assignment' : 'Publish Assignment'}
                </Button>
            </form>
        </div>
      )}

      {/* ASSIGNMENTS LIST TAB */}
      {activeTab === 'assignments' && (
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-extrabold text-slate-800">Assignments Log</h2>
                 <Button variant="outline" onClick={loadAssignments}>Refresh</Button>
               </div>
               
               <div className="overflow-x-auto">
                 <table className="w-full">
                     <thead className="bg-slate-50 text-slate-500 text-sm font-bold uppercase">
                         <tr>
                             <th className="p-4 text-left rounded-l-xl">Title</th>
                             <th className="p-4 text-center">Dates</th>
                             <th className="p-4 text-center">Type</th>
                             <th className="p-4 text-left">Content</th>
                             <th className="p-4 text-right rounded-r-xl">Action</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                         {assignments.map(a => {
                             return (
                             <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4">
                                     <div className="font-bold text-slate-800">{a.title}</div>
                                     <div className="text-xs text-slate-500 font-medium mt-0.5">{a.description}</div>
                                 </td>
                                 <td className="p-4 text-center text-sm font-medium text-slate-600">
                                     {a.startDate} <br/><span className="text-slate-400">to</span><br/> {a.endDate}
                                 </td>
                                 <td className="p-4 text-center">
                                     {renderTypeBadge(a.type)}
                                 </td>
                                 <td className="p-4">
                                     <div className="flex flex-wrap gap-2">
                                         {a.type === 'FILL_IN_BLANKS' ? (
                                             <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                                 {a.characters.length} Questions
                                             </span>
                                         ) : (
                                            <>
                                                {a.characters.slice(0, 5).map((c,i) => (
                                                    <span key={i} className="bg-white px-2 py-1 rounded-lg border border-slate-200 text-sm font-serif-sc text-black font-bold">{c}</span>
                                                ))}
                                                {a.characters.length > 5 && (
                                                    <span className="text-xs text-slate-400 self-center">+{a.characters.length - 5}</span>
                                                )}
                                            </>
                                         )}
                                     </div>
                                 </td>
                                 <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2">
                                         <button 
                                            onClick={() => handleEdit(a)}
                                            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border-2 border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                                            title="Edit Assignment"
                                         >
                                            ✏️
                                         </button>
                                         <button 
                                            onClick={() => handleDelete(a.id)}
                                            disabled={deletingId === a.id}
                                            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border-2 border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-all"
                                            title="Delete Assignment"
                                         >
                                            {deletingId === a.id ? '...' : '🗑️'}
                                         </button>
                                    </div>
                                 </td>
                             </tr>
                         )})}
                         {assignments.length === 0 && (
                             <tr>
                                 <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                                     No assignments found. Create one!
                                 </td>
                             </tr>
                         )}
                     </tbody>
                 </table>
               </div>
          </div>
      )}

      {activeTab === 'progress' && (
         <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50">
             <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                 <div className="flex items-center gap-3">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-800">Class Progress</h2>
                        <p className="text-sm text-slate-400">Completion count by assignment type.</p>
                    </div>
                    {/* Live Indicator */}
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-100 animate-pulse">
                        <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest">Live Updates</span>
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                     <Button variant="outline" className="py-1 px-3 h-8 text-xs" onClick={() => loadProgress(false)}>Refresh Now</Button>
                 </div>
             </div>
             
             <div className="overflow-x-auto">
                 <table className="w-full">
                     <thead className="bg-slate-50 text-slate-500 text-sm font-bold uppercase">
                         <tr>
                             <th className="p-4 text-left rounded-l-xl">Name</th>
                             <th className="p-4 text-center">Avg. Score</th>
                             <th className="p-4 text-center">Activity</th>
                             <th className="p-4 text-center rounded-r-xl">Completed</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                         {studentData.map(s => (
                             <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4 font-bold text-slate-700">{s.name}</td>
                                 <td className="p-4 text-center font-bold text-indigo-600">{s.averageScore}%</td>
                                 <td className="p-4 text-center">
                                     <div className="flex items-center justify-center gap-3">
                                         {/* Completed Breakdown */}
                                         {(s.completedWriting || 0) > 0 && (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold border border-indigo-100" title="Writing">
                                                ✍️ {s.completedWriting}
                                            </span>
                                         )}
                                         
                                         {/* In Progress */}
                                         {s.assignmentsInProgress > 0 && (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold border border-amber-100" title="In Progress">
                                                ⏳ {s.assignmentsInProgress}
                                            </span>
                                         )}
                                     </div>
                                 </td>
                                 <td className="p-4 text-center">
                                     <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                                         {s.assignmentsCompleted}
                                     </span>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>
         </div>
      )}

      {/* LOGIN LOGS TAB */}
      {activeTab === 'logs' && (
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-extrabold text-slate-800">Login Activity</h2>
                 <Button variant="outline" onClick={loadLogs}>Refresh</Button>
               </div>
               
               <div className="overflow-x-auto">
                 <table className="w-full">
                     <thead className="bg-slate-50 text-slate-500 text-sm font-bold uppercase">
                         <tr>
                             <th className="p-4 text-left rounded-l-xl">Time</th>
                             <th className="p-4 text-left">Student Name</th>
                             <th className="p-4 text-left rounded-r-xl">Action</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                         {logs.map((log, idx) => (
                             <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4 text-sm font-mono text-slate-500">
                                     {new Date(log.timestamp).toLocaleString()}
                                 </td>
                                 <td className="p-4 font-bold text-slate-800">
                                     {log.name}
                                 </td>
                                 <td className="p-4">
                                     <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wide">
                                         {log.action}
                                     </span>
                                 </td>
                             </tr>
                         ))}
                         {logs.length === 0 && (
                             <tr>
                                 <td colSpan={3} className="p-8 text-center text-slate-400 font-bold">
                                     No login activity recorded yet.
                                 </td>
                             </tr>
                         )}
                     </tbody>
                 </table>
               </div>
          </div>
      )}

      {/* Theme Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2rem] p-6 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-extrabold text-slate-800">✨ Theme Preview</h3>
                    <button onClick={() => setPreviewImage(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold transition-colors">×</button>
                </div>
                
                <div className="flex-1 bg-slate-100 rounded-xl overflow-hidden relative border-4 border-slate-200 aspect-video mb-6 group shadow-inner">
                     <img src={previewImage} alt="Theme Preview" className="w-full h-full object-cover" />
                     {isGeneratingTheme && (
                         <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-sm">
                             <div className="flex flex-col items-center">
                                 <span className="text-4xl animate-spin mb-2">🔄</span>
                                 <span className="font-bold text-slate-800">Painting new magic...</span>
                             </div>
                         </div>
                     )}
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3">
                    <Button variant="ghost" onClick={() => setPreviewImage(null)} disabled={isGeneratingTheme}>Cancel</Button>
                    <Button variant="outline" onClick={handleGenerateTheme} isLoading={isGeneratingTheme}>
                        🔄 Regenerate
                    </Button>
                    <Button onClick={handleApplyTheme} disabled={isGeneratingTheme}>
                        ✨ Apply Theme
                    </Button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
