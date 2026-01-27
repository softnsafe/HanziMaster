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

  // Helper to calculate score for a specific assignment and detect script
  const getAssignmentStats = (lesson: Lesson) => {
    // Prepare potential character sets
    const simpChars = lesson.characters.map(c => convertCharacter(c, 'Simplified'));
    const tradChars = lesson.characters.map(c => convertCharacter(c, 'Traditional'));

    // Helper to count matches
    const getMatches = (targetChars: string[]) => {
        const targetSet = new Set(targetChars);
        const bestScores = new Map<string, number>();
        
        records.forEach(r => {
            if (targetSet.has(r.character)) {
                const currentBest = bestScores.get(r.character) || 0;
                if (r.score > currentBest) bestScores.set(r.character, r.score);
            }
        });
        
        return { count: bestScores.size, scores: Array.from(bestScores.values()) };
    };

    const simpStats = getMatches(simpChars);
    const tradStats = getMatches(tradChars);

    // Heuristic: Use the one with more matches. 
    // If equal (e.g. 0 vs 0, or same chars), default to student's current preference.
    let usedScript = student.scriptPreference;
    let finalStats = (student.scriptPreference === 'Simplified') ? simpStats : tradStats;
    
    if (simpStats.count > tradStats.count) {
        usedScript = 'Simplified';
        finalStats = simpStats;
    } else if (tradStats.count > simpStats.count) {
        usedScript = 'Traditional';
        finalStats = tradStats;
    }

    // Calculate averages
    let totalScore = finalStats.scores.reduce((a, b) => a + b, 0);
    const average = finalStats.count > 0 ? Math.round(totalScore / finalStats.count) : 0;
    const progressPercent = lesson.characters.length > 0 ? Math.round((finalStats.count / lesson.characters.length) * 100) : 0;

    return { average, progressPercent, usedScript };
  };

  const getStatus = (lessonId: string) => {
    return statuses.find(s => s.assignmentId === lessonId)?.status || 'NOT_STARTED';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <h1 className="text-2xl font-bold text-stone-800 font-serif-sc">My Progress</h1>
      </div>

      {/* High Level Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
            <p className="text-sm text-stone-500 uppercase tracking-wide font-semibold">Assignments Completed</p>
            <p className="text-4xl font-bold text-stone-800 mt-2">
                {statuses.filter(s => s.status === 'COMPLETED').length} / {assignments.length}
            </p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
            <p className="text-sm text-stone-500 uppercase tracking-wide font-semibold">Total Characters Practiced</p>
            <p className="text-4xl font-bold text-stone-800 mt-2">{records.length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
            <p className="text-sm text-stone-500 uppercase tracking-wide font-semibold">Overall Grade</p>
            <p className="text-4xl font-bold text-stone-800 mt-2">
                {records.length > 0 
                  ? Math.round(records.reduce((a,b) => a + b.score, 0) / records.length) 
                  : '-'}
            </p>
        </div>
      </div>

      {/* Assignment List */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <h3 className="text-lg font-bold text-stone-800 p-6 border-b border-stone-100 bg-stone-50">
            Homework Status
        </h3>
        
        {isLoading ? (
            <div className="p-12 text-center text-stone-400">Loading your progress...</div>
        ) : (
            <div className="divide-y divide-stone-100">
                {assignments.map(lesson => {
                    const status = getStatus(lesson.id);
                    const stats = getAssignmentStats(lesson);
                    
                    // Determine status color/icon
                    let statusColor = "bg-stone-100 text-stone-500 border-stone-200";
                    let statusText = "Not Started";
                    if (status === 'COMPLETED') {
                        statusColor = "bg-green-100 text-green-700 border-green-200";
                        statusText = "Completed";
                    } else if (status === 'IN_PROGRESS') {
                        statusColor = "bg-yellow-50 text-yellow-700 border-yellow-200";
                        statusText = "In Progress";
                    } else if (stats.progressPercent > 0) {
                        // Infer in progress if they have practiced some chars but not officially started via button
                         statusColor = "bg-yellow-50 text-yellow-700 border-yellow-200";
                         statusText = "In Progress";
                    }

                    return (
                        <div key={lesson.id} className="p-6 hover:bg-stone-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                            
                            {/* Left: Info */}
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                    <h4 className="text-lg font-bold text-stone-800">{lesson.title}</h4>
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${statusColor}`}>
                                        {statusText}
                                    </span>
                                </div>
                                <p className="text-sm text-stone-500 mb-2">{lesson.description}</p>
                                <div className="flex flex-wrap gap-3 text-xs text-stone-400 items-center">
                                    {lesson.startDate ? <span>Start: {lesson.startDate}</span> : null} 
                                    {lesson.endDate ? <span>Due: {lesson.endDate}</span> : null}
                                    
                                    {/* Script Badge */}
                                    <span className="px-2 py-0.5 bg-stone-100 rounded text-stone-500 border border-stone-200">
                                        {stats.usedScript === 'Simplified' ? '汉' : '漢'} {stats.usedScript}
                                    </span>
                                </div>
                            </div>

                            {/* Right: Metrics */}
                            <div className="flex gap-8 md:text-right items-center">
                                <div>
                                    <p className="text-xs text-stone-500 uppercase font-semibold">Progress</p>
                                    <p className="font-medium text-stone-800">{stats.progressPercent}%</p>
                                </div>
                                <div>
                                    <p className="text-xs text-stone-500 uppercase font-semibold">Avg Score</p>
                                    <p className={`font-bold text-xl ${
                                        stats.average >= 80 ? 'text-green-600' : 
                                        stats.average >= 60 ? 'text-yellow-600' : 
                                        stats.average > 0 ? 'text-red-500' : 'text-stone-300'
                                    }`}>
                                        {stats.average || '-'}
                                    </p>
                                </div>
                            </div>

                        </div>
                    );
                })}
                {assignments.length === 0 && (
                    <div className="p-8 text-center text-stone-400">No assignments found.</div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};