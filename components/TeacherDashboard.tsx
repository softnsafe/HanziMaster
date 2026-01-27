import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { Lesson, StudentSummary } from '../types';

interface TeacherDashboardProps {
  onLogout: () => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onLogout }) => {
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
      // Filter out the "Setup Required" mock if it exists
      setAssignments(data.filter(l => l.id !== 'mock-1'));
      setIsLoadingAssignments(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !chars) return;

    setIsSubmitting(true);
    setLastSuccess('');
    setLastError('');

    // Parse characters: Split by comma, space, or chinese comma
    const charArray = chars
        .split(/[,，\s]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0);

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
        setLastError("Please configure the backend URL first in the setup menu.");
        return;
    }
    const appUrl = window.location.origin + window.location.pathname;
    const shareLink = `${appUrl}?backend=${encodeURIComponent(url)}`;
    
    navigator.clipboard.writeText(shareLink);
    setLastSuccess("Shareable Class Link copied to clipboard!");
    setTimeout(() => setLastSuccess(""), 4000);
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-stone-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 font-serif-sc">Teacher Portal</h1>
          <p className="text-stone-500">Manage class and assignments</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleShare} className="text-sm">
                <svg className="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                Copy Class Link
            </Button>
            <Button variant="secondary" onClick={onLogout}>Logout</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-stone-200">
          <button 
            className={`pb-2 px-1 font-medium transition-colors ${activeTab === 'create' ? 'text-red-700 border-b-2 border-red-700' : 'text-stone-500 hover:text-stone-800'}`}
            onClick={() => setActiveTab('create')}
          >
              Create Homework
          </button>
          <button 
            className={`pb-2 px-1 font-medium transition-colors ${activeTab === 'assignments' ? 'text-red-700 border-b-2 border-red-700' : 'text-stone-500 hover:text-stone-800'}`}
            onClick={() => setActiveTab('assignments')}
          >
              View Assignments
          </button>
          <button 
            className={`pb-2 px-1 font-medium transition-colors ${activeTab === 'progress' ? 'text-red-700 border-b-2 border-red-700' : 'text-stone-500 hover:text-stone-800'}`}
            onClick={() => setActiveTab('progress')}
          >
              Student Progress
          </button>
      </div>
      
      {/* Global Success/Error Toast for Teacher Dashboard */}
      {(lastSuccess || lastError) && (
          <div className={`p-3 rounded-lg text-center text-sm font-medium animate-fade-in border ${lastSuccess ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {lastSuccess || lastError}
          </div>
      )}

      {/* CREATE TAB */}
      {activeTab === 'create' && (
        <div className="bg-white p-8 rounded-xl shadow-lg border border-stone-200 animate-fade-in">
            <h2 className="text-xl font-bold text-stone-800 mb-6 flex items-center gap-2">
            <span className="w-2 h-6 bg-red-700 rounded-full"></span>
            Create New Homework
            </h2>

            <form onSubmit={handleCreate} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Assignment Title</label>
                    <input 
                        type="text" 
                        required
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="e.g. Week 4: Family Members"
                        className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Description (Optional)</label>
                    <input 
                        type="text" 
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                        placeholder="e.g. Practice writing terms for family"
                        className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 outline-none"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Start Date</label>
                        <input 
                            type="date" 
                            required
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Due Date</label>
                        <input 
                            type="date" 
                            required
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 outline-none"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Characters</label>
                    <div className="text-xs text-stone-500 mb-2">
                        Separate by comma or space. E.g: <code>爸, 妈, 哥, 姐</code>
                    </div>
                    <textarea 
                        required
                        value={chars}
                        onChange={e => setChars(e.target.value)}
                        placeholder="Type Chinese characters here..."
                        className="w-full px-4 py-2 h-32 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 outline-none font-serif-sc text-lg"
                    />
                </div>

                {/* Preview */}
                {chars.length > 0 && (
                    <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
                        <p className="text-xs font-bold text-stone-500 uppercase mb-2">Preview</p>
                        <div className="flex flex-wrap gap-2">
                            {chars.split(/[,，\s]+/).filter(c => c).map((c, i) => (
                                <span key={i} className="w-8 h-8 flex items-center justify-center bg-white border border-stone-200 rounded text-stone-800 font-serif-sc font-bold shadow-sm">
                                    {c}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <Button type="submit" isLoading={isSubmitting} className="w-full justify-center py-3">
                    Publish Assignment
                </Button>
            </form>
        </div>
      )}

      {/* ASSIGNMENTS LIST TAB */}
      {activeTab === 'assignments' && (
          <div className="bg-white p-8 rounded-xl shadow-lg border border-stone-200 animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                    <span className="w-2 h-6 bg-red-700 rounded-full"></span>
                    Class Assignments
                </h2>
                <Button variant="outline" onClick={loadAssignments} isLoading={isLoadingAssignments} className="text-xs">
                    Refresh List
                </Button>
              </div>

              {isLoadingAssignments ? (
                   <div className="py-12 flex justify-center">
                       <div className="text-stone-400 flex flex-col items-center">
                           <svg className="animate-spin h-8 w-8 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                           </svg>
                           Loading assignments...
                       </div>
                   </div>
              ) : (
                  <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 text-sm">
                                  <th className="py-3 px-4 font-semibold rounded-tl-lg">Title</th>
                                  <th className="py-3 px-4 font-semibold">Start Date</th>
                                  <th className="py-3 px-4 font-semibold">Due Date</th>
                                  <th className="py-3 px-4 font-semibold rounded-tr-lg">Characters</th>
                              </tr>
                          </thead>
                          <tbody>
                              {assignments.map(lesson => (
                                  <tr key={lesson.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                                      <td className="py-3 px-4">
                                          <div className="font-medium text-stone-800">{lesson.title}</div>
                                          <div className="text-xs text-stone-500">{lesson.description}</div>
                                      </td>
                                      <td className="py-3 px-4 text-sm text-stone-600">{lesson.startDate || '-'}</td>
                                      <td className="py-3 px-4 text-sm text-stone-600">{lesson.endDate || '-'}</td>
                                      <td className="py-3 px-4">
                                          <div className="flex gap-1 flex-wrap">
                                              {lesson.characters.map((c, i) => (
                                                  <span key={i} className="inline-block w-6 h-6 leading-6 text-center bg-white border border-stone-200 rounded text-stone-700 font-serif-sc text-xs shadow-sm">
                                                      {c}
                                                  </span>
                                              ))}
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                              {assignments.length === 0 && (
                                  <tr>
                                      <td colSpan={4} className="py-8 text-center text-stone-400">
                                          No assignments found.
                                      </td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      )}

      {/* PROGRESS TAB */}
      {activeTab === 'progress' && (
          <div className="bg-white p-8 rounded-xl shadow-lg border border-stone-200 animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                    <span className="w-2 h-6 bg-red-700 rounded-full"></span>
                    Student Performance
                </h2>
                <Button variant="outline" onClick={loadProgress} isLoading={isLoadingProgress} className="text-xs">
                    Refresh Data
                </Button>
              </div>

              {isLoadingProgress ? (
                   <div className="py-12 flex justify-center">
                       <div className="text-stone-400 flex flex-col items-center">
                           <svg className="animate-spin h-8 w-8 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                           </svg>
                           Loading data...
                       </div>
                   </div>
              ) : (
                  <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 text-sm">
                                  <th className="py-3 px-4 font-semibold rounded-tl-lg">Student Name</th>
                                  <th className="py-3 px-4 font-semibold text-center">Assignments</th>
                                  <th className="py-3 px-4 font-semibold text-center">Practiced</th>
                                  <th className="py-3 px-4 font-semibold text-center">Script</th>
                                  <th className="py-3 px-4 font-semibold text-center">Avg. Score</th>
                                  <th className="py-3 px-4 font-semibold text-right rounded-tr-lg">Last Active</th>
                              </tr>
                          </thead>
                          <tbody>
                              {studentData.length > 0 ? (
                                  studentData.map((student) => (
                                      <tr key={student.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                                          <td className="py-3 px-4 font-medium text-stone-800">{student.name}</td>
                                          <td className="py-3 px-4 text-center">
                                              <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-bold">
                                                  {student.assignmentsCompleted}
                                              </span>
                                          </td>
                                          <td className="py-3 px-4 text-center text-stone-600">
                                              {student.totalPracticed}
                                          </td>
                                          <td className="py-3 px-4 text-center">
                                              {student.script ? (
                                                  <span className={`text-xs px-2 py-1 rounded border ${
                                                      student.script === 'Simplified' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                                                  }`}>
                                                      {student.script}
                                                  </span>
                                              ) : (
                                                  <span className="text-stone-300 text-xs">-</span>
                                              )}
                                          </td>
                                          <td className="py-3 px-4 text-center">
                                              <span className={`font-bold ${
                                                  student.averageScore >= 80 ? 'text-green-600' : 
                                                  student.averageScore >= 60 ? 'text-yellow-600' : 'text-red-500'
                                              }`}>
                                                  {student.averageScore}
                                              </span>
                                          </td>
                                          <td className="py-3 px-4 text-right text-sm text-stone-500">
                                              {student.lastActive ? new Date(student.lastActive).toLocaleDateString() : '-'}
                                          </td>
                                      </tr>
                                  ))
                              ) : (
                                  <tr>
                                      <td colSpan={6} className="py-8 text-center text-stone-400">
                                          No students found.
                                      </td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};