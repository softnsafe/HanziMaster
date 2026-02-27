
import React, { useState, useEffect } from 'react';
import { Student, PracticeRecord, AppView, Lesson, PracticeMode, RewardRule } from './types';
import { Dashboard } from './components/Dashboard';
import { ProgressReport } from './components/ProgressReport';
import { SetupModal } from './components/SetupModal';
import { TeacherDashboard } from './components/TeacherDashboard';
import { PinyinGame } from './components/PinyinGame';
import { FillInBlanksGame } from './components/FillInBlanksGame';
import { StoryBuilderGame } from './components/StoryBuilderGame';
import { WritingGame } from './components/WritingGame';
import { SupportWidget } from './components/SupportWidget';
import { LoginBackground } from './components/LoginBackground';
import { sheetService } from './services/sheetService';
import { convertCharacter } from './utils/characterConverter';
import { useTracking } from './hooks/useTracking';

const App: React.FC = () => {
  // --- State ---
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOGIN);
  const { track } = useTracking();
  const [student, setStudent] = useState<Student | null>(null);
  const [practiceRecords, setPracticeRecords] = useState<PracticeRecord[]>([]);
  
  // Login State
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Theme State
  const [bgImage, setBgImage] = useState<string | null>(null);

  // Practice Queue State
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [practiceQueue, setPracticeQueue] = useState<string[]>([]);
  
  // UI State
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [offlineToast, setOfflineToast] = useState(false);
  
  // Sync State ('idle' | 'saving' | 'saved')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  // Initialize with existence check so it starts as "Online" if hardcoded URL exists
  const [isConfigured, setIsConfigured] = useState(!!sheetService.getUrl() || sheetService.isDemoMode());
  const [isDemo, setIsDemo] = useState(sheetService.isDemoMode());

  // Config State
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([]);
  const [dictionary, setDictionary] = useState<Record<string, {pinyin: string, definition: string, audio: string}>>({});

  // Track View Changes
  useEffect(() => {
      if (student && currentView !== AppView.LOGIN) {
          track(student, 'NAVIGATE', `Viewed ${currentView}`, { view: currentView });
      }
  }, [currentView, student, track]);

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

    // 3. Load rules
    const loadRules = async () => {
        try {
            const rules = await sheetService.getRewardRules();
            setRewardRules(rules);
        } catch(e) { console.error("Rules load fail", e); }
    };
    if (isConfigured || isDemo) {
        loadRules();
    }
  }, [isConfigured, isDemo]);

  // --- Helpers ---
  
  const handleUpdateTheme = (newImage: string) => {
      setBgImage(newImage);
      localStorage.setItem('hanzi_master_bg_theme', newImage);
  };

  const handleResetTheme = () => {
      setBgImage(null);
      localStorage.removeItem('hanzi_master_bg_theme');
  };

  // Helper to handle save state transitions
  const performSave = async (operation: () => Promise<any>) => {
      setSaveStatus('saving');
      try {
          await operation();
          setSaveStatus('saved');
          // Revert to idle (synced) after 2 seconds
          setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (e) {
          console.error("Save failed", e);
          setSaveStatus('idle');
      }
  };

  // Helper to sync completion at the end of assignment
  const completeAssignment = async (lessonId: string) => {
      if (!student) return;
      
      // Determine points: Default to 30 as requested, or use specific assignment value
      let pointsToRequest = 30;
      if (currentLesson && currentLesson.metadata?.points) {
          pointsToRequest = currentLesson.metadata.points;
      } 

      await performSave(async () => {
          // Send completion status AND requested points to backend.
          // The backend enforces the 60-point cap logic.
          const statusRes = await sheetService.updateAssignmentStatus(student.id, lessonId, 'COMPLETED', pointsToRequest);
          
          const actualPoints = statusRes.actualPoints || 0;
          
          if (actualPoints > 0) {
              // Award only the capped amount allowed by the backend
              const result = await sheetService.updatePoints(student.id, actualPoints, "Assignment Completed");
              if (result.success && result.points !== undefined) {
                  // In demo mode, update manually if needed
                  if (sheetService.isDemoMode()) {
                      setStudent(prev => prev ? { ...prev, points: prev.points + actualPoints } : null);
                  } else {
                      setStudent(prev => prev ? { ...prev, points: result.points! } : null);
                  }
              }
          }
      });
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
                 id: student.id, 
                 name: loginName || student.name,
                 password: loginPassword,
                 joinedAt: student.joinedAt,
                 scriptPreference: student.scriptPreference,
                 points: 0,
                 stickers: [],
                 userAgent: navigator.userAgent // Ensure we keep logging the device
             });
             
             if (result.success && result.student) {
                 setStudent(result.student);
             }
        }
        // Refresh rules
        setRewardRules(await sheetService.getRewardRules(true));
        setDictionary(await sheetService.getFullDictionary(true));
      } catch (e) {
        console.error("Failed to refresh user data", e);
      }
  };

  // --- Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setOfflineToast(false);
    
    const nameVal = loginName.trim();
    const passVal = loginPassword.trim();

    if (nameVal && (passVal || isDemo)) {
      setIsLoggingIn(true);
      
      // Ensure we start with a clean cache to avoid stale data from previous sessions
      // sheetService.clearAllCache(); // Removed to improve performance

      const tempStudent: any = {
        id: Date.now().toString(),
        name: nameVal,
        password: passVal,
        joinedAt: new Date().toISOString(),
        scriptPreference: 'Simplified',
        points: 0,
        stickers: [],
        userAgent: navigator.userAgent // Send device info
      };
      
      const result = await sheetService.loginStudent(tempStudent);

      if (result.success && result.student) {
         // Check if this was an offline fallback login
         if (result.message && result.message.includes('Offline')) {
             setOfflineToast(true);
         }

         // Teacher Detection Logic (Case Insensitive)
         const lowerName = result.student.name.toLowerCase();
         if (lowerName === 'ms. vickie' || lowerName === 'ms. huang' || lowerName === 'teacher') {
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
                
                // Track Login
                track(result.student, 'LOGIN', 'User logged in', { userAgent: navigator.userAgent });
                
                // Transition to Dashboard immediately
                setCurrentView(AppView.DASHBOARD);

                // Fetch data in background
                Promise.all([
                    sheetService.getStudentHistory(result.student.name, true),
                    sheetService.getRewardRules(true),
                    sheetService.getFullDictionary(false) // Dictionary is heavy and static, use cache if available
                ]).then(([history, rules, dict]) => {
                    setPracticeRecords(history);
                    setRewardRules(rules);
                    setDictionary(dict);
                }).catch(console.error);
            }
         }
      } else {
         if (result.message && result.message.includes("Backend not configured")) {
             setLoginError("App is Offline. Please click the gear icon ⚙️ above to setup.");
             setIsConfigured(false);
         } else if (result.message && result.message.includes("Connection Blocked")) {
             // Handle the specific CORS error with a helpful message AND open the setup modal
             setLoginError("⚠️ Connection Blocked. Access set to 'Me' instead of 'Anyone'. Opening Setup...");
             setTimeout(() => setShowSetup(true), 1500);
         } else {
             setLoginError(result.message || 'Login failed');
         }
      }
      
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    if (student) {
        track(student, 'LOGOUT', 'User logged out');
    }
    sheetService.clearAllCache(); // Clear cache on logout
    setStudent(null);
    setCurrentView(AppView.LOGIN);
    setPracticeRecords([]);
    setLoginError('');
    setShowPassword(false);
    setLoginName('');
    setLoginPassword('');
    setOfflineToast(false);
  };

  const handleStartPractice = async (lesson: Lesson, mode: PracticeMode) => {
    if (student) {
        track(student, 'START_PRACTICE', `Started ${mode} on ${lesson.title}`, { lessonId: lesson.id, mode });
    }
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

    if (mode === 'WRITING') {
        setCurrentView(AppView.PRACTICE_WRITING);
    } else if (mode === 'PINYIN') {
        setCurrentView(AppView.PRACTICE_PINYIN);
    } else if (mode === 'FILL_IN_BLANKS') {
        setCurrentView(AppView.PRACTICE_FILL_IN_BLANKS);
    } else if (mode === 'STORY_BUILDER') {
        setCurrentView(AppView.PRACTICE_STORY_BUILDER);
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

      // Save to backend immediately (Progress Only - Points are awarded on full completion now)
      await performSave(async () => {
          await sheetService.savePracticeRecord(student.name, newRecord);
          
          if (currentLesson) {
             await sheetService.updateAssignmentStatus(student.id, currentLesson.id, 'IN_PROGRESS');
          }
      });
  };

  const handleGameComplete = async () => {
      // Called by Pinyin/FillBlank games when finished
      if (currentLesson && student) {
          track(student, 'COMPLETE_PRACTICE', `Completed ${currentLesson.title}`, { lessonId: currentLesson.id });
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
            {/* Font size adjusted to text-sm to match Homework Portal */}
            <p className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent font-extrabold text-sm mt-1 drop-shadow-sm">Ms. Vickie's Class</p>
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
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
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
                This program is designedby Ms. Vickie
            </p>
          </div>
        </form>
      </div>

      <SupportWidget />

      {/* MODALS */}
      {showSetup && <SetupModal onClose={() => {
            setShowSetup(false);
            const demo = sheetService.isDemoMode();
            const configured = !!sheetService.getUrl() || demo;
            setIsDemo(demo);
            setIsConfigured(configured);
            
            // If configuration changed, ensure we reset the app state to load from the new source
            if (configured) {
                // Clearing student logs user out
                setStudent(null);
                setCurrentView(AppView.LOGIN);
                setPracticeRecords([]);
                setLoginError('');
                
                // Force reload of rules from new backend
                sheetService.getRewardRules().then(setRewardRules).catch(() => setRewardRules([]));
            }
      }} />}
    </div>
  );



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
              dictionary={dictionary}
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

  if (currentView === AppView.PRACTICE_STORY_BUILDER && currentLesson) {
      return (
          <StoryBuilderGame 
              lesson={currentLesson}
              initialCharacters={practiceQueue}
              onComplete={handleGameComplete}
              onExit={() => setCurrentView(AppView.DASHBOARD)}
              onRecordResult={handleGenericRecord}
              dictionary={dictionary}
          />
      );
  }

  if (currentView === AppView.PRACTICE_WRITING && currentLesson) {
     return (
         <WritingGame 
             initialCharacters={practiceQueue}
             onComplete={handleGameComplete}
             onExit={() => setCurrentView(AppView.DASHBOARD)}
             onRecordResult={handleGenericRecord}
         />
     );
  }

  // Default Dashboard
  if (student) {
      return (
          <div className="min-h-screen bg-slate-50 p-6 md:p-8" 
               style={{ backgroundImage: bgImage ? `url(${bgImage})` : '', backgroundSize: 'cover', backgroundAttachment: 'fixed', backgroundPosition: 'center' }}>
             
             {/* SYNC INDICATOR */}
             <div className="fixed top-6 right-6 z-50 transition-all duration-500 flex flex-col items-end gap-2">
                {offlineToast && (
                     <div className="bg-amber-100/90 backdrop-blur-md px-4 py-2 rounded-xl shadow-xl border border-amber-200 flex items-center gap-2 animate-bounce-in max-w-xs">
                        <span className="text-xl">⚠️</span>
                        <div className="flex flex-col">
                            <span className="text-xs font-black text-amber-800 uppercase tracking-wide">Offline Mode</span>
                            <span className="text-[10px] font-bold text-amber-600">Progress saved locally</span>
                        </div>
                     </div>
                )}

                {saveStatus === 'saving' && (
                    <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-indigo-100 flex items-center gap-2 animate-bounce-in">
                        <span className="animate-spin text-lg">☁️</span>
                        <span className="text-xs font-extrabold text-indigo-500 uppercase tracking-wide">Saving...</span>
                    </div>
                )}
                {saveStatus === 'saved' && (
                    <div className="bg-emerald-500/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-emerald-400 flex items-center gap-2 animate-bounce-in text-white">
                        <span className="text-lg">✅</span>
                        <span className="text-xs font-extrabold uppercase tracking-wide">Saved!</span>
                    </div>
                )}
                {saveStatus === 'idle' && (
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
                    rewardRules={rewardRules} // Passing rules
                    onUpdateStudent={(updates) => setStudent(prev => prev ? { ...prev, ...updates } : null)}
                />
             </div>
          </div>
      );
  }

  return renderLogin();
};

export default App;
