
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Lesson } from '../types';
import { generateDistractors } from '../services/geminiService';

interface FillInBlanksGameProps {
  lesson: Lesson;
  onComplete: () => void;
  onExit: () => void;
  onRecordResult: (char: string, score: number, type: 'FILL_IN_BLANKS') => void;
}

export const FillInBlanksGame: React.FC<FillInBlanksGameProps> = ({ lesson, onComplete, onExit, onRecordResult }) => {
  const [items, setItems] = useState<{question: string, answer: string}[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'CORRECT' | 'WRONG'>('IDLE');
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    // Parse items from lesson characters
    // Expected format: "Question _ # Answer"
    const parsed = lesson.characters.map(c => {
        const parts = c.split('#');
        return {
            question: parts[0]?.trim() || c,
            answer: parts[1]?.trim() || ''
        };
    }).filter(i => i.answer); // Only keep valid ones
    setItems(parsed);
  }, [lesson]);

  useEffect(() => {
    const loadOptions = async () => {
        if (items.length === 0) return;
        if (isFinished) return;
        const currentItem = items[currentIndex];
        if (!currentItem) return;

        setLoadingOptions(true);
        setStatus('IDLE');
        setSelectedOption(null);

        // Generate distractors
        const distractors = await generateDistractors(currentItem.answer, currentItem.question);
        
        // Combine and shuffle
        const all = [...distractors, currentItem.answer].sort(() => Math.random() - 0.5);
        setOptions(all);
        setLoadingOptions(false);
    };
    loadOptions();
  }, [items, currentIndex, isFinished]);

  const handleSelect = (option: string) => {
      if (status !== 'IDLE') return;
      setSelectedOption(option);
      
      const currentItem = items[currentIndex];
      if (option === currentItem.answer) {
          setStatus('CORRECT');
          onRecordResult(currentItem.answer, 100, 'FILL_IN_BLANKS');
      } else {
          setStatus('WRONG');
          onRecordResult(currentItem.answer, 0, 'FILL_IN_BLANKS');
      }
  };

  const handleNext = () => {
      if (currentIndex >= items.length - 1) {
          setIsFinished(true);
      } else {
          setCurrentIndex(prev => prev + 1);
      }
  };

  if (items.length === 0) return <div className="p-8 text-center text-slate-500">Loading lesson...</div>;

  // SUCCESS SCREEN
  if (isFinished) {
      return (
        <div className="max-w-xl mx-auto pt-12 animate-float">
            <div className="bg-white p-12 rounded-[3rem] shadow-xl border-4 border-emerald-100 flex flex-col items-center text-center">
                <div className="text-8xl mb-6 animate-bounce">🌟</div>
                <h2 className="text-4xl font-extrabold text-emerald-600 mb-4">Awesome Job!</h2>
                <p className="text-slate-500 text-lg mb-8 font-medium">
                    You finished all the questions!
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

  const currentItem = items[currentIndex];

  return (
    <div className="max-w-xl mx-auto min-h-[60vh] flex flex-col items-center justify-center p-4">
       <div className="w-full flex justify-between items-center mb-8">
            <Button variant="ghost" onClick={onExit}>Quit</Button>
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                Question {currentIndex + 1} / {items.length}
            </span>
       </div>

       <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-xl w-full text-center border-4 border-slate-100 relative overflow-hidden">
            {/* Question Text */}
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 leading-relaxed mb-12">
                {currentItem.question.split('_').map((part, i, arr) => (
                    <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && (
                            <span className="inline-block border-b-4 border-indigo-200 w-24 mx-2 text-indigo-600 px-2 animate-pulse">
                                {status === 'CORRECT' || status === 'WRONG' ? currentItem.answer : '?'}
                            </span>
                        )}
                    </React.Fragment>
                ))}
            </h2>

            {/* Options Grid */}
            <div className="grid grid-cols-2 gap-4">
                {loadingOptions ? (
                    [1,2,3,4].map(i => (
                        <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse"></div>
                    ))
                ) : (
                    options.map((opt, i) => {
                        let btnStyle = "bg-white border-2 border-slate-200 text-slate-600 hover:border-indigo-300";
                        if (status !== 'IDLE') {
                            if (opt === currentItem.answer) {
                                btnStyle = "bg-emerald-500 border-emerald-600 text-white";
                            } else if (opt === selectedOption) {
                                btnStyle = "bg-rose-500 border-rose-600 text-white";
                            } else {
                                btnStyle = "bg-slate-50 border-slate-100 text-slate-300";
                            }
                        }

                        return (
                            <button
                                key={i}
                                onClick={() => handleSelect(opt)}
                                disabled={status !== 'IDLE'}
                                className={`py-4 rounded-xl text-xl font-bold transition-all transform active:scale-95 ${btnStyle}`}
                            >
                                {opt}
                            </button>
                        );
                    })
                )}
            </div>
            
            {/* Feedback / Next */}
            {status !== 'IDLE' && (
                <div className="mt-8 animate-fade-in">
                    {status === 'CORRECT' ? (
                        <div className="text-emerald-500 font-extrabold text-xl mb-4">✨ Correct! Excellent!</div>
                    ) : (
                        <div className="text-rose-500 font-extrabold text-xl mb-4">Correct answer: {currentItem.answer}</div>
                    )}
                    <Button onClick={handleNext} className="w-full py-4 text-lg">
                        {currentIndex >= items.length - 1 ? "Finish Assignment" : "Next Question →"}
                    </Button>
                </div>
            )}
       </div>
    </div>
  );
};
