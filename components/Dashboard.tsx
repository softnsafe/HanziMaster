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

  const renderStatusBadge = (status: string) => {
      switch(status) {
          case 'COMPLETED':
              return <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-bold border border-green-200">Done</span>;
          case 'IN_PROGRESS':
              return <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-xs font-bold border border-yellow-200">In Progress</span>;
          default:
              return <span className="px-2 py-1 rounded bg-stone-100 text-stone-500 text-xs font-bold border border-stone-200">To Do</span>;
      }
  };

  const getVisibleAssignments = () => {
    const today = new Date();
    // Normalize time to ensure fair comparison
    today.setHours(0,0,0,0);
    
    return assignments.filter(lesson => {
      // If dates aren't set, show by default (backward compatibility)
      if (!lesson.startDate && !lesson.endDate) return true;

      let isVisible = true;
      if (lesson.startDate) {
        const start = new Date(lesson.startDate);
        start.setHours(0,0,0,0);
        if (today < start) isVisible = false;
      }
      if (lesson.endDate) {
        const end = new Date(lesson.endDate);
        // End date usually implies "due by end of day", but string is YYYY-MM-DD.
        // Let's normalize comparison.
        end.setHours(0,0,0,0);
        if (today > end) isVisible = false;
      }
      return isVisible;
    });
  };

  const visibleAssignments = getVisibleAssignments();

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-stone-200">
        <div>
          <div className="flex items-center gap-3">
             <h1 className="text-2xl font-bold text-stone-800 font-serif-sc">Welcome, {student.name}</h1>
             <span className={`px-2 py-1 text-xs rounded-full border ${
                 student.scriptPreference === 'Traditional' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-200'
             }`}>
                 {student.scriptPreference === 'Traditional' ? '漢字 (Traditional)' : '汉字 (Simplified)'}
             </span>
          </div>
          <p className="text-stone-500">Class: Mandarin 101</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={onViewReport}>View Progress</Button>
            <Button variant="secondary" onClick={onLogout}>Logout</Button>
        </div>
      </div>

      <section>
        <h2 className="text-xl font-bold text-stone-800 mb-4 flex items-center gap-2">
          <span className="w-2 h-8 bg-red-700 rounded-full"></span>
          Teacher Assignments
        </h2>
        
        {isLoading ? (
          <div className="flex justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleAssignments.length > 0 ? (
              visibleAssignments.map((lesson) => (
                <div key={lesson.id} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-stone-100 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-stone-800">{lesson.title}</h3>
                    {renderStatusBadge(getStatus(lesson.id))}
                  </div>
                  <p className="text-stone-500 text-sm mb-4 flex-grow">{lesson.description}</p>
                  
                  {/* Dates */}
                  {(lesson.endDate) && (
                     <div className="text-xs text-stone-400 mb-3">
                        Due: {new Date(lesson.endDate).toLocaleDateString()}
                     </div>
                  )}

                  <div className="flex flex-wrap gap-2 mb-4">
                    {lesson.characters.map((char, idx) => (
                      <span key={idx} className="w-8 h-8 flex items-center justify-center bg-stone-50 border border-stone-200 rounded text-stone-700 font-serif-sc">
                        {convertCharacter(char, student.scriptPreference)}
                      </span>
                    ))}
                  </div>
                  <Button onClick={() => onStartPractice(lesson)} className="w-full">
                    {getStatus(lesson.id) === 'COMPLETED' ? 'Review Practice' : 'Start Practice'}
                  </Button>
                </div>
              ))
            ) : (
               <div className="col-span-full text-center py-12 bg-stone-50 rounded-xl text-stone-500">
                  {assignments.length > 0 
                    ? "You have no active assignments at this time." 
                    : "No assignments found from the teacher."}
               </div>
            )}
          </div>
        )}
      </section>

      <div className="text-center text-stone-400 text-xs mt-8">
        Assignments are fetched from the connected Google Sheet.
      </div>
    </div>
  );
};