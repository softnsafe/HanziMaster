import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { Lesson, StudentSummary } from '../types';

interface TeacherDashboardProps {
  onLogout: () => void;
  onOpenSetup: () => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onLogout, onOpenSetup }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'progress' | 'assignments'>('create');
  
  // Create State
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [chars, setChars] = useState('');
  
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
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);

  // Assignments List State
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  useEffect(() => {
    if (activeTab === 'progress') {
        loadProgress();
    } else if (activeTab === 'assignments') {
        loadAssignments();
    }
  }, [activeTab]);

  const loadProgress = async () => {
      setIsLoadingProgress(true);
      const data = await sheetService.getAllStudentProgress();
      setStudentData(data);
      setIsLoadingProgress(false);
  };

  const loadAssignments = async () => {
      setIsLoadingAssignments(true);
      const data = await sheetService.getAssignments();
      setAssignments(data.filter(l => l.id !== 'mock-1'));
      setIsLoadingAssignments(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !chars) return;

    setIsSubmitting(true);
    setLastSuccess('');
    setLastError('');

    const charArray = chars.split(/[,，\s]+/).map(c => c.trim()).filter(c => c.length > 0);

    const newLesson: Lesson = {
        id: `w-${Date.now()}`,
        title: title,
        description: desc,
        characters: charArray,
        startDate: startDate,
        endDate: endDate
    };

    const result = await sheetService.createAssignment(newLesson);
    
    setIsSubmitting(false);
    if (result.success) {
        setLastSuccess(`Successfully created: ${title}`);
        setTitle('');
        setDesc('');
        setChars('');
    } else {
        setLastError(`Error: ${result.message}`);
    }
  };

  const handleShare = () => {
    const url = sheetService.getUrl();
    if (!url) {
        setLastError("Please connect backend first.");
        return;
    }
    const appUrl = window.location.origin + window.location.pathname;
    const shareLink = `${appUrl}?backend=${encodeURIComponent(url)}`;
    
    navigator.clipboard.writeText(shareLink);
    setLastSuccess("Class Link copied! Send this to students.");
    setTimeout(() => setLastSuccess(""), 4000);
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
            <Button variant="ghost" onClick={onOpenSetup} className="border border-slate-200">
               ⚙️ Backend Setup
            </Button>
            <Button variant="secondary" onClick={handleShare}>
                🔗 Copy Class Link
            </Button>
            <Button variant="outline" onClick={onLogout}>Exit</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-white/50 rounded-2xl border border-white backdrop-blur">
          {[
              { id: 'create', label: '✨ Create Homework' },
              { id: 'assignments', label: '📋 View Assignments' },
              { id: 'progress', label: '📊 Student Progress' }
          ].map(tab => (
              <button 
                key={tab.id}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                    activeTab === tab.id 
                    ? 'bg-indigo-500 text-white shadow-md' 
                    : 'text-slate-500 hover:bg-white hover:text-indigo-500'
                }`}
                onClick={() => setActiveTab(tab.id as any)}
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

      {/* CREATE TAB */}
      {activeTab === 'create' && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50">
            <h2 className="text-xl font-extrabold text-slate-800 mb-6">Create New Assignment</h2>

            <form onSubmit={handleCreate} className="space-y-6">
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
                    <label className="block text-sm font-bold text-slate-500 uppercase mb-2">Characters to Practice</label>
                    <textarea 
                        required
                        value={chars}
                        onChange={e => setChars(e.target.value)}
                        placeholder="Type Chinese characters separated by space (e.g. 红 橙 黄 绿)"
                        className="w-full px-5 py-4 h-32 rounded-2xl border-2 border-slate-100 focus:border-indigo-400 outline-none font-serif-sc text-xl"
                    />
                </div>

                <Button type="submit" isLoading={isSubmitting} className="w-full py-4 text-lg">
                    Publish Assignment
                </Button>
            </form>
        </div>
      )}

      {/* OTHER TABS (Simplified for brevity, similar styling applied) */}
      {activeTab === 'assignments' && (
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-extrabold text-slate-800">Assignments Log</h2>
                 <Button variant="outline" onClick={loadAssignments}>Refresh</Button>
               </div>
               
               {/* List */}
               <div className="space-y-4">
                  {assignments.map(a => (
                      <div key={a.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                          <div>
                              <div className="font-bold text-slate-800">{a.title}</div>
                              <div className="text-xs text-slate-500">{a.startDate} to {a.endDate}</div>
                          </div>
                          <div className="flex gap-2">
                             {a.characters.map((c,i) => <span key={i} className="bg-white px-2 py-1 rounded-lg border border-slate-200 text-sm font-serif-sc">{c}</span>)}
                          </div>
                      </div>
                  ))}
               </div>
          </div>
      )}

      {activeTab === 'progress' && (
         <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50">
             <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-extrabold text-slate-800">Class Progress</h2>
                 <Button variant="outline" onClick={loadProgress}>Refresh</Button>
             </div>
             
             <div className="overflow-x-auto">
                 <table className="w-full">
                     <thead className="bg-slate-50 text-slate-500 text-sm font-bold uppercase">
                         <tr>
                             <th className="p-4 text-left rounded-l-xl">Name</th>
                             <th className="p-4 text-center">Score</th>
                             <th className="p-4 text-center rounded-r-xl">Completed</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                         {studentData.map(s => (
                             <tr key={s.id} className="hover:bg-slate-50">
                                 <td className="p-4 font-bold text-slate-700">{s.name}</td>
                                 <td className="p-4 text-center font-bold text-indigo-600">{s.averageScore}%</td>
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

    </div>
  );
};