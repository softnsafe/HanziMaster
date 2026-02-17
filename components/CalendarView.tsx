
import React, { useState, useEffect } from 'react';
import { CalendarEvent } from '../types';
import { sheetService } from '../services/sheetService';
import { parseLocalDate, isSameDay } from '../utils/dateUtils';

interface CalendarViewProps {
  isTeacher?: boolean;
  onEventClick?: (event: CalendarEvent) => void;
  onDateSelect?: (date: Date) => void;
  refreshTrigger?: number; // Prop to trigger reload
}

export const CalendarView: React.FC<CalendarViewProps> = React.memo(({ isTeacher, onEventClick, onDateSelect, refreshTrigger = 0 }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, [refreshTrigger]); // Reload when trigger changes

  const loadEvents = async () => {
    setIsLoading(true);
    // Force refresh from backend if triggered by an update
    const force = refreshTrigger > 0;
    const data = await sheetService.getCalendarEvents(force);
    setEvents(data);
    setIsLoading(false);
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const blanks = Array(firstDay).fill(null);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getEventsForDate = (day: number) => {
    // This creates a date in Local Time for the cell
    const cellDate = new Date(year, month, day);
    
    return events.filter(e => {
        if (!e.date) return false;
        // Use robust parser to ensure "2025-02-14" means local Feb 14
        const eventDate = parseLocalDate(e.date);
        return isSameDay(eventDate, cellDate);
    });
  };

  // Helper to normalize backend types like "No School" -> "NO_SCHOOL"
  const normalizeType = (type: string) => {
      if (!type) return 'SCHOOL_DAY';
      return type.toUpperCase().replace(/\s+/g, '_');
  };

  const getEventIcon = (type: string) => {
     const t = normalizeType(type);
     switch(t) {
         case 'SCHOOL_DAY': return '🏫';
         case 'SPECIAL_EVENT': return '🎈';
         case 'NO_SCHOOL': 
         case 'HOLIDAY': return '🧸'; // Toy / Teddy Bear
         default: return '📅';
     }
  };

  const getEventStyle = (type: string) => {
     const t = normalizeType(type);
     switch(t) {
         case 'SCHOOL_DAY': return 'bg-emerald-300 text-emerald-900 border-b-4 border-emerald-500 hover:bg-emerald-400';
         case 'SPECIAL_EVENT': return 'bg-amber-300 text-amber-900 border-b-4 border-amber-500 hover:bg-amber-400';
         case 'NO_SCHOOL': 
         case 'HOLIDAY': 
            // Colorful gradient for No School
            return 'bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 text-purple-900 border-b-4 border-purple-400 hover:brightness-110';
         default: return 'bg-slate-200 text-slate-700 border-b-4 border-slate-400';
     }
  };

  const upcomingEvents = events
    .filter(e => {
        const d = parseLocalDate(e.date);
        const today = new Date();
        today.setHours(0,0,0,0);
        return d >= today;
    })
    .sort((a, b) => {
        return parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime();
    })
    .slice(0, 5);

  return (
    <div className="space-y-6 font-nunito">
        {/* Main Calendar Board */}
        <div className="bg-[#FFFBEB] rounded-[2.5rem] shadow-[0_8px_0_#FDE68A] border-4 border-yellow-200 p-6 animate-fade-in relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-[-20px] left-[-20px] text-yellow-100 text-9xl select-none pointer-events-none">☀</div>
            
            <div className="flex justify-between items-center mb-6 relative z-10">
                <h2 className="text-2xl font-black text-amber-600 flex items-center gap-3 drop-shadow-sm">
                    <span className="text-3xl">📅</span> 
                    {monthNames[month]} <span className="text-amber-400">{year}</span>
                </h2>
                <div className="flex gap-3">
                    <button onClick={prevMonth} className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl text-amber-500 font-bold shadow-[0_4px_0_#fcd34d] hover:scale-105 active:scale-95 border-2 border-amber-100 text-xl transition-all">←</button>
                    <button onClick={nextMonth} className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl text-amber-500 font-bold shadow-[0_4px_0_#fcd34d] hover:scale-105 active:scale-95 border-2 border-amber-100 text-xl transition-all">→</button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-amber-400">
                    <div className="animate-spin text-5xl mb-2">🌞</div>
                    <div className="font-bold">Loading...</div>
                </div>
            ) : (
                <div className="grid grid-cols-7 gap-2 sm:gap-3">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                        <div key={d} className="text-center text-sm font-black text-amber-400 uppercase tracking-wider py-2 bg-white/50 rounded-xl mb-2">{d}</div>
                    ))}
                    
                    {blanks.map((_, i) => <div key={`b-${i}`} className="aspect-square"></div>)}
                    
                    {days.map(day => {
                        const dateEvents = getEventsForDate(day);
                        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                        
                        return (
                        <div 
                            key={day} 
                            onClick={() => isTeacher && onDateSelect && onDateSelect(new Date(year, month, day))}
                            className={`
                                aspect-square rounded-3xl p-1 relative transition-all duration-300 
                                flex flex-col items-center
                                ${isToday 
                                    ? 'bg-sky-400 border-4 border-sky-200 shadow-[0_4px_0_#0ea5e9] transform -translate-y-1 z-10' 
                                    : 'bg-white border-2 border-amber-100 hover:border-amber-300 hover:bg-amber-50'
                                }
                                ${isTeacher ? 'cursor-pointer hover:shadow-md' : ''}
                            `}
                        >
                            <span className={`block text-center text-lg sm:text-xl font-black leading-none mt-1 mb-1 ${isToday ? 'text-white drop-shadow-md' : 'text-slate-400'}`}>
                                {day}
                            </span>
                            
                            <div className="w-full flex flex-col gap-1 items-center overflow-hidden h-full">
                                {dateEvents.slice(0, 2).map(e => (
                                    <div 
                                    key={e.id}
                                    onClick={(ev) => { ev.stopPropagation(); onEventClick?.(e); }}
                                    className={`
                                        w-[95%] text-[8px] sm:text-[9px] font-black px-1.5 py-1 rounded-lg leading-tight truncate cursor-pointer shadow-sm hover:scale-110 active:scale-95 text-center transition-transform
                                        flex items-center justify-center gap-1
                                        ${getEventStyle(e.type)}
                                    `}
                                    title={e.title}
                                    >
                                        <span className="text-xs">{getEventIcon(e.type)}</span>
                                        <span className="truncate">{e.title}</span>
                                    </div>
                                ))}
                                {dateEvents.length > 2 && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></div>
                                )}
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* Legend / Key */}
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 pt-2">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-[0_4px_0_#cbd5e1] border-2 border-slate-100 transform hover:-translate-y-1 transition-transform">
                <span className="text-xl">🏫</span>
                <span className="text-xs font-black text-slate-500 uppercase">School Day</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-[0_4px_0_#cbd5e1] border-2 border-slate-100 transform hover:-translate-y-1 transition-transform">
                <span className="text-xl">🎈</span>
                <span className="text-xs font-black text-slate-500 uppercase">Fun Day</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-[0_4px_0_#cbd5e1] border-2 border-slate-100 transform hover:-translate-y-1 transition-transform">
                <span className="text-xl">🧸</span>
                <span className="text-xs font-black text-slate-500 uppercase">Play Time</span>
            </div>
        </div>

        {/* Upcoming List View */}
        {upcomingEvents.length > 0 && (
            <div className="bg-white rounded-[2.5rem] shadow-lg border-2 border-indigo-50 p-6 relative overflow-hidden">
                <div className="absolute top-[-10px] right-[-10px] text-indigo-50 text-8xl rotate-12 select-none pointer-events-none">🚀</div>
                <h3 className="text-xl font-extrabold text-indigo-900 mb-4 relative z-10">Coming Up Next!</h3>
                <div className="space-y-3 relative z-10">
                    {upcomingEvents.map(e => (
                        <div key={e.id} onClick={() => onEventClick?.(e)} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 hover:bg-indigo-50 transition-colors cursor-pointer border-2 border-transparent hover:border-indigo-100 group">
                             <div className={`
                                 flex flex-col items-center justify-center w-14 h-14 rounded-2xl text-xs font-black leading-tight shadow-[0_4px_0_rgba(0,0,0,0.1)] border-b-4
                                 ${normalizeType(e.type) === 'SCHOOL_DAY' ? 'bg-emerald-300 text-emerald-900 border-emerald-500' : normalizeType(e.type) === 'SPECIAL_EVENT' ? 'bg-amber-300 text-amber-900 border-amber-500' : 'bg-gradient-to-br from-pink-300 to-indigo-300 text-purple-900 border-purple-500'}
                             `}>
                                 <span className="uppercase text-[10px]">{parseLocalDate(e.date).toLocaleString('default', { month: 'short' })}</span>
                                 <span className="text-xl">{parseLocalDate(e.date).getDate()}</span>
                             </div>
                             <div>
                                 <h4 className="font-bold text-slate-700 text-lg group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                                    <span>{getEventIcon(e.type)}</span>
                                    {e.title}
                                 </h4>
                                 <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                     {normalizeType(e.type) === 'NO_SCHOOL' ? 'Play Time 🧸' : normalizeType(e.type) === 'SCHOOL_DAY' ? 'School Day 🏫' : 'Fun Event 🎈'}
                                 </p>
                             </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
  );
});
