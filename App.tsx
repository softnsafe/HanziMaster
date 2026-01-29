
import React, { useState, useEffect } from 'react';
import { Student, PracticeRecord, AppView, ScriptType, Lesson, PracticeMode, AssignmentStatus } from './types';
import { Button } from './components/Button';
import { Dashboard } from './components/Dashboard';
import { ProgressReport } from './components/ProgressReport';
import { SetupModal } from './components/SetupModal';
import { HanziPlayer } from './components/HanziPlayer';
import { TeacherDashboard } from './components/TeacherDashboard';
import { PinyinGame } from './components/PinyinGame';
import { FillInBlanksGame } from './components/FillInBlanksGame';
import { SupportWidget } from './components/SupportWidget';
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
  const [showPassword, setShowPassword] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Theme State
  const [bgImage, setBgImage] = useState<string | null>(null);

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

    // 2. Load cached background
    const cachedBg = localStorage.getItem('hanzi_master_bg_theme');
    if (cachedBg) {
        setBgImage(cachedBg);
    }
  }, []);

  // --- Helpers ---
  
  const checkAssignmentCompletion = async (lesson: Lesson, records: PracticeRecord[]) => {
      if (!student) return;

      const type = lesson.type;
      let isComplete = false;

      if (type === 'FILL_IN_BLANKS') {
          // Check fill in blanks: Check if all "Answers" have a record
          isComplete = lesson.characters.every(item => {
              const parts = item.split('#');
              if (parts.length < 2) return true; // skip broken items
              const answer = parts[1].trim();
              const targetChar = convertCharacter(answer, student.scriptPreference);
              return records.some(r => r.character === targetChar && r.type === 'FILL_IN_BLANKS' && r.score === 100);
          });
      } else if (type === 'PINYIN') {
          isComplete = lesson.characters.every(char => {
              const targetChar = convertCharacter(char, student.scriptPreference);
              return records.some(r => r.character === targetChar && r.type === 'PINYIN' && r.score === 100);
          });
      } else {
          // Default Writing
          isComplete = lesson.characters.every(char => {
              const targetChar = convertCharacter(char, student.scriptPreference);
              return records.some(r => r.character === targetChar && (r.type || 'WRITING') === 'WRITING' && r.score === 100);
          });
      }

      let status: AssignmentStatus = 'IN_PROGRESS';
      if (isComplete) {
          status = 'COMPLETED';
      }

      await sheetService.updateAssignmentStatus(student.id, lesson.id, status);
  };

  const handleUpdateTheme = (newImage: string) => {
      setBgImage(newImage);
      localStorage.setItem('hanzi_master_bg_theme', newImage);
  };

  const handleResetTheme = () => {
      setBgImage(null);
      localStorage.removeItem('hanzi_master_bg_theme');
  };

  // --- Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    const nameVal = loginName.trim();
    const passVal = loginPassword.trim();

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
    setShowPassword(false);
    setLoginName('');
    setLoginPassword('');
  };

  const handleStartPractice = async (lesson: Lesson, mode: PracticeMode) => {
    setCurrentLesson(lesson);
    // Convert characters based on script preference before queueing
    // Note: For Fill In Blanks, characters array contains "Question#Answer" strings, so we shouldn't convert them yet.
    // The Game components handle parsing/conversion.
    
    let converted = lesson.characters;
    if (mode === 'WRITING' || mode === 'PINYIN') {
        converted = lesson.characters.map(c => student ? convertCharacter(c, student.scriptPreference) : c);
    }

    setPracticeQueue(converted);
    setQueueIndex(0);
    setPracticeCount(0);

    if (mode === 'WRITING') {
        setCurrentView(AppView.PRACTICE_WRITING);
    } else if (mode === 'PINYIN') {
        setCurrentView(AppView.PRACTICE_PINYIN);
    } else if (mode === 'FILL_IN_BLANKS') {
        setCurrentView(AppView.PRACTICE_FILL_IN_BLANKS);
    }

    if (student) {
       await sheetService.updateAssignmentStatus(student.id, lesson.id, 'IN_PROGRESS');
    }
  };

  const handleNextWritingCharacter = () => {
    setPracticeCount(0);
    setQueueIndex(prev => prev + 1);
  };

  const handleWritingRoundComplete = async () => {
    const nextCount = practiceCount + 1;
    setPracticeCount(nextCount);

    if (nextCount >= 3) {
        if (!student) return;

        const currentTarget = practiceQueue[queueIndex];
        const newRecord: PracticeRecord = {
            id: Date.now().toString(),
            character: currentTarget,
            score: 100,
            details: "Great job! Practice completed.",
            timestamp: Date.now(),
            imageUrl: "",
            type: 'WRITING'
        };

        const updatedRecords = [...practiceRecords, newRecord];
        setPracticeRecords(updatedRecords);
        await sheetService.savePracticeRecord(student.name, newRecord);

        if (currentLesson) {
             await checkAssignmentCompletion(currentLesson, updatedRecords);
        }
    }
  };
  
  const handleGenericRecord = async (char: string, score: number, type: PracticeMode) => {
      if (!student) return;
      
      const newRecord: PracticeRecord = {
        id: Date.now().toString(),
        character: char,
        score: score,
        details: score === 100 ? "Correct" : "Incorrect",
        timestamp: Date.now(),
        type: type
      };
      
      let updatedRecords = practiceRecords;
      if (score === 100) {
        updatedRecords = [...practiceRecords, newRecord];
        setPracticeRecords(updatedRecords);
      }
      await sheetService.savePracticeRecord(student.name, newRecord);
  };

  const handleGameComplete = async () => {
      if (currentLesson && student) {
          await checkAssignmentCompletion(currentLesson, practiceRecords);
      }
      setCurrentView(AppView.DASHBOARD);
  };

  // --- Views ---

  const renderLogin = () => (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden transition-all duration-700">
      
      {/* BACKGROUND LAYER - FIXED & FULLSCREEN */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-700"
        style={{ 
             backgroundImage: bgImage ? `url(${bgImage})` : 'linear-gradient(to bottom right, #bae6fd, #e0f2fe, #eff6ff)', // Sky Gradient
             backgroundColor: '#f0f9ff'
        }}
      >
        {/* Optional overlay to improve text readability if needed */}
        {bgImage && <div className="absolute inset-0 bg-black/10"></div>}

        {/* Fallback Background Decorations (only if no AI image) */}
        {!bgImage && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                {/* Subtle Grid */}
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                
                {/* Cloud 1 - Top Left */}
                <div className="absolute top-10 left-[5%] text-white w-48 animate-float drop-shadow-lg opacity-90" style={{ animationDuration: '8s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5,19c-3.037,0-5.5-2.463-5.5-5.5c0-0.34,0.032-0.673,0.091-1C9.224,12.783,5,15.111,5,18c0,0.552,0.448,1,1,1h11.5 C17.948,19,18,19,17.5,19z M19,5.5c-3.037,0-5.5,2.463-5.5,5.5c0,0.573,0.09,1.123,0.252,1.641C13.235,12.21,12.636,12,12,12 c-3.313,0-6,2.687-6,6c0,0.485,0.063,0.957,0.174,1.408C6.113,19.224,6,19.096,6,19h13c2.761,0,5-2.239,5-5S21.761,9,19,9V5.5z" /></svg>
                </div>
                
                {/* Cloud 2 - Top Right */}
                <div className="absolute top-24 right-[10%] text-white w-32 animate-float drop-shadow-md opacity-80" style={{ animationDuration: '12s', animationDelay: '1s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c.276 0 .548.026.812.072C18.675 8.653 15.65 6 12 6c-3.23 0-5.96 2.067-6.84 5h-.66c-2.485 0-4.5 2.015-4.5 4.5S2.015 20 4.5 20h14c3.037 0 5.5-2.463 5.5-5.5S21.537 9 18.5 9z" /></svg>
                </div>

                {/* Cloud 3 - Middle Left */}
                <div className="absolute top-[45%] left-[-2%] text-white/80 w-64 animate-float drop-shadow-sm opacity-60" style={{ animationDuration: '15s', animationDelay: '2s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19,5.5c-3.037,0-5.5,2.463-5.5,5.5c0,0.573,0.09,1.123,0.252,1.641C13.235,12.21,12.636,12,12,12 c-3.313,0-6,2.687-6,6c0,0.485,0.063,0.957,0.174,1.408C6.113,19.224,6,19.096,6,19h13c2.761,0,5-2.239,5-5S21.761,9,19,9V5.5z" /></svg>
                </div>

                {/* Cloud 4 - Bottom Right */}
                <div className="absolute bottom-[15%] right-[5%] text-white w-56 animate-float drop-shadow-xl opacity-80" style={{ animationDuration: '10s', animationDelay: '0.5s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5,19c-3.037,0-5.5-2.463-5.5-5.5c0-0.34,0.032-0.673,0.091-1C9.224,12.783,5,15.111,5,18c0,0.552,0.448,1,1,1h11.5 C17.948,19,18,19,17.5,19z M19,5.5c-3.037,0-5.5,2.463-5.5,5.5c0,0.573,0.09,1.123,0.252,1.641C13.235,12.21,12.636,12,12,12 c-3.313,0-6,2.687-6,6c0,0.485,0.063,0.957,0.174,1.408C6.113,19.224,6,19.096,6,19h13c2.761,0,5-2.239,5-5S21.761,9,19,9V5.5z" /></svg>
                </div>

                {/* Cloud 5 - Bottom Left Small */}
                <div className="absolute bottom-[25%] left-[15%] text-white/70 w-24 animate-float drop-shadow-sm opacity-70" style={{ animationDuration: '9s', animationDelay: '3s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c.276 0 .548.026.812.072C18.675 8.653 15.65 6 12 6c-3.23 0-5.96 2.067-6.84 5h-.66c-2.485 0-4.5 2.015-4.5 4.5S2.015 20 4.5 20h14c3.037 0 5.5-2.463 5.5-5.5S21.537 9 18.5 9z" /></svg>
                </div>
            </div>
        )}
      </div>

      {/* Status Indicator */}
      <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-3">
          <div 
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm shadow-sm transition-all border select-none ${
                isConfigured 
                ? 'bg-white/90 backdrop-blur text-emerald-600 border-emerald-200' 
                : 'bg-white/90 backdrop-blur text-rose-600 border-rose-200'
            }`}
          >
              <div className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {isConfigured ? 'System Online' : 'System Offline'}
          </div>
      </div>

      <div className={`
          p-8 md:p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full border relative z-10 transition-all duration-300
          ${bgImage ? 'bg-white/70 backdrop-blur-md border-white/50 shadow-black/10' : 'bg-white border-slate-100 shadow-slate-200/60'}
      `}>
        
        <div className="text-center mb-8 mt-4">
            <h1 className="text-3xl font-extrabold text-slate-800 mb-1 drop-shadow-sm">
                佛光山中文學校
            </h1>
            <p className="text-slate-500 font-bold text-sm tracking-widest uppercase">Homework Portal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider ml-1">Student Name</label>
                <input 
                name="name" 
                type="text" 
                required
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-5 py-3.5 rounded-xl bg-white/80 border-2 border-slate-100 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-50/50 outline-none transition-all font-bold text-slate-700 placeholder-slate-300"
                />
            </div>

            <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                <div className="relative">
                  <input 
                    name="password" 
                    type={showPassword ? "text" : "password"} 
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-5 py-3.5 rounded-xl bg-white/80 border-2 border-slate-100 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-50/50 outline-none transition-all font-bold text-slate-700 placeholder-slate-300 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors z-10"
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
            </div>
            
            {/* Script Preference */}
            <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider ml-1">Script Style</label>
                <div className="grid grid-cols-2 gap-3">
                        <div 
                        onClick={() => setScriptPref('Simplified')}
                        className={`cursor-pointer border-2 rounded-xl p-3 text-center transition-all ${scriptPref === 'Simplified' ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-100 bg-white/50 hover:border-slate-200 text-slate-400'}`}
                        >
                        <div className="text-xl font-serif-sc font-bold mb-1">汉字</div>
                        <div className="text-xs font-bold">Simplified</div>
                        </div>
                        <div 
                        onClick={() => setScriptPref('Traditional')}
                        className={`cursor-pointer border-2 rounded-xl p-3 text-center transition-all ${scriptPref === 'Traditional' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-white/50 hover:border-slate-200 text-slate-400'}`}
                        >
                        <div className="text-xl font-serif-sc font-bold mb-1">漢字</div>
                        <div className="text-xs font-bold">Traditional</div>
                        </div>
                </div>
            </div>

          {loginError && (
              <div className="text-rose-600 text-sm text-center bg-rose-50 p-3 rounded-xl border border-rose-100 font-bold">
                  {loginError}
              </div>
          )}

          <button 
            type="submit" 
            disabled={isLoggingIn}
            className="w-full text-lg font-bold py-3.5 rounded-xl bg-sky-400 text-white shadow-[0_4px_0_rgb(14,165,233)] hover:bg-sky-500 hover:shadow-[0_4px_0_rgb(2,132,199)] active:shadow-none active:translate-y-[4px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingIn ? 'Checking...' : 'Start Learning'}
          </button>
          
          <div className="pt-4 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                This program is designed by Ms. Huang
            </p>
          </div>
        </form>
      </div>

      <SupportWidget />
    </div>
  );

  const renderWritingPractice = () => {
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
                        You finished the writing section!
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
                        onComplete={handleWritingRoundComplete}
                    />
                ) : (
                    <div className="flex flex-col items-center py-12 animate-fade-in">
                        <div className="text-6xl mb-6 animate-bounce">✨</div>
                        <Button 
                            className="w-48 text-lg" 
                            onClick={handleNextWritingCharacter}
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
            records={practiceRecords}
          />
        )}
        
        {currentView === AppView.PRACTICE_WRITING && renderWritingPractice()}

        {currentView === AppView.PRACTICE_PINYIN && currentLesson && (
           <PinyinGame 
              lesson={{ ...currentLesson, characters: practiceQueue }} 
              onComplete={handleGameComplete}
              onExit={() => setCurrentView(AppView.DASHBOARD)}
              onRecordResult={handleGenericRecord}
           />
        )}

        {currentView === AppView.PRACTICE_FILL_IN_BLANKS && currentLesson && (
            <FillInBlanksGame
                lesson={{ ...currentLesson, characters: practiceQueue }}
                onComplete={handleGameComplete}
                onExit={() => setCurrentView(AppView.DASHBOARD)}
                onRecordResult={handleGenericRecord}
            />
        )}
        
        {currentView === AppView.REPORT && student && (
            <ProgressReport 
                student={student}
                records={practiceRecords} 
                onBack={() => setCurrentView(AppView.DASHBOARD)} 
            />
        )}

        {currentView === AppView.TEACHER_DASHBOARD && (
            <TeacherDashboard 
              onLogout={handleLogout} 
              onOpenSetup={() => setShowSetup(true)}
              onUpdateTheme={handleUpdateTheme}
              onResetTheme={handleResetTheme} 
            />
        )}
      </main>
    </div>
  );
};

export default App;
