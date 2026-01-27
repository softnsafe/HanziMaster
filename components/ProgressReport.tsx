import React, { useEffect, useState } from 'react';
import { PracticeRecord, Student, Lesson, StudentAssignment } from '../types';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { convertCharacter } from '../utils/characterConverter';

interface ProgressReportProps {
  student: Student;
  records: PracticeRecord[];
  onBack: () => void;
}

export const ProgressReport: React.FC<ProgressReportProps> = ({ student, records, onBack }) => {
  const [assignments, setAssignments] = useState<Lesson[]>([]);
  const [statuses, setStatuses] = useState<StudentAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const [fetchedAssignments, fetchedStatuses] = await Promise.all([
        sheetService.getAssignments(),
        sheetService.getAssignmentStatuses(student.id)
      ]);
      setAssignments(fetchedAssignments);
      setStatuses(fetchedStatuses);
      setIsLoading(false);
    };
    loadData();
  }, [student.id]);

  const getStatus = (lessonId: string) => statuses.find(s => s.assignmentId === lessonId)?.status || 'NOT_STARTED';

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <h1 className="text-2xl font-extrabold text-slate-800">My Trophy Room 🏆</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-indigo-500 text-white p-6 rounded-[2rem] shadow-lg shadow-indigo-200">
            <p className="opacity-80 font-bold text-sm uppercase">Tasks Done</p>
            <p className="text-5xl font-extrabold mt-2">
                {statuses.filter(s => s.status === 'COMPLETED').length}
            </p>
        </div>
        <div className="bg-sky-400 text-white p-6 rounded-[2rem] shadow-lg shadow-sky-200">
            <p className="opacity-80 font-bold text-sm uppercase">Characters</p>
            <p className="text-5xl font-extrabold mt-2">{records.length}</p>
        </div>
        <div className="bg-emerald-400 text-white p-6 rounded-[2rem] shadow-lg shadow-emerald-200">
            <p className="opacity-80 font-bold text-sm uppercase">Score</p>
            <p className="text-5xl font-extrabold mt-2">
                {records.length > 0 ? Math.round(records.reduce((a,b) => a + b.score, 0) / records.length) : '-'}
            </p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50">
             <h3 className="font-extrabold text-xl text-slate-800">Homework History</h3>
        </div>
        <div className="divide-y divide-slate-100">
            {assignments.map(lesson => (
                <div key={lesson.id} className="p-6 flex justify-between items-center hover:bg-slate-50">
                    <div>
                        <div className="font-bold text-slate-800 text-lg">{lesson.title}</div>
                        <div className="text-slate-400 text-sm">{lesson.characters.length} characters</div>
                    </div>
                    <div>
                        {getStatus(lesson.id) === 'COMPLETED' ? (
                            <span className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full font-bold text-sm">Completed</span>
                        ) : (
                             <span className="px-4 py-2 bg-slate-100 text-slate-500 rounded-full font-bold text-sm">To Do</span>
                        )}
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};