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
  // Initialize with existence check so it starts as "Online" if hardcoded URL exists
  const [isConfigured, setIsConfigured] = useState(!!sheetService.getUrl());

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
  }, []);

  // --- Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const form = e.target as HTMLFormElement;
    
    const nameInput = form.elements.namedItem('name') as HTMLInputElement;
    const passInput = form.elements.namedItem('password') as HTMLInputElement;
    
    const nameVal = nameInput.value.trim();
    const passVal = passInput.value.trim();

    if (nameVal && passVal) {
      setIsLoggingIn(true);
      const tempStudent: Student = {
        id: Date.now().toString(),
        name: nameVal,
        password: passVal,
        joinedAt: new Date().toISOString(),
        scriptPreference: scriptPref
      };
      
      const result = await sheetService.loginStudent(tempStudent);

      if (result.success && result.student) {
         setStudent(result.student); 
         
         // Teacher Detection Logic (Case Insensitive)
         const lowerName = result.student.name.toLowerCase();
         if (lowerName === 'ms. huang' || lowerName === 'teacher') {
            setCurrentView(AppView.TEACHER_DASHBOARD);
         } else {
            const history = await sheetService.getStudentHistory(result.student.name);
            setPracticeRecords(history);
            setCurrentView(AppView.DASHBOARD);
         }
      } else {
         if (result.message === "Backend not configured") {
             setLoginError("App is Offline. Please contact your teacher.");
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
    setLoginError('');
  };

  const handleStartPractice = async (lesson: Lesson) => {
    setCurrentLesson(lesson);
    const converted = lesson.characters.map(c => student ? convertCharacter(c, student.scriptPreference) : c);
    setPracticeQueue(converted);
    setQueueIndex(0);
    setPracticeCount(0);
    setCurrentView(AppView.PRACTICE);
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
        if (!student) return;

        const currentTarget = practiceQueue[queueIndex];
        const newRecord: PracticeRecord = {
            id: Date.now().toString(),
            character: currentTarget,
            score: 100,
            feedback: "Great job! Practice completed.",
            timestamp: Date.now(),
            imageUrl: "" 
        };

        setPracticeRecords(prev => [...prev, newRecord]);
        await sheetService.savePracticeRecord(student.name, newRecord);

        if (queueIndex >= practiceQueue.length - 1 && currentLesson) {
           await sheetService.updateAssignmentStatus(student.id, currentLesson.id, 'COMPLETED');
        }
    }
  };

  // --- Views ---

  const renderLogin = () => (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-400 relative overflow-hidden">
        {/* Background Decorative Elements - Vibrant Mode */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            <div className="absolute top-10 left-10 w-48 h-48 bg-yellow-300 rounded-full mix-blend-screen filter blur-3xl animate-float opacity-60"></div>
            <div className="absolute top-20 right-10 w-64 h-64 bg-cyan-400 rounded-full mix-blend-screen filter blur-3xl animate-float opacity-50" style={{animationDelay: '1s'}}></div>
            <div className="absolute -bottom-10 left-1/3 w-80 h-80 bg-pink-500 rounded-full mix-blend-overlay filter blur-[100px] animate-pulse opacity-60"></div>
        </div>

      {/* Status Indicator & Support Link (Top Right) */}
      <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-3">
          <div 
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm shadow-lg transition-all border-2 select-none ${
                isConfigured 
                ? 'bg-white/90 text-emerald-700 border-emerald-400' 
                : 'bg-white/90 text-rose-700 border-rose-400'
            }`}
          >
              <div className={`w-2.5 h-2.5 rounded-full ${isConfigured ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {isConfigured ? 'Online' : 'Offline'}
          </div>
          
          <a 
            href="https://docs.google.com/forms/d/1lM4Y-EAodS9xg1uWQ4kJyV4p4h2Bmu_6HoLzH2ehsVM/edit" 
            target="_blank" 
            rel="noreferrer" 
            className="text-white/90 text-xs font-bold hover:text-white drop-shadow-md underline decoration-2 underline-offset-2 transition-colors flex items-center gap-1 group"
          >
             <span>Contact Support</span>
             <span className="group-hover:translate-x-0.5 transition-transform">→</span>
          </a>
      </div>

      <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-2xl max-w-md w-full border-4 border-white/40 relative z-10">
        
        <div className="text-center mb-10 mt-4">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-fuchsia-600 mb-2 drop-shadow-sm">
                佛光山中文學校
            </h1>
            <p className="text-slate-500 font-bold text-lg tracking-wide uppercase">Homework Practice</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Name</label>
                <input 
                name="name" 
                type="text" 
                required
                placeholder="Your name"
                className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-slate-200 focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100 outline-none transition-all font-bold text-slate-700 placeholder-slate-300"
                />
            </div>

            <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Password</label>
                <input 
                name="password" 
                type="password" 
                required
                placeholder="Your password"
                className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-slate-200 focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100 outline-none transition-all font-bold text-slate-700 placeholder-slate-300"
                />
            </div>
            
            {/* Script Preference */}
            <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Learning Script</label>
                <div className="grid grid-cols-2 gap-3">
                        <div 
                        onClick={() => setScriptPref('Simplified')}
                        className={`cursor-pointer border-2 rounded-2xl p-3 text-center transition-all ${scriptPref === 'Simplified' ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700 shadow-md shadow-fuchsia-100' : 'border-slate-100 bg-slate-50 hover:bg-white text-slate-400'}`}
                        >
                        <div className="text-2xl font-serif-sc font-bold mb-1">汉字</div>
                        <div className="text-xs font-bold">Simplified</div>
                        </div>
                        <div 
                        onClick={() => setScriptPref('Traditional')}
                        className={`cursor-pointer border-2 rounded-2xl p-3 text-center transition-all ${scriptPref === 'Traditional' ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-md shadow-violet-100' : 'border-slate-100 bg-slate-50 hover:bg-white text-slate-400'}`}
                        >
                        <div className="text-2xl font-serif-sc font-bold mb-1">漢字</div>
                        <div className="text-xs font-bold">Traditional</div>
                        </div>
                </div>
            </div>

          {loginError && (
              <div className="text-rose-600 text-sm text-center bg-rose-50 p-3 rounded-xl border-2 border-rose-100 font-bold animate-bounce">
                  {loginError}
              </div>
          )}

          <Button type="submit" className="w-full text-lg shadow-xl shadow-indigo-300 bg-gradient-to-r from-violet-600 to-indigo-600 border-none hover:from-violet-700 hover:to-indigo-700 text-white transform hover:scale-[1.02]" isLoading={isLoggingIn}>
            Enter Portal
          </Button>
          
          <div className="pt-6 text-center">
            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                This program is designed by Ms. Huang
            </p>
          </div>
        </form>
      </div>
    </div>
  );

  const renderPractice = () => {
    if (practiceQueue.length === 0) return null;

    const currentTarget = practiceQueue[queueIndex];
    const isRoundComplete = practiceCount >= 3;
    const isLessonComplete = isRoundComplete && queueIndex >= practiceQueue.length - 1;

    // Lesson Complete Success Screen
    if (isLessonComplete) {
        return (
            <div className="max-w-xl mx-auto pt-12 animate-float">
                <div className="bg-white p-12 rounded-[3rem] shadow-xl border-4 border-emerald-100 flex flex-col items-center text-center">
                    <div className="text-8xl mb-6 animate-bounce">🌟</div>
                    <h2 className="text-4xl font-extrabold text-emerald-600 mb-4">Awesome Job!</h2>
                    <p className="text-slate-500 text-lg mb-8 font-medium">
                        You finished the lesson!
                    </p>
                    <Button 
                        className="w-full max-w-xs py-4 text-xl" 
                        onClick={() => setCurrentView(AppView.DASHBOARD)}
                    >
                        Back to Dashboard
                    </Button>
                </div>
            </div>
        );
    }

    // Active Practice View
    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-6 flex items-center justify-between">
                <Button variant="ghost" onClick={() => setCurrentView(AppView.DASHBOARD)}>
                    ← Quit
                </Button>
                <div className="flex items-center gap-3">
                    <span className="text-indigo-300 font-bold tracking-widest text-sm">
                        LEVEL {queueIndex + 1} / {practiceQueue.length}
                    </span>
                    <div className="w-12 h-12 flex items-center justify-center bg-indigo-500 rounded-2xl text-2xl font-serif-sc font-bold text-white shadow-lg shadow-indigo-200">
                        {currentTarget}
                    </div>
                </div>
            </div>

            <div className="bg-white/80 backdrop-blur p-8 rounded-[2.5rem] shadow-xl border border-white flex flex-col items-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
                    <div 
                        className="h-full bg-emerald-400 transition-all duration-500 rounded-r-full" 
                        style={{ width: `${((queueIndex) / practiceQueue.length) * 100}%` }}
                    />
                </div>

                <div className="flex gap-2 mb-6 mt-4">
                    {[1, 2, 3].map((step) => (
                        <div 
                            key={step} 
                            className={`w-3 h-3 rounded-full transition-all duration-300 ${
                                step <= practiceCount ? 'bg-emerald-400 scale-110' : 'bg-slate-200'
                            }`}
                        />
                    ))}
                </div>

                <h2 className="text-2xl font-extrabold text-slate-700 mb-2">
                    {isRoundComplete ? 'Good Job!' : `Write it ${3 - practiceCount} more times`}
                </h2>

                {!isRoundComplete ? (
                    <HanziPlayer 
                        key={`${currentTarget}-${practiceCount}`}
                        character={currentTarget} 
                        initialMode="quiz"
                        onComplete={handlePracticeRoundComplete}
                    />
                ) : (
                    <div className="flex flex-col items-center py-12 animate-fade-in">
                        <div className="text-6xl mb-6 animate-bounce">✨</div>
                        <Button 
                            className="w-48 text-lg" 
                            onClick={handleNextCharacter}
                        >
                            Next Word →
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-sky-50 text-slate-800 pb-12 font-sans selection:bg-indigo-100 selection:text-indigo-700">
        {/* Modal */}
        {showSetup && <SetupModal onClose={() => {
            setShowSetup(false);
            setIsConfigured(!!sheetService.getUrl());
        }} />}

        {/* Header */}
        {currentView !== AppView.LOGIN && (
             <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-sky-100 shadow-sm">
                <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div 
                        className="flex items-center gap-3 cursor-pointer group" 
                        onClick={() => {
                            if (student && (student.name === 'Ms. Huang' || student.name === 'Teacher')) {
                                setCurrentView(AppView.TEACHER_DASHBOARD);
                            } else if (student) {
                                setCurrentView(AppView.DASHBOARD);
                            }
                        }}
                    >
                         <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-200 group-hover:rotate-12 transition-transform">
                             📖
                         </div>
                         <div className="flex flex-col">
                             <span className="font-extrabold text-lg text-slate-800 leading-none">佛光山中文學校</span>
                             <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Learning Portal</span>
                         </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {student && (
                            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full ${student.name === 'Ms. Huang' || student.name === 'Teacher' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'}`}>
                                <span className="text-lg">{student.name === 'Ms. Huang' || student.name === 'Teacher' ? '🍎' : '🎓'}</span>
                                <span className="text-sm font-bold">{student.name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>
        )}

      <main className="max-w-5xl mx-auto px-4 pt-8">
        {currentView === AppView.LOGIN && renderLogin()}
        
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

        {currentView === AppView.TEACHER_DASHBOARD && (
            <TeacherDashboard onLogout={handleLogout} onOpenSetup={() => setShowSetup(true)} />
        )}
      </main>
    </div>
  );
};

export default App;