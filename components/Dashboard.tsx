import React, { useEffect, useState } from 'react';
import { Lesson, Student, StudentAssignment } from '../types';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { convertCharacter } from '../utils/characterConverter';

interface DashboardProps {
  student: Student;
  onStartPractice: (lesson: Lesson) => void;
  onViewReport: () => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ student, onStartPractice, onViewReport, onLogout }) => {
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  const [statuses, setStatuses] = useState<StudentAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const [lessons, statusList] = await Promise.all([
         sheetService.getAssignments(),
         sheetService.getAssignmentStatuses(student.id)
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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2rem] p-8 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full translate-x-1/3 -translate-y-1/3"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
                <h1 className="text-3xl font-extrabold mb-2">Hello, {student.name}! 👋</h1>
                <p className="opacity-90 font-medium">Ready to practice your Chinese writing?</p>
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
        <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">
          <span className="text-2xl">📚</span> Your Homework
        </h2>
        
        {isLoading ? (
          <div className="flex justify-center py-20">
             <div className="animate-spin text-4xl">⏳</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleAssignments.length > 0 ? (
              visibleAssignments.map((lesson, idx) => {
                const status = getStatus(lesson.id);
                const isCompleted = status === 'COMPLETED';
                const isInProgress = status === 'IN_PROGRESS';
                
                return (
                    <div 
                        key={lesson.id} 
                        className={`group bg-white rounded-[2rem] p-6 shadow-lg border-2 transition-all hover:-translate-y-1 ${
                            isCompleted ? 'border-emerald-200 shadow-emerald-100' : 
                            isInProgress ? 'border-amber-200 shadow-amber-100' : 'border-indigo-100 shadow-indigo-100'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                                {idx + 1}
                            </div>
                            {isCompleted && <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">Done!</span>}
                            {isInProgress && <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">Going</span>}
                            {!isCompleted && !isInProgress && <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold">New</span>}
                        </div>

                        <h3 className="font-bold text-lg text-slate-800 mb-1">{lesson.title}</h3>
                        <p className="text-slate-500 text-sm mb-6 line-clamp-2">{lesson.description}</p>
                        
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
                        
                        <Button 
                            onClick={() => onStartPractice(lesson)} 
                            className="w-full"
                            variant={isCompleted ? 'secondary' : 'primary'}
                        >
                            {isCompleted ? 'Practice Again' : 'Start Lesson'}
                        </Button>
                    </div>
                );
              })
            ) : (
               <div className="col-span-full text-center py-16 bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
                  <div className="text-4xl mb-4">💤</div>
                  <p className="text-slate-500 font-bold">No assignments right now.</p>
               </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};