import React, { useState } from 'react';
import { Button } from './Button';
import { CalendarView } from './CalendarView';
import { CalendarEvent, CalendarEventType } from '../types';
import { sheetService } from '../services/sheetService';
import { InputLabel } from './InputLabel';
import { parseLocalDate, getLocalDateString } from '../utils/dateUtils';

interface CalendarManagerProps {
  onExit: () => void;
}

export const CalendarManager: React.FC<CalendarManagerProps> = ({ onExit }) => {
  const [calDate, setCalDate] = useState(getLocalDateString());
  const [calTitle, setCalTitle] = useState('');
  const [calType, setCalType] = useState<CalendarEventType>('SCHOOL_DAY');
  const [calDesc, setCalDesc] = useState('');
  const [calPrivateNotes, setCalPrivateNotes] = useState('');
  const [calImageUrl, setCalImageUrl] = useState('');
  const [calEventId, setCalEventId] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastSuccess, setLastSuccess] = useState('');

  const [isJournalExpanded, setIsJournalExpanded] = useState(false);

  const insertTemplate = (template: string) => {
      setCalPrivateNotes(prev => prev + (prev ? '\n\n' : '') + template);
  };

  const handleDateSelect = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      setCalDate(dateStr);
      setCalEventId(null);
      setCalTitle('');
      setCalType('SCHOOL_DAY');
      setCalDesc('');
      setCalPrivateNotes('');
      setCalImageUrl('');
  };

  const handleEventClick = (event: CalendarEvent) => {
      setCalEventId(event.id);
      setCalDate(event.date);
      setCalTitle(event.title);
      setCalType(event.type);
      setCalDesc(event.description || '');
      setCalPrivateNotes(event.privateNotes || '');
      setCalImageUrl(event.imageUrl || '');
  };

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!calTitle || !calDate) return;

      setIsSubmitting(true);
      const payload: CalendarEvent = {
          id: calEventId || `evt-${Date.now()}`,
          date: calDate,
          title: calTitle,
          type: calType,
          description: calDesc,
          privateNotes: calPrivateNotes,
          imageUrl: calImageUrl
      };

      const result = await sheetService.saveCalendarEvent(payload);
      if (result.success) {
          setLastSuccess(calEventId ? "Event Updated!" : "Event Created!");
          setRefreshTrigger(prev => prev + 1);
          if (!calEventId) {
              setCalTitle('');
              setCalDesc('');
              setCalPrivateNotes('');
              setCalImageUrl('');
          }
          setTimeout(() => setLastSuccess(''), 3000);
      }
      setIsSubmitting(false);
  };

  const handleDelete = async () => {
      if (!calEventId || !confirm("Are you sure you want to delete this event?")) return;
      setIsSubmitting(true);
      const result = await sheetService.deleteCalendarEvent(calEventId);
      if (result.success) {
          setLastSuccess("Event Deleted");
          setRefreshTrigger(prev => prev + 1);
          setCalEventId(null);
          setCalTitle('');
          setCalDesc('');
          setCalPrivateNotes('');
          setCalImageUrl('');
          setTimeout(() => setLastSuccess(''), 3000);
      }
      setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 font-nunito animate-fade-in">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-slate-200">📅</div>
            <div>
                <h1 className="text-3xl font-black text-slate-800">Calendar Manager</h1>
                <p className="text-slate-500 font-bold text-sm">Manage school events and schedule</p>
            </div>
          </div>
          <Button onClick={onExit} variant="ghost" className="bg-white hover:bg-slate-100">← Back to Dashboard</Button>
      </div>
      
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Calendar */}
          <div className="lg:col-span-2">
              <CalendarView isTeacher onDateSelect={handleDateSelect} onEventClick={handleEventClick} refreshTrigger={refreshTrigger} />
          </div>

          {/* Right: Editor */}
          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 h-fit sticky top-6">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-black text-slate-700">
                      {calEventId ? 'Edit Event' : 'New Event'}
                  </h2>
                  {calDate && <span className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-500">{calDate}</span>}
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                  <div>
                      <InputLabel label="Event Title" />
                      <input 
                          type="text" 
                          value={calTitle} 
                          onChange={e => setCalTitle(e.target.value)} 
                          placeholder="e.g. Field Trip" 
                          className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-slate-700"
                          required
                      />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <InputLabel label="Date" />
                          <input 
                              type="date" 
                              value={calDate} 
                              onChange={e => setCalDate(e.target.value)} 
                              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-slate-700"
                              required
                          />
                      </div>
                      <div>
                          <InputLabel label="Type" />
                          <select 
                              value={calType} 
                              onChange={e => setCalType(e.target.value as CalendarEventType)}
                              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-slate-700"
                          >
                              <option value="SCHOOL_DAY">School Day 🏫</option>
                              <option value="SPECIAL_EVENT">Special Event 🎈</option>
                              <option value="NO_SCHOOL">No School 🧸</option>
                              <option value="HOLIDAY">Holiday 🎄</option>
                          </select>
                      </div>
                  </div>

                  <div>
                      <InputLabel label="Description (Public)" />
                      <textarea 
                          value={calDesc} 
                          onChange={e => setCalDesc(e.target.value)} 
                          placeholder="Details visible to students..." 
                          className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-400 min-h-[80px]" 
                      />
                  </div>

                  <div>
                      <InputLabel label="Image URL (Optional)" />
                      <input 
                          type="url" 
                          value={calImageUrl} 
                          onChange={e => setCalImageUrl(e.target.value)} 
                          placeholder="https://example.com/image.jpg" 
                          className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-400 text-slate-600 text-sm"
                      />
                      {calImageUrl && (
                          <div className="mt-2 rounded-xl overflow-hidden border-2 border-slate-100 h-32 w-full bg-slate-50 flex items-center justify-center relative">
                              <img src={calImageUrl} alt="Preview" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                              <div className="absolute inset-0 pointer-events-none shadow-inner"></div>
                          </div>
                      )}
                  </div>

                  <div>
                      <div className="flex justify-between items-center mb-1">
                          <InputLabel label="Teacher Journal & Notes 🔒" />
                          <button 
                              type="button" 
                              onClick={() => setIsJournalExpanded(true)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors"
                          >
                              ⤢ Expand
                          </button>
                      </div>
                      <textarea 
                          value={calPrivateNotes} 
                          onChange={e => setCalPrivateNotes(e.target.value)} 
                          placeholder="Lesson plans, observations, reminders..." 
                          className="w-full px-4 py-3 bg-amber-50 border-2 border-amber-200 rounded-xl font-medium outline-none focus:border-amber-400 text-amber-900 placeholder-amber-700/50 min-h-[120px]" 
                      />
                  </div>

                  {lastSuccess && (
                      <div className="bg-emerald-100 text-emerald-700 px-4 py-3 rounded-xl text-center font-bold text-sm animate-bounce-in">
                          {lastSuccess}
                      </div>
                  )}

                  <div className="flex gap-3 pt-2">
                      <Button type="submit" isLoading={isSubmitting} className="flex-1 py-4 text-lg">
                          {calEventId ? "Update Event" : "Create Event"}
                      </Button>
                      {calEventId && (
                          <Button type="button" variant="danger" onClick={handleDelete} className="px-4">
                              🗑️
                          </Button>
                      )}
                  </div>
                  
                  {calEventId && (
                      <Button type="button" variant="ghost" onClick={() => {
                          setCalEventId(null);
                          setCalTitle('');
                          setCalDesc('');
                          setCalPrivateNotes('');
                          setCalImageUrl('');
                      }} className="w-full text-slate-400 hover:text-slate-600">
                          Cancel Edit
                      </Button>
                  )}
              </form>
          </div>
      </div>
      {/* Journal Expansion Modal */}
      {isJournalExpanded && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-slide-up">
                  <div className="bg-amber-50 p-6 border-b border-amber-100 flex justify-between items-center">
                      <div>
                          <h2 className="text-2xl font-black text-amber-900 flex items-center gap-2">
                              <span>📒</span> Teacher Journal
                          </h2>
                          <p className="text-amber-700 font-bold text-sm opacity-80">
                              {calDate ? parseLocalDate(calDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'No Date Selected'}
                          </p>
                      </div>
                      <div className="flex gap-3">
                          <button 
                              type="button"
                              onClick={() => setIsJournalExpanded(false)}
                              className="px-4 py-2 bg-white border-2 border-amber-200 text-amber-800 font-bold rounded-xl hover:bg-amber-100 transition-colors"
                          >
                              Done
                          </button>
                      </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
                      {/* Sidebar Tools */}
                      <div className="w-full md:w-64 bg-slate-50 p-6 border-r border-slate-200 overflow-y-auto space-y-6">
                          <div>
                              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Quick Templates</h3>
                              <div className="space-y-2">
                                  <button 
                                      type="button" 
                                      onClick={() => insertTemplate("## 📚 Lesson Plan\n- Topic:\n- Materials:\n- Activities:\n")}
                                      className="w-full text-left px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all shadow-sm text-sm"
                                  >
                                      📚 Lesson Plan
                                  </button>
                                  <button 
                                      type="button" 
                                      onClick={() => insertTemplate("## 📝 Class Log\n- Attendance:\n- Behavior:\n- Notes:\n")}
                                      className="w-full text-left px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all shadow-sm text-sm"
                                  >
                                      📝 Class Log
                                  </button>
                                  <button 
                                      type="button" 
                                      onClick={() => insertTemplate("## 🔮 Next Class\n- Prepare:\n- Reminders:\n")}
                                      className="w-full text-left px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-all shadow-sm text-sm"
                                  >
                                      🔮 Next Class
                                  </button>
                              </div>
                          </div>
                          
                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                              <h3 className="text-xs font-black text-blue-800 uppercase tracking-wider mb-2">Tip</h3>
                              <p className="text-xs text-blue-700 font-medium leading-relaxed">
                                  Use this space to reflect on your teaching, track student progress, or plan ahead. Only you can see this content.
                              </p>
                          </div>
                      </div>

                      {/* Main Editor */}
                      <div className="flex-1 bg-white p-6 md:p-8 overflow-hidden flex flex-col">
                          <textarea 
                              value={calPrivateNotes} 
                              onChange={e => setCalPrivateNotes(e.target.value)} 
                              placeholder="Start typing your journal entry here..." 
                              className="w-full h-full resize-none outline-none text-lg text-slate-700 leading-relaxed placeholder-slate-300 font-medium"
                              autoFocus
                          />
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
