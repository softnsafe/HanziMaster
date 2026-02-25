
import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import { Flashcard, Lesson } from '../types';
import { getFlashcardData, playPronunciation, validatePinyinWithAI } from '../services/geminiService';
import { pinyinify, comparePinyin } from '../utils/pinyinUtils';

interface PinyinGameProps {
  lesson: Lesson;
  initialCharacters: string[]; 
  onComplete: () => void;
  onExit: () => void;
  onRecordResult: (char: string, score: number, type: 'PINYIN') => void;
  dictionary?: Record<string, {pinyin: string, definition: string, audio: string}>;
}

export const PinyinGame: React.FC<PinyinGameProps> = ({ lesson, initialCharacters, onComplete, onExit, onRecordResult, dictionary = {} }) => {
  // Queue Management
  const [queue, setQueue] = useState<string[]>(initialCharacters && initialCharacters.length > 0 ? initialCharacters : lesson.characters);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isReviewMode = mistakes.length > 0 && queue === mistakes;

  // Data State
  const [flashcards, setFlashcards] = useState<Record<string, Flashcard>>({});
  
  // Interaction State
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'CORRECT' | 'WRONG'>('IDLE');
  const [attempts, setAttempts] = useState(0);
  const [aiFeedback, setAiFeedback] = useState<string>(''); 
  
  // UI State
  const [loadingCard, setLoadingCard] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentChar = queue[currentIndex];
  const card = currentChar ? flashcards[currentChar] : undefined;

  // 2. Load Card Data (Try Dictionary -> Then AI)
  useEffect(() => {
    const loadCard = async () => {
      if (!currentChar || isFinished || flashcards[currentChar]) return;

      // OFFLINE FIRST: Check if data exists in the dictionary sheet
      if (dictionary[currentChar] && dictionary[currentChar].pinyin) {
          setFlashcards(prev => ({ ...prev, [currentChar]: {
              character: currentChar,
              pinyin: dictionary[currentChar].pinyin,
              definition: dictionary[currentChar].definition,
              emoji: '📝' // Use a generic icon or we could add emoji to sheet later
          }}));
          return;
      }

      setLoadingCard(true);
      const data = await getFlashcardData(currentChar);
      setFlashcards(prev => ({ ...prev, [currentChar]: data }));
      setLoadingCard(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    loadCard();
  }, [currentChar, isFinished, flashcards, dictionary]); 

  // 3. Reset per card
  useEffect(() => {
      setStatus('IDLE');
      setAttempts(0);
      setInputValue('');
      setAiFeedback('');
      setTimeout(() => inputRef.current?.focus(), 100);
  }, [currentIndex, queue]); 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card || status !== 'IDLE' || !currentChar || isChecking) return;

    setIsChecking(true);
    setAiFeedback('');

    let isCorrect = false;
    let feedback = '';
    
    // 1. Local Validation (Strict & Tone Matching)
    if (comparePinyin(inputValue, card.pinyin)) {
        isCorrect = true;
        feedback = "Perfect!";
    } else {
        // 2. AI Validation (Fuzzy Logic / Polyphones)
        // Only call AI if local check fails
        try {
            const result = await validatePinyinWithAI(currentChar, inputValue);
            isCorrect = result.isCorrect;
            feedback = result.feedback;
        } catch (e) {
            // AI Failed (Offline/Key Error) -> Fallback to strict result
            // Since comparePinyin returned false, we assume incorrect
            feedback = "Incorrect";
        }
    }

    setIsChecking(false);

    if (isCorrect) {
      setStatus('CORRECT');
      setAiFeedback(feedback);
      const score = attempts === 0 ? 100 : 50; 
      onRecordResult(currentChar, score, 'PINYIN');
      handlePlaySound();
    } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setAiFeedback(feedback);
        
        const inputEl = inputRef.current;
        if (inputEl) {
            inputEl.classList.add('animate-shake');
            setTimeout(() => inputEl.classList.remove('animate-shake'), 500);
        }
  
        if (newAttempts >= 3) {
            setStatus('WRONG'); 
            if (!mistakes.includes(currentChar)) setMistakes(prev => [...prev, currentChar]);
            onRecordResult(currentChar, 0, 'PINYIN');
        } else {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }
  };

  const handleNext = () => {
    if (currentIndex >= queue.length - 1) {
       if (mistakes.length > 0 && !isReviewMode) {
           setQueue(mistakes);
           setMistakes([]); 
           setCurrentIndex(0);
       } else {
           setIsFinished(true);
       }
    } else {
        setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePlaySound = async () => {
      if (isPlayingAudio || !currentChar) return;
      setIsPlayingAudio(true);
      const audioUrl = lesson.metadata?.customAudio?.[currentChar] || dictionary[currentChar]?.audio;
      await playPronunciation(currentChar, audioUrl, card?.pinyin);
      setIsPlayingAudio(false);
  };

  // Completion Screen
  if (isFinished) {
      return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border-4 border-emerald-100 flex flex-col items-center text-center max-w-sm w-full relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-50 to-white -z-10"></div>
                <div className="text-9xl mb-6 animate-bounce drop-shadow-md">🌟</div>
                <h2 className="text-3xl font-extrabold text-emerald-600 mb-2">Practice Complete!</h2>
                <p className="text-slate-500 font-bold mb-8">You've mastered these tones.</p>
                <Button className="w-full py-4 text-lg shadow-emerald-200 shadow-lg" onClick={onComplete}>Back to Dashboard</Button>
            </div>
        </div>
      );
  }

  // Loading State
  if (!card && loadingCard) {
      return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center">
              <div className="animate-spin text-5xl mb-4">⏳</div>
              <p className="text-slate-400 font-black uppercase tracking-widest">Loading Flashcard...</p>
          </div>
      );
  }

  if (!card) return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-4">
          <div className="text-4xl mb-2">⚠️</div>
          <p className="font-bold text-slate-500">Could not load card.</p>
          <Button onClick={handleNext} className="mt-4">Skip</Button>
      </div>
  );

  const getContainerStyles = () => {
      if (status === 'CORRECT') return 'bg-emerald-50 border-emerald-200';
      if (status === 'WRONG') return 'bg-rose-50 border-rose-200';
      return 'bg-white border-slate-100';
  };

  const getProgressBarColor = () => {
      if (isReviewMode) return 'bg-amber-400';
      return 'bg-indigo-500';
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col p-4 font-nunito">
      
      {/* 1. Header & Progress */}
      <div className="w-full flex items-center gap-4 mb-2">
        <Button variant="ghost" onClick={onExit} className="px-2 text-slate-400 hover:text-slate-600">Quit</Button>
        <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
            <div 
                className={`h-full transition-all duration-500 ease-out ${getProgressBarColor()}`} 
                style={{ width: `${((currentIndex) / queue.length) * 100}%` }}
            />
        </div>
        <div className="text-xs font-black text-slate-400 uppercase tracking-wider min-w-[3rem] text-right">
            {isReviewMode ? 'Review' : `${currentIndex + 1}/${queue.length}`}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center w-full gap-6">
          
          {/* 2. Game Card */}
          <div className={`relative w-full max-w-sm rounded-[3rem] p-8 shadow-2xl border-4 transition-all duration-500 flex flex-col items-center justify-between min-h-[400px] ${getContainerStyles()}`}>
                
                {status !== 'IDLE' && (
                    <div className={`absolute -top-6 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg border-4 border-white animate-bounce-in z-20 ${status === 'CORRECT' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                        {status === 'CORRECT' ? '✨' : '❌'}
                    </div>
                )}

                <div className="flex flex-col items-center w-full z-10 space-y-6 flex-1 justify-center">
                    <div className="text-8xl filter drop-shadow-xl animate-float cursor-pointer hover:scale-110 transition-transform select-none">
                        {card.emoji}
                    </div>

                    <div className="flex flex-col items-center relative">
                        <div className="flex items-center gap-4 mb-2">
                            <h1 className="text-7xl font-serif-sc font-black text-slate-800 tracking-wide drop-shadow-sm">
                                {currentChar}
                            </h1>
                            <button 
                                onClick={handlePlaySound}
                                disabled={isPlayingAudio}
                                className="w-12 h-12 rounded-full bg-white border-2 border-indigo-100 text-indigo-500 flex items-center justify-center shadow-sm hover:scale-110 active:scale-95 transition-all"
                                title="Play Pronunciation"
                            >
                                {isPlayingAudio ? <span className="animate-pulse text-xl">🔊</span> : <span className="text-xl">🔊</span>}
                            </button>
                        </div>
                        <p className="text-slate-400 font-bold text-lg">{card.definition}</p>
                    </div>
                </div>

                {status !== 'CORRECT' && status !== 'WRONG' && (
                    <form onSubmit={handleSubmit} className="w-full mt-6 relative z-20 max-w-[280px]">
                        <div className="relative group">
                            <input 
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                placeholder="pinyin..."
                                className={`w-full py-2 pl-4 pr-12 text-center text-lg font-bold bg-slate-50 border-2 rounded-xl outline-none transition-all placeholder-slate-300 ${attempts > 0 ? 'border-rose-300 bg-rose-50 text-rose-600 focus:ring-4 focus:ring-rose-100' : 'border-slate-200 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-700'}`}
                                disabled={isChecking}
                                autoFocus
                                autoComplete="off"
                            />
                            <button 
                                type="submit"
                                disabled={!inputValue || isChecking}
                                className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square bg-white rounded-lg shadow-sm border border-slate-100 text-indigo-500 flex items-center justify-center hover:bg-indigo-50 disabled:opacity-50 disabled:hover:bg-white transition-all font-bold text-sm"
                            >
                                {isChecking ? '...' : '➜'}
                            </button>
                        </div>
                        {attempts > 0 && (
                            <p className="text-center text-rose-400 text-[10px] font-bold mt-2 animate-pulse uppercase tracking-wide">
                                {3 - attempts} tries left
                            </p>
                        )}
                        {/* Fallback Warning if Pinyin Missing */}
                        {card.pinyin === '?' && (
                            <p className="text-[10px] text-amber-500 font-bold text-center mt-2">AI Unavailable. Guess blindly or skip.</p>
                        )}
                        <p className="text-sm text-slate-500 font-bold text-center mt-3">
                            Enter pinyin + number<br />
                            (for example: 我 -&gt; wǒ = wo3)
                        </p>
                    </form>
                )}
          </div>

          {(status === 'CORRECT' || status === 'WRONG') && (
              <div className={`w-full p-4 rounded-2xl shadow-xl animate-slide-up flex flex-col gap-3 border-4 ${status === 'CORRECT' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  
                  <div className="flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                          <h3 className={`text-lg font-extrabold mb-1 ${status === 'CORRECT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {status === 'CORRECT' ? 'Nice work!' : 'Not quite.'}
                          </h3>
                          <div className="bg-white/60 backdrop-blur-sm p-2 px-3 rounded-lg rounded-tl-none border border-black/5 inline-block w-full">
                              <p className={`text-xs font-bold leading-snug ${status === 'CORRECT' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {aiFeedback || (status === 'CORRECT' ? "You got the tones right!" : "Check the definition and try again.")}
                              </p>
                          </div>
                      </div>
                      
                      {status === 'WRONG' && (
                          <div className="text-right pl-3 shrink-0">
                              <div className="text-[10px] font-black text-rose-400 uppercase mb-0.5">Correct</div>
                              <div className="text-xl font-mono font-bold text-rose-700">{pinyinify(card.pinyin)}</div>
                          </div>
                      )}
                      {status === 'CORRECT' && (
                          <div className="text-right pl-3 shrink-0">
                              <div className="text-[10px] font-black text-emerald-400 uppercase mb-0.5">Pinyin</div>
                              <div className="text-xl font-mono font-bold text-emerald-700">{pinyinify(card.pinyin)}</div>
                          </div>
                      )}
                  </div>

                  <Button 
                    onClick={handleNext} 
                    className={`w-full py-2.5 text-lg shadow-md border-b-4 active:border-b-0 active:translate-y-1 ${status === 'CORRECT' ? 'bg-emerald-500 hover:bg-emerald-600 border-emerald-700' : 'bg-rose-500 hover:bg-rose-600 border-rose-700'}`}
                  >
                      Continue
                  </Button>
              </div>
          )}
      </div>

      <style>{`
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
