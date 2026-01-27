import React, { useState, useEffect } from 'react';
import { Student, PracticeRecord, AppView, ScriptType, Lesson, AssignmentStatus } from './types';
import { Button } from './components/Button';
import { Dashboard } from './components/Dashboard';
import { ProgressReport } from './components/ProgressReport';
import { SetupModal } from './components/SetupModal';
import { HanziPlayer } from './components/HanziPlayer';
import { TeacherDashboard } from './components/TeacherDashboard';
import { sheetService } from './services/sheetService';
import { convertCharacter } from './utils/characterConverter';

const App: React.FC = () => {
  // --- State ---
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOGIN);
  const [student, setStudent] = useState<Student | null>(null);
  const [practiceRecords, setPracticeRecords] = useState<PracticeRecord[]>([]);
  
  // Login State
  const [userRole, setUserRole] = useState<'student' | 'teacher'>('student');
  const [scriptPref, setScriptPref] = useState<ScriptType>('Simplified');
  const [loginError, setLoginError] = useState('');
  
  // Practice Queue State
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [practiceQueue, setPracticeQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [practiceCount, setPracticeCount] = useState(0); // 0, 1, 2, 3 (Done) for current character
  
  // UI State
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  // Check configuration on load
  useEffect(() => {
    // 1. Check for 'backend' query parameter for auto-configuration
    const params = new URLSearchParams(window.location.search);
    const backendParam = params.get('backend');
    
    if (backendParam) {
        try {
            const decodedUrl = decodeURIComponent(backendParam);
            sheetService.saveUrl(decodedUrl);
            // Clean the URL so the token isn't visible in the browser bar
            window.history.replaceState({}, '', window.location.pathname);
            setIsConfigured(true);
        } catch (e) {
            console.error("Failed to parse backend param");
        }
    } else {
        setIsConfigured(!!sheetService.getUrl());
    }

    // 2. If no URL found in storage or params, prompt setup
    const currentUrl = sheetService.getUrl(); // Check storage again
    if (!currentUrl && !backendParam) {
        const timer = setTimeout(() => setShowSetup(true), 500);
        return () => clearTimeout(timer);
    } else if (currentUrl) {
        setIsConfigured(true);
    }
  }, []);

  // --- Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const form = e.target as HTMLFormElement;
    
    if (userRole === 'teacher') {
        const passwordInput = form.elements.namedItem('password') as HTMLInputElement;
        // Simple Teacher Gate (In production, use real auth)
        if (passwordInput.value === '8888') {
             setCurrentView(AppView.TEACHER_DASHBOARD);
        } else {
            alert("Incorrect Teacher PIN (Try 8888)");
        }
        return;
    }

    // Student Login
    const nameInput = form.elements.namedItem('name') as HTMLInputElement;
    const passInput = form.elements.namedItem('password') as HTMLInputElement;

    if (nameInput.value && passInput.value) {
      setIsLoggingIn(true);
      const tempStudent: Student = {
        id: Date.now().toString(), // Temp ID, will be replaced by backend
        name: nameInput.value,
        password: passInput.value,
        joinedAt: new Date().toISOString(),
        scriptPreference: scriptPref
      };
      
      // Attempt login
      const result = await sheetService.loginStudent(tempStudent);

      if (result.success && result.student) {
         setStudent(result.student); // Use the student object returned from backend (with correct ID)
         const history = await sheetService.getStudentHistory(result.student.name);
         setPracticeRecords(history);
         setCurrentView(AppView.DASHBOARD);
      } else {
         if (result.message === "Backend not configured") {
             setLoginError("Please connect the Google Sheet backend first.");
             setShowSetup(true);
         } else {
             setLoginError(result.message || 'Login failed');
         }
      }
      
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setStudent(null);
    setCurrentView(AppView.LOGIN);
    setPracticeRecords([]);
    setUserRole('student');
    setLoginError('');
  };

  const updateStatus = async (status: AssignmentStatus) => {
     if (student && currentLesson) {
         await sheetService.updateAssignmentStatus(student.id, currentLesson.id, status);
     }
  };

  const handleStartPractice = async (lesson: Lesson) => {
    setCurrentLesson(lesson);
    
    // Convert chars if needed
    const converted = lesson.characters.map(c => student ? convertCharacter(c, student.scriptPreference) : c);
    
    setPracticeQueue(converted);
    setQueueIndex(0);
    setPracticeCount(0);
    setCurrentView(AppView.PRACTICE);

    // Optimistically update status to IN_PROGRESS (if not already completed)
    if (student) {
       await sheetService.updateAssignmentStatus(student.id, lesson.id, 'IN_PROGRESS');
    }
  };

  const handleNextCharacter = () => {
    setPracticeCount(0);
    setQueueIndex(prev => prev + 1);
  };

  const handlePracticeRoundComplete = async () => {
    const nextCount = practiceCount + 1;
    setPracticeCount(nextCount);

    if (nextCount >= 3) {
        // Current character complete! Save record.
        if (!student) return;

        const currentTarget = practiceQueue[queueIndex];
        const newRecord: PracticeRecord = {
            id: Date.now().toString(),
            character: currentTarget,
            score: 100, // Full marks for completing drill
            feedback: "Completed 3 practice drills successfully.",
            timestamp: Date.now(),
            imageUrl: "" // No image saved for quiz mode
        };

        setPracticeRecords(prev => [...prev, newRecord]);
        await sheetService.savePracticeRecord(student.name, newRecord);

        // Check if this was the last character of the lesson
        if (queueIndex >= practiceQueue.length - 1 && currentLesson) {
           await sheetService.updateAssignmentStatus(student.id, currentLesson.id, 'COMPLETED');
        }
    }
  };

  // --- Views ---

  const renderLogin = () => (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-stone-200 relative">
        {/* Gear Icon for Setup - Hidden (Grayed out) if configured */}
        <button 
            onClick={() => setShowSetup(true)}
            className={`absolute top-4 right-4 p-2 transition-all duration-300 rounded-full ${
                !isConfigured 
                ? 'opacity-100 text-red-500 animate-pulse hover:bg-red-50' 
                : 'opacity-0 hover:opacity-40 text-stone-400 hover:bg-stone-100' 
            }`}
            title="Configure Backend"
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!isConfigured && (
                <span className="absolute top-0 right-0 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
            )}
        </button>

        <div className="text-center mb-8">
            <h1 className="text-4xl font-serif-sc font-bold text-red-800 mb-2">翰墨 AI</h1>
            <p className="text-stone-500 font-medium">HanziMaster • Handwriting Practice</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {userRole === 'student' ? (
              <>
                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Student Name</label>
                    <input 
                    name="name" 
                    type="text" 
                    required
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
                    <input 
                    name="password" 
                    type="password" 
                    required
                    placeholder="Create or enter password"
                    className="w-full px-4 py-3 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                    />
                </div>
                
                {/* Script Preference */}
                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Preferred Script</label>
                    <div className="grid grid-cols-2 gap-3">
                         <div 
                            onClick={() => setScriptPref('Simplified')}
                            className={`cursor-pointer border rounded-lg p-3 text-center transition-all ${scriptPref === 'Simplified' ? 'border-red-500 bg-red-50 ring-1 ring-red-500' : 'border-stone-200 hover:border-stone-300'}`}
                         >
                            <div className="text-xl font-serif-sc font-bold text-stone-800 mb-1">汉字</div>
                            <div className="text-xs text-stone-500">Simplified</div>
                         </div>
                         <div 
                            onClick={() => setScriptPref('Traditional')}
                            className={`cursor-pointer border rounded-lg p-3 text-center transition-all ${scriptPref === 'Traditional' ? 'border-red-500 bg-red-50 ring-1 ring-red-500' : 'border-stone-200 hover:border-stone-300'}`}
                         >
                            <div className="text-xl font-serif-sc font-bold text-stone-800 mb-1">漢字</div>
                            <div className="text-xs text-stone-500">Traditional</div>
                         </div>
                    </div>
                </div>
              </>
          ) : (
             <div>
                <div className="bg-red-50 border border-red-100 p-3 rounded-lg mb-4 text-center">
                    <p className="text-red-800 font-bold text-sm">Teacher Access Only</p>
                </div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Teacher PIN</label>
                <input 
                name="password" 
                type="password" 
                required
                maxLength={4}
                autoFocus
                placeholder="PIN"
                className="w-full px-4 py-3 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all tracking-widest text-center text-2xl"
                />
            </div>
          )}

          {loginError && (
              <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded flex flex-col gap-1">
                  <span>{loginError}</span>
                  {loginError.includes('configure') && (
                      <span className="text-xs underline cursor-pointer" onClick={() => setShowSetup(true)}>Click here to setup</span>
                  )}
              </div>
          )}

          <Button type="submit" className="w-full justify-center text-lg py-3" isLoading={isLoggingIn}>
            {userRole === 'student' ? 'Login / Register' : 'Enter Portal'}
          </Button>
          
          {userRole === 'student' && (
             <p className="text-xs text-center text-stone-400 mt-4">
               Please enter the name and password provided by your teacher.
             </p>
          )}

          {/* Subtle Switch Link */}
          <div className="mt-8 pt-4 border-t border-stone-100 flex justify-center">
            <button 
                type="button"
                className="text-xs text-stone-300 hover:text-red-600 transition-colors"
                onClick={() => setUserRole(userRole === 'student' ? 'teacher' : 'student')}
            >
                {userRole === 'student' ? 'Teacher Access' : 'Back to Student Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderPractice = () => {
    // Safety check if queue is empty
    if (practiceQueue.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8">
                <p className="mb-4">No characters to practice.</p>
                <Button onClick={() => setCurrentView(AppView.DASHBOARD)}>Back</Button>
            </div>
        );
    }

    const currentTarget = practiceQueue[queueIndex];
    const isRoundComplete = practiceCount >= 3;
    const isLessonComplete = isRoundComplete && queueIndex >= practiceQueue.length - 1;

    // Show completion screen ONLY if the whole lesson is done
    if (isLessonComplete) {
        return (
            <div className="max-w-xl mx-auto animate-scale-in text-center pt-12">
                <div className="bg-white p-12 rounded-3xl shadow-xl border-4 border-green-100 flex flex-col items-center">
                    <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-8 animate-bounce">
                        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-4xl font-bold text-stone-800 mb-4 font-serif-sc">Excellent Work!</h2>
                    <p className="text-stone-500 text-lg mb-8">
                        You have successfully completed all characters in this lesson.
                    </p>
                    <Button 
                        className="w-full max-w-xs justify-center py-4 text-xl" 
                        onClick={() => setCurrentView(AppView.DASHBOARD)}
                    >
                        Return to Dashboard
                    </Button>
                </div>
                
                <div className="mt-8 text-stone-400">
                    <p>Keep up the great spirit!</p>
                    <div className="text-2xl mt-2">加油!</div>
                </div>
            </div>
        );
    }

    // Active Practice View
    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            <div className="mb-6 flex items-center justify-between">
                <Button variant="secondary" onClick={() => setCurrentView(AppView.DASHBOARD)}>Exit</Button>
                <div className="flex items-center gap-2">
                    <span className="text-stone-500 text-sm font-semibold">
                        PROGRESS: {queueIndex + 1}/{practiceQueue.length}
                    </span>
                    <span className="w-10 h-10 flex items-center justify-center bg-white border border-stone-200 rounded text-xl font-serif-sc font-bold text-red-800">
                        {currentTarget}
                    </span>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-stone-100 flex flex-col items-center">
                
                {/* Round Indicators */}
                <div className="flex gap-3 mb-8">
                    {[1, 2, 3].map((step) => (
                        <div 
                            key={step} 
                            className={`w-12 h-2 rounded-full transition-all duration-300 ${
                                step <= practiceCount ? 'bg-green-500' : 'bg-stone-200'
                            }`}
                        />
                    ))}
                </div>

                <h2 className="text-2xl font-bold text-stone-800 mb-2">
                    {isRoundComplete ? 'Good Job!' : `Practice Round ${practiceCount + 1} of 3`}
                </h2>
                <p className="text-stone-500 mb-8 text-center">
                    {isRoundComplete 
                        ? 'Moving to the next character...' 
                        : 'Write the character correctly in the box below to advance.'}
                </p>

                {!isRoundComplete ? (
                    // By changing the key, we force the HanziPlayer to remount and reset its state for the next round
                    <HanziPlayer 
                        key={`${currentTarget}-${practiceCount}`}
                        character={currentTarget} 
                        initialMode="quiz"
                        onComplete={handlePracticeRoundComplete}
                    />
                ) : (
                    // Interstitial "Next Character" state
                    <div className="flex flex-col items-center animate-fade-in">
                        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500 mb-4">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-stone-800 mb-6">Ready for next word?</h3>
                        <Button 
                            className="w-48 justify-center py-3 text-lg" 
                            onClick={handleNextCharacter}
                        >
                            Next Character
                        </Button>
                    </div>
                )}
            </div>
            
            {!isRoundComplete && (
                <p className="text-center text-stone-400 text-xs mt-8 max-w-sm mx-auto">
                    Note: The characters are displayed based on your setting ({student?.scriptPreference}).
                </p>
            )}
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-12">
        {/* Modal */}
        {showSetup && <SetupModal onClose={() => {
            setShowSetup(false);
            setIsConfigured(!!sheetService.getUrl());
        }} />}

        {/* Header (except login) */}
        {currentView !== AppView.LOGIN && (
             <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
                        if (userRole === 'teacher') setCurrentView(AppView.TEACHER_DASHBOARD);
                        else setCurrentView(AppView.DASHBOARD);
                    }}>
                         <div className="w-8 h-8 bg-red-700 rounded flex items-center justify-center text-white font-serif-sc font-bold">文</div>
                         <span className="font-bold text-lg text-stone-800">HanziMaster</span>
                    </div>
                    {student && <div className="text-sm font-medium text-stone-500">Student: {student.name}</div>}
                    {userRole === 'teacher' && <div className="text-sm font-medium text-red-600">Teacher Mode</div>}
                </div>
            </header>
        )}

      <main className="max-w-6xl mx-auto px-4 pt-8">
        {currentView === AppView.LOGIN && renderLogin()}
        
        {/* Student Views */}
        {currentView === AppView.DASHBOARD && student && (
          <Dashboard 
            student={student} 
            onStartPractice={handleStartPractice} 
            onViewReport={() => setCurrentView(AppView.REPORT)}
            onLogout={handleLogout}
          />
        )}
        {currentView === AppView.PRACTICE && renderPractice()}
        {currentView === AppView.REPORT && student && (
            <ProgressReport 
                student={student}
                records={practiceRecords} 
                onBack={() => setCurrentView(AppView.DASHBOARD)} 
            />
        )}

        {/* Teacher Views */}
        {currentView === AppView.TEACHER_DASHBOARD && (
            <TeacherDashboard onLogout={handleLogout} />
        )}
      </main>
    </div>
  );
};

export default App;