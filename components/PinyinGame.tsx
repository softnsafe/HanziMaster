/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import { Flashcard, Lesson } from '../types';
import { getFlashcardData, playPronunciation } from '../services/geminiService';

interface PinyinGameProps {
  lesson: Lesson;
  onComplete: () => void;
  onExit: () => void;
  onRecordResult: (char: string, score: number, type: 'PINYIN') => void;
}

export const PinyinGame: React.FC<PinyinGameProps> = ({ lesson, onComplete, onExit, onRecordResult }) => {
  const [queue, setQueue] = useState<string[]>(lesson.characters);
  const [flashcards, setFlashcards] = useState<Record<string, Flashcard>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'CORRECT' | 'WRONG'>('IDLE');
  const [loadingCard, setLoadingCard] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentChar = queue[currentIndex];
  // Safe access for card
  const card = currentChar ? flashcards[currentChar] : undefined;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!card || status !== 'IDLE' || !currentChar) return;

    const normalizedInput = inputValue.trim().toLowerCase();
    const normalizedTarget = card.pinyin.toLowerCase().replace(/\s+/g, ''); // remove spaces in pinyin if any
    
    // Simple check: allow spaces or no spaces
    const isCorrect = normalizedInput.replace(/\s+/g, '') === normalizedTarget;

    if (isCorrect) {
      setStatus('CORRECT');
      onRecordResult(currentChar, 100, 'PINYIN');
      // Play sound effect?
    } else {
      setStatus('WRONG');
      setMistakes(prev => [...prev, currentChar]);
      onRecordResult(currentChar, 0, 'PINYIN');
    }
  };

  const handleNext = () => {
    setInputValue('');
    setStatus('IDLE');
    
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
      await playPronunciation(currentChar);
      setIsPlayingAudio(false);
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
      <div className="bg-white rounded-[2.5rem] p-8 shadow-xl w-full text-center border-4 border-slate-100 relative overflow-hidden transition-all">
         
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
                            className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 hover:bg-indigo-100 flex items-center justify-center text-xl transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            title="Listen"
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
                    <div className="absolute inset-0 bg-emerald-500/90 flex items-center justify-center backdrop-blur-sm animate-fade-in z-20">
                        <div className="text-white">
                            <div className="text-6xl mb-2">✅</div>
                            <div className="font-extrabold text-2xl">Correct!</div>
                            <div className="font-mono opacity-80 mt-1">{card?.pinyin}</div>
                        </div>
                    </div>
                )}

                {status === 'WRONG' && (
                    <div className="absolute inset-0 bg-rose-500/90 flex items-center justify-center backdrop-blur-sm animate-fade-in z-20">
                         <div className="text-white">
                            <div className="text-6xl mb-2">❌</div>
                            <div className="font-extrabold text-2xl">Oops!</div>
                            <div className="font-mono text-xl bg-white/20 rounded-lg px-4 py-2 mt-4 inline-block">
                                {card?.pinyin}
                            </div>
                            <p className="text-sm mt-4 font-bold opacity-80">Don't worry, we'll review this.</p>
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
                        Type Pinyin + Tone Number (e.g. hao3)
                    </p>
                    <div className="flex gap-2">
                        <input 
                            ref={inputRef}
                            type="text" 
                            className="flex-1 bg-white border-2 border-indigo-100 rounded-xl px-6 py-4 text-center font-bold text-2xl text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 placeholder-slate-200"
                            placeholder="Type here..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            autoComplete="off"
                            autoFocus
                        />
                        <Button type="submit" className="h-full aspect-square rounded-xl text-2xl" disabled={!inputValue}>
                            →
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