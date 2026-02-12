
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useState, useEffect } from 'react';
import { Student, PracticeRecord, AppView, ScriptType, Lesson, PracticeMode } from './types';
import { Button } from './components/Button';
import { Dashboard } from './components/Dashboard';
import { ProgressReport } from './components/ProgressReport';
import { SetupModal } from './components/SetupModal';
import { HanziPlayer } from './components/HanziPlayer';
import { TeacherDashboard } from './components/TeacherDashboard';
import { PinyinGame } from './components/PinyinGame';
import { FillInBlanksGame } from './components/FillInBlanksGame';
import { SupportWidget } from './components/SupportWidget';
import { LoginBackground } from './components/LoginBackground';
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
  
  // Sync State
  const [isSaving, setIsSaving] = useState(false);
  
  // Initialize with existence check so it starts as "Online" if hardcoded URL exists
  const [isConfigured, setIsConfigured] = useState(!!sheetService.getUrl() || sheetService.isDemoMode());
  const [isDemo, setIsDemo] = useState(sheetService.isDemoMode());

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
            setIsDemo(false);
        } catch (e) {
            console.error("Failed to parse backend param");
        }
    } else {
        const demo = sheetService.isDemoMode();
        setIsDemo(demo);
        setIsConfigured(!!sheetService.getUrl() || demo);
    }

    // 2. Load cached background
    const cachedBg = localStorage.getItem('hanzi_master_bg_theme');
    if (cachedBg) {
        setBgImage(cachedBg);
    }
  }, []);

  // --- Helpers ---
  
  const handleUpdateTheme = (newImage: string) => {
      setBgImage(newImage);
      localStorage.setItem('hanzi_master_bg_theme', newImage);
  };

  const handleResetTheme = () => {
      setBgImage(null);
      localStorage.removeItem('hanzi_master_bg_theme');
  };

  // Helper to sync completion at the end of assignment
  const completeAssignment = async (lessonId: string) => {
      if (!student) return;
      
      setIsSaving(true);
      try {
          await sheetService.updateAssignmentStatus(student.id, lessonId, 'COMPLETED');
          
          // Award points for completion!
          const result = await sheetService.updatePoints(student.id, 5, "Completed Assignment");
          if (result.success && result.points) {
              setStudent(prev => prev ? { ...prev, points: result.points! } : null);
          }
      } catch (e) {
          console.error("Failed to complete assignment", e);
      } finally {
          setIsSaving(false);
      }
  };

  // Refreshes student history AND profile (points/stickers) from the backend
  const refreshUserData = async () => {
      if (!student) return;
      try {
        // 1. Refresh History
        const history = await sheetService.getStudentHistory(student.name, true);
        setPracticeRecords(history);
        
        // 2. Refresh Profile (Points, Stickers, Permissions) via silent re-login
        // We use the existing login credentials state if available
        if (loginName && loginPassword || isDemo) {
             const result = await sheetService.loginStudent({
                 id: student.id, // ID is ignored by backend login lookup, but kept for type safety
                 name: loginName || student.name,
                 password: loginPassword,
                 joinedAt: student.joinedAt,
                 scriptPreference: student.scriptPreference,
                 points: 0,
                 stickers: []
             });
             
             if (result.success && result.student) {
                 setStudent(result.student);
             }
        }
      } catch (e) {
        console.error("Failed to refresh user data", e);
      }
  };

  // --- Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    const nameVal = loginName.trim();
    const passVal = loginPassword.trim();

    if (nameVal && (passVal || isDemo)) {
      setIsLoggingIn(true);
      
      // Ensure we start with a clean cache to avoid stale data from previous sessions
      sheetService.clearAllCache();

      const tempStudent: any = {
        id: Date.now().toString(),
        name: nameVal,
        password: passVal,
        joinedAt: new Date().toISOString(),
        scriptPreference: scriptPref,
        points: 0,
        stickers: [],
        userAgent: navigator.userAgent // Send device info
      };
      
      const result = await sheetService.loginStudent(tempStudent);

      if (result.success && result.student) {
         // Teacher Detection Logic (Case Insensitive)
         const lowerName = result.student.name.toLowerCase();
         if (lowerName === 'ms. huang' || lowerName === 'teacher') {
            setStudent(result.student);
            setCurrentView(AppView.TEACHER_DASHBOARD);
         } else {
            // Check Class Status for Students
            const status = await sheetService.getClassStatus();
            
            if (!status.isOpen) {
                setLoginError("⛔ The class is currently closed by the teacher.");
                // Ensure student is NOT set
                setStudent(null);
            } else {
                // Only now do we set the student state to allow access
                setStudent(result.student);
                
                // Force refresh history on login
                const history = await sheetService.getStudentHistory(result.student.name, true);
                setPracticeRecords(history);
                setCurrentView(AppView.DASHBOARD);
            }
         }
      } else {
         if (result.message === "Backend not configured") {
             setLoginError("App is Offline. Please click the gear icon ⚙️ above to setup.");
             // Force gear icon to show if backend is missing
             setIsConfigured(false);
         } else {
             setLoginError(result.message || 'Login failed');
         }
      }
      
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sheetService.clearAllCache(); // Clear cache on logout
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
    
    let converted = lesson.characters;
    const pref = student?.scriptPreference || 'Simplified';

    if (mode === 'FILL_IN_BLANKS') {
        // For sentence builder, just convert the characters. 
        // convertCharacter ignores punctuation like '#' or '?', so structure is preserved.
        converted = lesson.characters.map(c => convertCharacter(c, pref));
    } else {
        // WRITING or PINYIN
        converted = lesson.characters.map(c => convertCharacter(c, pref));
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
  };

  const handleNextWritingCharacter = () => {
    const nextIndex = queueIndex + 1;
    setQueueIndex(nextIndex);
    setPracticeCount(0);
    
    // Check if this was the last character
    if (nextIndex >= practiceQueue.length) {
        // Trigger completion sync
        if (currentLesson) {
            completeAssignment(currentLesson.id);
        }
    }
  };

  const handleWritingRoundComplete = async () => {
    const nextCount = practiceCount + 1;
    setPracticeCount(nextCount);

    if (nextCount >= 3) {
        if (!student) return;

        // 1. Prepare Record
        const currentTarget = practiceQueue[queueIndex];
        const newRecord: PracticeRecord = {
            id: Date.now().toString(),
            character: currentTarget,
            score: 100,
            details: "Practice completed.",
            timestamp: Date.now(),
            imageUrl: "",
            type: 'WRITING'
        };

        // 2. Optimistic Update (Show in UI immediately)
        setPracticeRecords(prev => [...prev, newRecord]);
        
        // 3. Save to Backend (Progress Recording)
        setIsSaving(true);
        try {
            await sheetService.savePracticeRecord(student.name, newRecord);
            // Also update assignment status to IN_PROGRESS if not already started
            if (currentLesson) {
               await sheetService.updateAssignmentStatus(student.id, currentLesson.id, 'IN_PROGRESS');
            }
        } catch (e) {
            console.error("Failed to save progress", e);
        } finally {
            setIsSaving(false);
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
      
      // Update local state first
      if (score === 100) {
        setPracticeRecords(prev => [...prev, newRecord]);
      }

      // Save to backend immediately
      setIsSaving(true);
      try {
          await sheetService.savePracticeRecord(student.name, newRecord);
          if (currentLesson) {
             await sheetService.updateAssignmentStatus(student.id, currentLesson.id, 'IN_PROGRESS');
          }
      } catch (e) {
          console.error("Failed to save generic record", e);
      } finally {
          setIsSaving(false);
      }
  };

  const handleGameComplete = async () => {
      // Called by Pinyin/FillBlank games when finished
      if (currentLesson) {
          await completeAssignment(currentLesson.id);
      }
      setCurrentView(AppView.DASHBOARD);
  };

  // --- Views ---

  const renderLogin = () => (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden transition-all duration-700">
      
      {/* Optimized Background Component - Only renders when bgImage changes */}
      <LoginBackground bgImage={bgImage} />

      {/* Status Indicator & Setup */}
      <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            {/* Show gear if not configured OR if there is a login error (to fix connection) */}
            {(!isConfigured || loginError) && (
                <button 
                    onClick={() => setShowSetup(true)}
                    className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 shadow-sm border border-slate-200 transition-all hover:rotate-90 hover:bg-white"
                    title="Configure Backend"
                >
                    ⚙️
                </button>
            )}
            <div 
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm shadow-sm transition-all border select-none ${
                    isDemo 
                    ? 'bg-white/90 backdrop-blur text-purple-600 border-purple-200'
                    : isConfigured 
                    ? 'bg-white/90 backdrop-blur text-emerald-600 border-emerald-200' 
                    : 'bg-white/90 backdrop-blur text-rose-600 border-rose-200'
                }`}
            >
                <div className={`w-2 h-2 rounded-full ${isDemo ? 'bg-purple-400' : isConfigured ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                {isDemo ? 'Demo Mode' : isConfigured ? 'System Online' : 'Offline'}
            </div>
          </div>
      </div>

      <div className={`
          p-8 md:p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full border relative z-10 transition-all duration-300
          ${bgImage ? 'bg-white/70 backdrop-blur-md border-white/50 shadow-black/10' : 'bg-white border-slate-100 shadow-slate-200/60'}
      `}>
        
        <div className="text-center mb-8 mt-4">
            <h1 className="text-3xl font-extrabold text-slate-800 mb-1 drop-shadow-sm">
                佛光中文學校
            </h1>
            <p className="text-slate-500 font-bold text-sm tracking-widest uppercase">Homework Portal</p>
            <p className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent font-extrabold text-sm mt-1 animate-[pulse_3s_infinite] drop-shadow-sm">Ms Huang's Class</p>
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
                    required={!isDemo} // Not required in demo
                    disabled={isDemo} // Disabled in demo
                    value={isDemo ? 'demo-pass' : loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder={isDemo ? "Not needed for demo" : "Enter password"}
                    className="w-full px-5 py-3.5 rounded-xl bg-white/80 border-2 border-slate-100 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-50/50 outline-none transition-all font-bold text-slate-700 placeholder-slate-300 pr-12 disabled:opacity-60 disabled:bg-slate-50"
                  />
                  {!isDemo && (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors z-10"
                    >
                        {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                        ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        )}
                    </button>
                  )}
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
              <div className="text-rose-600 text-sm text-center bg-rose-50 p-3 rounded-xl border border-rose-100 font-bold animate-bounce-in">
                  {loginError}
              </div>
          )}

          <button 
            type="submit" 
            disabled={isLoggingIn}
            className={`w-full text-lg font-bold py-3.5 rounded-xl shadow-[0_4px_0_rgb(14,165,233)] hover:bg-sky-500 hover:shadow-[0_4px_0_rgb(2,132,199)] active:shadow-none active:translate-y-[4px] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isDemo ? 'bg-purple-500 shadow-[0_4px_0_rgb(147,51,234)] hover:bg-purple-600 hover:shadow-[0_4px_0_rgb(126,34,206)]' : 'bg-sky-400 text-white'}`}
          >
            {isLoggingIn ? 'Checking...' : isDemo ? 'Start Demo' : 'Login'}
          </button>
          
          <div className="pt-4 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                This Program is Designed by Ms. Huang
            </p>
          </div>
        </form>
      </div>

      <SupportWidget />

      {/* MODALS */}
      {showSetup && <SetupModal onClose={() => {
            setShowSetup(false);
            const demo = sheetService.isDemoMode();
            setIsDemo(demo);
            setIsConfigured(!!sheetService.getUrl() || demo);
      }} />}
    </div>
  );

  const renderPracticeWriting = () => {
    if (!currentLesson || queueIndex >= practiceQueue.length) {
       // Completion View - Shows success message
       // We can rely on the fact that handleNextWritingCharacter triggered the sync already.
       return (
         <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 animate-fade-in">
           <div className="bg-white p-10 rounded-[2rem] shadow-xl text-center max-w-lg border border-indigo-50">
             <div className="text-6xl mb-6 animate-bounce">🎉</div>
             <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Lesson Complete!</h2>
             <p className="text-slate-500 font-bold mb-8">You've practiced all characters. +5 Points!</p>
             <Button onClick={() => setCurrentView(AppView.DASHBOARD)} className="w-full py-3 text-lg">
                Return to Dashboard
             </Button>
           </div>
         </div>
       );
    }
    
    // Check if character is mastered in this session
    if (practiceCount >= 3) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white p-8 rounded-[2rem] text-center shadow-2xl animate-bounce-in max-w-sm w-full mx-4">
                    <div className="text-5xl mb-2">⭐</div>
                    <h2 className="text-2xl font-extrabold text-slate-800 mb-4">Character Mastered!</h2>
                    <Button onClick={handleNextWritingCharacter} className="w-full">Next Character →</Button>
                </div>
            </div>
        );
    }

    const char = practiceQueue[queueIndex];
    
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4">
             {/* Header */}
             <div className="w-full max-w-4xl flex justify-between items-center mb-6">
                 <Button variant="ghost" onClick={() => setCurrentView(AppView.DASHBOARD)}>Exit</Button>
                 <div className="flex gap-4 text-sm font-bold text-slate-400 uppercase tracking-wider">
                     <span>Char {queueIndex + 1}/{practiceQueue.length}</span>
                     <span>Round {practiceCount + 1}/3</span>
                 </div>
             </div>

             <div className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center">
                 {/* Single HanziPlayer Container */}
                 <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 flex flex-col items-center w-full max-w-md">
                     <div className="mb-4 text-center">
                         <h3 className="text-slate-400 font-bold text-xs uppercase mb-1">Write the Character</h3>
                         <p className="text-slate-500 font-bold text-sm">Follow the strokes. Click 'Watch' for help.</p>
                     </div>
                     
                     <HanziPlayer 
                        key={`${char}-${practiceCount}`}
                        character={char} 
                        initialMode="quiz"
                        onComplete={() => {
                            handleWritingRoundComplete();
                            const toast = document.createElement('div');
                            toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[60]';
                            toast.innerText = 'Good Job!';
                            document.body.appendChild(toast);
                            setTimeout(() => toast.remove(), 2000);
                        }}
                     />
                 </div>
             </div>
        </div>
    );
  };

  // Main Render Switch
  if (currentView === AppView.LOGIN) return renderLogin();
  
  if (currentView === AppView.TEACHER_DASHBOARD) {
      return (
          <TeacherDashboard 
              onLogout={handleLogout}
              onOpenSetup={() => setShowSetup(true)}
              onUpdateTheme={handleUpdateTheme}
              onResetTheme={handleResetTheme}
          />
      );
  }

  if (currentView === AppView.REPORT && student) {
      return <ProgressReport student={student} records={practiceRecords} onBack={() => setCurrentView(AppView.DASHBOARD)} />;
  }

  if (currentView === AppView.PRACTICE_PINYIN && currentLesson) {
      return (
          <PinyinGame 
              lesson={currentLesson}
              initialCharacters={practiceQueue} // Pass converted characters
              onComplete={handleGameComplete}
              onExit={() => setCurrentView(AppView.DASHBOARD)}
              onRecordResult={handleGenericRecord}
          />
      );
  }

  if (currentView === AppView.PRACTICE_FILL_IN_BLANKS && currentLesson) {
      return (
          <FillInBlanksGame 
              lesson={currentLesson}
              initialCharacters={practiceQueue} // Pass converted characters (with Q#A structure preserved)
              onComplete={handleGameComplete}
              onExit={() => setCurrentView(AppView.DASHBOARD)}
              onRecordResult={handleGenericRecord}
          />
      );
  }

  if (currentView === AppView.PRACTICE_WRITING && currentLesson) {
     return renderPracticeWriting();
  }

  // Default Dashboard
  if (student) {
      return (
          <div className="min-h-screen bg-slate-50 p-6 md:p-8" 
               style={{ backgroundImage: bgImage ? `url(${bgImage})` : '', backgroundSize: 'cover', backgroundAttachment: 'fixed', backgroundPosition: 'center' }}>
             
             {/* SYNC INDICATOR */}
             <div className="fixed top-6 right-6 z-50">
                {isSaving ? (
                    <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-indigo-100 flex items-center gap-2 animate-bounce-in">
                        <span className="animate-spin text-lg">☁️</span>
                        <span className="text-xs font-extrabold text-indigo-500 uppercase tracking-wide">Saving...</span>
                    </div>
                ) : (
                    <div className="bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/50 flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                         <span className="text-lg">☁️</span>
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Synced</span>
                    </div>
                )}
             </div>

             <div className="max-w-6xl mx-auto bg-white/90 backdrop-blur-xl rounded-[3rem] p-8 shadow-2xl min-h-[85vh] border border-white">
                <Dashboard 
                    student={student} 
                    records={practiceRecords}
                    onStartPractice={handleStartPractice}
                    onViewReport={() => setCurrentView(AppView.REPORT)}
                    onLogout={handleLogout}
                    onRefreshData={refreshUserData}
                />
             </div>
          </div>
      );
  }

  return renderLogin();
};

export default App;
