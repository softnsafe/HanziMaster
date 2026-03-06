import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { InputLabel } from './InputLabel';
import { sheetService } from '../services/sheetService';
import { TeacherJournalEntry } from '../types';
import { parseLocalDate, getLocalDateString } from '../utils/dateUtils';

interface TeacherJournalProps {
  onExit: () => void;
}

export const TeacherJournal: React.FC<TeacherJournalProps> = ({ onExit }) => {
  const [entries, setEntries] = useState<TeacherJournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<Partial<TeacherJournalEntry>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    loadEntries();
  }, [refreshTrigger]);

  const loadEntries = async () => {
    setIsLoading(true);
    const res = await sheetService.getTeacherJournal(true);
    setEntries(res.entries.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setIsLoading(false);
  };

  const handleEdit = (entry: TeacherJournalEntry) => {
    setCurrentEntry(entry);
    setIsEditing(true);
  };

  const handleNew = () => {
    setCurrentEntry({
      date: getLocalDateString(),
      category: 'CLASS_LOG',
      content: '',
      title: ''
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!currentEntry.title || !currentEntry.date) return;
    const payload = {
      ...currentEntry,
      id: currentEntry.id || `journal-${Date.now()}`
    };
    await sheetService.saveTeacherJournalEntry(payload);
    setIsEditing(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this entry?')) {
      await sheetService.deleteTeacherJournalEntry(id);
      setRefreshTrigger(prev => prev + 1);
      if (isEditing && currentEntry.id === id) setIsEditing(false);
    }
  };

  const insertTemplate = (template: string) => {
      setCurrentEntry(prev => ({
          ...prev,
          content: (prev.content || '') + (prev.content ? '\n\n' : '') + template
      }));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 font-nunito animate-fade-in">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-slate-200">📒</div>
          <div>
            <h1 className="text-3xl font-black text-slate-800">Teacher Journal</h1>
            <p className="text-slate-500 font-bold text-sm">Class logs, lesson plans, and notes</p>
          </div>
        </div>
        <div className="flex gap-3">
            <Button onClick={handleNew} className="px-6">
                + New Entry
            </Button>
            <Button onClick={onExit} variant="ghost" className="bg-white hover:bg-slate-100">
                Exit
            </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-180px)]">
        {/* List View */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-lg font-black text-slate-700">Entries</h2>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
                {isLoading ? (
                    <div className="text-center p-8 text-slate-400">Loading...</div>
                ) : entries.length === 0 ? (
                    <div className="text-center p-8 text-slate-400">No entries yet. Click "+ New Entry" to start.</div>
                ) : (
                    entries.map(entry => (
                        <div 
                            key={entry.id} 
                            onClick={() => handleEdit(entry)}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${currentEntry.id === entry.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-white hover:border-indigo-200'}`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    {parseLocalDate(entry.date).toLocaleDateString()}
                                </span>
                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${
                                    entry.category === 'LESSON_PLAN' ? 'bg-blue-100 text-blue-700' :
                                    entry.category === 'CLASS_LOG' ? 'bg-emerald-100 text-emerald-700' :
                                    entry.category === 'STUDENT_INFO' ? 'bg-amber-100 text-amber-700' :
                                    'bg-slate-100 text-slate-600'
                                }`}>
                                    {entry.category.replace('_', ' ')}
                                </span>
                            </div>
                            <h3 className="font-bold text-slate-800 line-clamp-1">{entry.title}</h3>
                            <p className="text-sm text-slate-500 line-clamp-2 mt-1 font-medium">{entry.content}</p>
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* Editor View */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
            {isEditing ? (
                <>
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <input 
                            value={currentEntry.title || ''}
                            onChange={e => setCurrentEntry(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Entry Title..."
                            className="bg-transparent text-2xl font-black text-slate-800 outline-none placeholder-slate-300 w-full"
                        />
                        <div className="flex gap-2">
                             {currentEntry.id && (
                                <button 
                                    onClick={() => handleDelete(currentEntry.id!)}
                                    className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                                    title="Delete"
                                >
                                    🗑️
                                </button>
                            )}
                            <Button onClick={handleSave} className="px-6 py-2">
                                Save
                            </Button>
                        </div>
                    </div>
                    
                    <div className="p-6 grid grid-cols-2 gap-4 border-b border-slate-100 bg-white">
                        <div>
                            <InputLabel label="Date" />
                            <input 
                                type="date" 
                                value={currentEntry.date || ''}
                                onChange={e => setCurrentEntry(prev => ({ ...prev, date: e.target.value }))}
                                className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <InputLabel label="Category" />
                            <select 
                                value={currentEntry.category || 'OTHER'}
                                onChange={e => setCurrentEntry(prev => ({ ...prev, category: e.target.value as any }))}
                                className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-indigo-400"
                            >
                                <option value="LESSON_PLAN">Lesson Plan 📚</option>
                                <option value="CLASS_LOG">Class Log 📝</option>
                                <option value="STUDENT_INFO">Student Info 👤</option>
                                <option value="OTHER">Other 📌</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <InputLabel label="Tags (comma separated)" />
                            <input 
                                value={currentEntry.tags?.join(', ') || ''}
                                onChange={e => setCurrentEntry(prev => ({ ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                                placeholder="e.g., math, behavior, important"
                                className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-indigo-400"
                            />
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                         {/* Templates Sidebar */}
                         <div className="w-48 bg-slate-50 border-r border-slate-100 p-4 overflow-y-auto hidden md:block">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Templates</h4>
                            <div className="space-y-2">
                                <button onClick={() => insertTemplate("## 📚 Lesson Plan\n- Topic:\n- Materials:\n- Activities:\n")} className="w-full text-left p-2 text-xs font-bold text-slate-600 hover:bg-white hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-slate-200">
                                    📚 Lesson Plan
                                </button>
                                <button onClick={() => insertTemplate("## 📝 Class Log\n- Attendance:\n- Behavior:\n- Notes:\n")} className="w-full text-left p-2 text-xs font-bold text-slate-600 hover:bg-white hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-slate-200">
                                    📝 Class Log
                                </button>
                                <button onClick={() => insertTemplate("## 👤 Student Note\n- Name:\n- Observation:\n- Action:\n")} className="w-full text-left p-2 text-xs font-bold text-slate-600 hover:bg-white hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-slate-200">
                                    👤 Student Note
                                </button>
                            </div>
                         </div>

                        <textarea 
                            value={currentEntry.content || ''}
                            onChange={e => setCurrentEntry(prev => ({ ...prev, content: e.target.value }))}
                            placeholder="Start typing..."
                            className="flex-1 p-6 resize-none outline-none text-lg text-slate-700 leading-relaxed font-medium"
                        />
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                    <div className="text-6xl mb-4">📒</div>
                    <p className="text-xl font-bold">Select an entry or create a new one</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
