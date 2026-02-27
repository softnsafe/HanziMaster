import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { PracticeMode } from '../types';
import { HanziPlayer } from './HanziPlayer';
import { getCharacterDetails } from '../services/geminiService';
import { pinyinify } from '../utils/pinyinUtils';

interface WritingGameProps {
  initialCharacters: string[];
  onComplete: () => void;
  onExit: () => void;
  onRecordResult: (char: string, score: number, type: PracticeMode) => void;
}

export const WritingGame: React.FC<WritingGameProps> = ({
  initialCharacters,
  onComplete,
  onExit,
  onRecordResult
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceCount, setPracticeCount] = useState(0);
  const [charDetails, setCharDetails] = useState<{ radical: string; strokeCount: number; pinyin?: string } | null>(null);
  const [hanziKey, setHanziKey] = useState(0);

  const currentCharacter = initialCharacters[currentIndex];

  // Fetch character details when character changes
  useEffect(() => {
    if (currentCharacter) {
      setCharDetails(null);
      getCharacterDetails(currentCharacter).then(details => {
        if (details) {
          setCharDetails({ 
            radical: details.radical, 
            strokeCount: details.strokeCount,
            pinyin: details.pinyin 
          });
        }
      });
    }
  }, [currentCharacter]);

  const handleNextCharacter = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= initialCharacters.length) {
      onComplete();
    } else {
      setCurrentIndex(nextIndex);
      setPracticeCount(0);
      setHanziKey(prev => prev + 1);
    }
  };

  const handleWritingComplete = () => {
    // Record result (assume 100 score for completion)
    onRecordResult(currentCharacter, 100, 'WRITING');
    
    // Show toast
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[60]';
    toast.innerText = 'Good Job!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);

    const nextCount = practiceCount + 1;
    if (nextCount >= 3) {
        // Character Mastered
        setPracticeCount(nextCount); // Trigger mastered view
    } else {
        setPracticeCount(nextCount);
        setHanziKey(prev => prev + 1); // Reset player for next round
    }
  };

  // Completion View
  if (currentIndex >= initialCharacters.length) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 animate-fade-in">
          <div className="bg-white p-10 rounded-[2rem] shadow-xl text-center max-w-lg border border-indigo-50">
            <div className="text-6xl mb-6 animate-bounce">🎉</div>
            <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Lesson Complete!</h2>
            <p className="text-slate-500 font-bold mb-8">You've practiced all characters.</p>
            <Button onClick={onExit} className="w-full py-3 text-lg">
               Return to Dashboard
            </Button>
          </div>
        </div>
      );
  }

  // Mastered View
  if (practiceCount >= 3) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
              <div className="bg-white p-8 rounded-[2rem] text-center shadow-2xl animate-bounce-in max-w-sm w-full mx-4">
                  <div className="text-5xl mb-2">⭐</div>
                  <h2 className="text-2xl font-extrabold text-slate-800 mb-4">Character Mastered!</h2>
                  <Button onClick={handleNextCharacter} className="w-full">Next Character →</Button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 relative overflow-hidden">
      {/* Background Elements similar to StoryBuilder */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 text-9xl opacity-5 rotate-12">✍️</div>
        <div className="absolute bottom-20 right-20 text-9xl opacity-5 -rotate-12">📝</div>
      </div>

      {/* Header */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-6 relative z-10">
        <Button variant="ghost" onClick={onExit}>Exit</Button>
        
        {/* Progress Bar */}
        <div className="flex gap-2">
          {initialCharacters.map((_, i) => (
            <div key={i} className={`h-3 w-8 rounded-full shadow-inner transition-all duration-500 ${i < currentIndex ? 'bg-emerald-400' : i === currentIndex ? 'bg-sky-500 scale-110' : 'bg-slate-200'}`} />
          ))}
        </div>

        <div className="flex gap-4 text-sm font-bold text-slate-400 uppercase tracking-wider">
            <span>Round {practiceCount + 1}/3</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 overflow-y-auto w-full">
          <div className="flex flex-col items-center text-center animate-slide-up max-w-md w-full">
            <div className="bg-white/90 backdrop-blur-sm p-8 rounded-[3rem] shadow-2xl border-4 border-sky-100 mb-8 w-full flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute -top-4 -right-4 text-6xl opacity-20 rotate-12">✍️</div>
              <h3 className="text-2xl font-black text-sky-700 mb-6">Let's write this word!</h3>
              
              {/* Character Details & Audio */}
              <div className="flex flex-col items-center gap-4 mb-6 w-full">
                  {/* Stats Row */}
                  {charDetails && (
                    <div className="flex gap-4 bg-sky-50 px-6 py-3 rounded-2xl border-2 border-sky-100">
                      {charDetails.pinyin && (
                          <>
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Pinyin</span>
                                <span className="text-xl font-bold text-sky-700">{pinyinify(charDetails.pinyin)}</span>
                              </div>
                              <div className="w-px bg-sky-200"></div>
                          </>
                      )}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Radical</span>
                        <span className="text-xl font-serif-sc text-sky-700 font-bold">{charDetails.radical}</span>
                      </div>
                      <div className="w-px bg-sky-200"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Strokes</span>
                        <span className="text-xl font-bold text-sky-700">{charDetails.strokeCount}</span>
                      </div>
                    </div>
                  )}
              </div>

              <HanziPlayer 
                key={`${currentCharacter}-${hanziKey}`}
                character={currentCharacter} 
                initialMode="quiz"
                onComplete={handleWritingComplete}
              />
            </div>
          </div>
      </div>
    </div>
  );
};
