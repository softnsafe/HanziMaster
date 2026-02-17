
import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import { Flashcard, Lesson } from '../types';
import { getFlashcardData, playPronunciation, validatePinyinWithAI } from '../services/geminiService';
import { sheetService } from '../services/sheetService';
import { pinyinify } from '../utils/pinyinUtils';
import { convertCharacter } from '../utils/characterConverter';

interface PinyinGameProps {
  lesson: Lesson;
  initialCharacters: string[]; // Converted characters from App
  onComplete: () => void;
  onExit: () => void;
  onRecordResult: (char: string, score: number, type: 'PINYIN') => void;
}

export const PinyinGame: React.FC<PinyinGameProps> = ({ lesson, initialCharacters, onComplete, onExit, onRecordResult }) => {
  // Use pre-converted characters if available, otherwise fallback to lesson default
  const [queue, setQueue] = useState<string[]>(initialCharacters && initialCharacters.length > 0 ? initialCharacters : lesson.characters);
  
  const [flashcards, setFlashcards] = useState<Record<string, Flashcard>>({});
  const [dictionary, setDictionary] = useState<Record<string, string>>({}); // Kept mostly for UI indicators
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  // Game State
  const [status, setStatus] = useState<'IDLE' | 'CORRECT' | 'WRONG'>('IDLE');
  const [attempts, setAttempts] = useState(0); // Track failed attempts for current card
  const [aiFeedback, setAiFeedback] = useState<string>(''); // Stores feedback from Gemini
  
  const [loadingCard, setLoadingCard] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentChar = queue[currentIndex];
  // Safe access for card
  const card = currentChar ? flashcards[currentChar] : undefined;

  // Load Global Dictionary on Mount
  useEffect(() => {
      const loadDict = async () => {
          try {
              // Fetch dictionary from Sheet (force refresh true)
              const dict = await sheetService.getDictionary(true);
              setDictionary(dict);
          } catch(e) {
              console.warn("Dictionary load failed", e);
          }
      };
      loadDict();
  }, []);

  // Fetch card data when character changes
  useEffect(() => {
    const loadCard = async () => {
      if (!currentChar) return;
      if (isFinished) return;
      if (flashcards[currentChar]) return; // Already loaded

      setLoadingCard(true);
      const data = await getFlashcardData(currentChar);
      setFlashcards(prev => ({ ...prev, [currentChar]: data }));
      setLoadingCard(false);
      // Auto focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    loadCard();
  }, [currentChar, isFinished, flashcards]);

  // Reset state when moving to next card
  useEffect(() => {
      setStatus('IDLE');
      setAttempts(0);
      setInputValue('');
      setAiFeedback('');
      setTimeout(() => inputRef.current?.focus(), 100);
  }, [currentIndex]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card || status !== 'IDLE' || !currentChar || isChecking) return;

    setIsChecking(true);
    setAiFeedback('');

    let isCorrect = false;
    let feedback = '';
    let standard = card.pinyin;

    try {
        // AI Check
        const result = await validatePinyinWithAI(currentChar, inputValue);
        isCorrect = result.isCorrect;
        feedback = result.feedback;
        standard = result.standardPinyin;
    } catch (e) {
        // Fallback Local Check if AI fails
        const normalize = (str: string) => {
            return str.trim().toLowerCase()
                .replace(/\s+/g, '')
                .replace(/v/g, 'ü')
                .replace(/u:/g, 'ü');
        };
        isCorrect = normalize(inputValue) === normalize(card.pinyin);
        feedback = isCorrect ? 'Correct!' : 'Incorrect';
    }

    setIsChecking(false);

    if (isCorrect) {
      setStatus('CORRECT');
      setAiFeedback(feedback || 'Great job!');
      onRecordResult(currentChar, 100, 'PINYIN');
      // Play sound effect?
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= 3) {
          setStatus('WRONG');
          setAiFeedback(feedback || 'Incorrect');
          setMistakes(prev => [...prev, currentChar]);
          onRecordResult(currentChar, 0, 'PINYIN');
      } else {
          // Shake effect or visual feedback could go here
          setInputValue(''); // Clear input for retry
          setTimeout(() => inputRef.current?.focus(), 100);
          // Show toast or temporary message?
      }
    }
  };

  const handleNext = () => {
    // If we are at the end
    if (currentIndex >= queue.length - 1) {
       // Check if there are mistakes to review
       if (mistakes.length > 0) {
           // Start review round
           setQueue(mistakes);
           setMistakes([]); // Clear mistakes for the new round
           setCurrentIndex(0);
       } else {
           // Truly done
           setIsFinished(true);
       }
    } else {
        setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePlaySound = async () => {
      if (isPlayingAudio || !currentChar) return;
      setIsPlayingAudio(true);
      
      // 1. Check Assignment Override
      let audioUrl = lesson.metadata?.customAudio?.[currentChar];

      // Pass found URL (or undefined) AND the flashcard pinyin to service
      // The service will fallback to /audio/${card.pinyin}.mp3 if Dictionary/Override fails
      await playPronunciation(currentChar, audioUrl, card?.pinyin);
      
      setIsPlayingAudio(false);
  };

  // Helper to determine if we have a custom audio source
  const hasCustomAudio = () => {
      if (!currentChar) return false;
      if (lesson.metadata?.customAudio?.[currentChar]) return true;
      if (dictionary[currentChar]) return true;
      // Check simp fallback
      const simp = convertCharacter(currentChar, 'Simplified');
      if (dictionary[simp]) return true;
      return false;
  };

  if (isFinished) {
      return (
        <div className="max-w-xl mx-auto pt-12 animate-float">
            <div className="bg-white p-12 rounded-[3rem] shadow-xl border-4 border-emerald-100 flex flex-col items-center text-center">
                <div className="text-8xl mb-6 animate-bounce">🌟</div>
                <h2 className="text-4xl font-extrabold text-emerald-600 mb-4">Awesome Job!</h2>
                <p className="text-slate-500 text-lg mb-8 font-medium">
                    You finished the Pinyin practice!
                </p>
                <Button 
                    className="w-full max-w-xs py-4 text-xl" 
                    onClick={onComplete}
                >
                    Back to Dashboard
                </Button>
            </div>
        </div>
      );
  }

  if (!currentChar) return null;

  return (
    <div className="max-w-md mx-auto min-h-[60vh] flex flex-col items-center justify-center p-4">
      <div className="w-full flex justify-between items-center mb-6">
        <Button variant="ghost" onClick={onExit}>Quit</Button>
        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            {mistakes.length > 0 ? 'Reviewing Mistakes' : `Progress: ${currentIndex + 1} / ${queue.length}`}
        </span>
      </div>

      {/* Card */}
      <div className={`bg-white rounded-[2.5rem] p-8 shadow-xl w-full text-center border-4 relative overflow-hidden transition-all ${status === 'IDLE' && attempts > 0 ? 'border-amber-200 animate-pulse' : 'border-slate-100'}`}>
         
         {loadingCard ? (
             <div className="py-20 flex flex-col items-center gap-4">
                 <div className="animate-spin text-4xl">⏳</div>
                 <p className="text-slate-400 font-bold text-sm">Loading word...</p>
             </div>
         ) : (
            <div className="animate-fade-in space-y-6">
                {/* Picture/Emoji */}
                <div className="text-7xl mb-2 filter drop-shadow-md transform hover:scale-110 transition-transform cursor-default">
                    {card?.emoji}
                </div>

                {/* Character & English */}
                <div>
                    <h2 className="text-5xl font-serif-sc font-bold text-slate-800 mb-2 flex items-center justify-center gap-3">
                        {currentChar}
                        <button 
                            onClick={handlePlaySound}
                            disabled={isPlayingAudio}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 ${ hasCustomAudio() ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'}`}
                            title={hasCustomAudio() ? "Playing from Dictionary" : "Listen"}
                            type="button"
                        >
                            {isPlayingAudio ? (
                                <span className="animate-pulse">🔊</span>
                            ) : '🔊'}
                        </button>
                    </h2>
                    <p className="text-slate-500 font-bold text-lg">{card?.definition}</p>
                </div>

                {/* Feedback Overlay */}
                {status === 'CORRECT' && (
                    <div className="absolute inset-0 bg-emerald-500/95 flex items-center justify-center backdrop-blur-sm animate-fade-in z-20 p-6">
                        <div className="text-white">
                            <div className="text-6xl mb-2">✅</div>
                            <div className="font-extrabold text-2xl">Correct!</div>
                            {aiFeedback && <div className="mt-2 text-sm font-bold opacity-90 bg-emerald-600/50 px-3 py-1 rounded-lg">{aiFeedback}</div>}
                            {/* Larger Pinyin for Success */}
                            <div className="font-mono opacity-90 mt-2 text-4xl">{pinyinify(card?.pinyin || '')}</div>
                        </div>
                    </div>
                )}

                {status === 'WRONG' && (
                    <div className="absolute inset-0 bg-rose-500/95 flex items-center justify-center backdrop-blur-sm animate-fade-in z-20 p-6">
                         <div className="text-white flex flex-col items-center max-w-[90%]">
                            <div className="text-5xl mb-2">❌</div>
                            <div className="font-extrabold text-2xl mb-2">Don't give up!</div>
                            {aiFeedback && <div className="mb-4 text-sm font-bold bg-rose-600/50 px-3 py-1 rounded-lg">{aiFeedback}</div>}
                            
                            <div className="bg-white/20 rounded-xl p-4 w-full mb-2">
                                <div className="text-xs uppercase font-bold opacity-75 mb-1">Correct Answer</div>
                                {/* Larger Pinyin for Correct Answer */}
                                <div className="font-mono text-4xl font-bold">{pinyinify(card?.pinyin || '')}</div>
                            </div>

                            <div className="bg-black/20 rounded-xl p-4 w-full">
                                <div className="text-xs uppercase font-bold opacity-75 mb-1">You Typed</div>
                                {/* Larger Pinyin for User Input */}
                                <div className="font-mono text-3xl">{pinyinify(inputValue) || '-'}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
         )}
      </div>

      {/* Input Area */}
      {!loadingCard && (
        <form onSubmit={handleSubmit} className="w-full mt-8 relative z-30">
            {status === 'IDLE' ? (
                <div className="space-y-4">
                    <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                        {attempts > 0 ? (
                            <span className="text-amber-500 animate-bounce block">
                                Try Again! You have {3 - attempts} more chances.
                            </span>
                        ) : (
                            "Type Pinyin (e.g. hao3 or hǎo)"
                        )}
                    </p>
                    <div className="flex gap-2">
                        <input 
                            ref={inputRef}
                            type="text" 
                            className={`flex-1 bg-white border-2 rounded-xl px-6 py-4 text-center font-bold text-4xl text-slate-700 outline-none focus:ring-4 placeholder-slate-200 transition-colors ${attempts > 0 ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-100' : 'border-indigo-100 focus:border-indigo-400 focus:ring-indigo-50'}`}
                            placeholder="Type here..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            autoComplete="off"
                            autoFocus
                            disabled={isChecking}
                        />
                        <Button type="submit" className="h-full aspect-square rounded-xl text-2xl" disabled={!inputValue || isChecking}>
                            {isChecking ? <span className="animate-spin text-sm">⏳</span> : '→'}
                        </Button>
                    </div>
                </div>
            ) : (
                <Button 
                    onClick={handleNext} 
                    className="w-full py-4 text-xl shadow-xl"
                    variant={status === 'CORRECT' ? 'primary' : 'secondary'}
                >
                    Next Word
                </Button>
            )}
        </form>
      )}
    </div>
  );
};
