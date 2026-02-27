
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Lesson } from '../types';
import { generateDistractors, generateQuizFromSentence, getSentenceMetadata, playPronunciation } from '../services/geminiService';

interface FillInBlanksGameProps {
  lesson: Lesson;
  initialCharacters: string[]; // Converted characters from App
  onComplete: () => void;
  onExit: () => void;
  onRecordResult: (char: string, score: number, type: 'FILL_IN_BLANKS') => void;
}

// Helper to shuffle array
function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export const FillInBlanksGame: React.FC<FillInBlanksGameProps> = ({ lesson, initialCharacters, onComplete, onExit, onRecordResult }) => {
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Quiz State
  const [quizData, setQuizData] = useState<{
      question: string;
      answer: string;
      options: string[];
      pinyin: string;
      translation: string;
      fullSentence: string;
  } | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const [showPinyin, setShowPinyin] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  // Initialize sentences
  useEffect(() => {
    const source = (initialCharacters && initialCharacters.length > 0) ? initialCharacters : lesson.characters;
    const s = source.filter(c => c.trim().length > 0);
    setSentences(s);
  }, [lesson, initialCharacters]);

  // Load Quiz for current sentence
  useEffect(() => {
    if (sentences.length === 0) return;
    if (isFinished) return;
    if (currentIndex >= sentences.length) return;

    const loadQuiz = async () => {
        setLoading(true);
        setQuizData(null);
        setSelectedOption(null);
        setIsCorrect(null);
        setShowPinyin(false);
        setShowTranslation(false);

        const rawSentence = sentences[currentIndex];
        
        // Check for # format (e.g. "I like #apple#.")
        const parts = rawSentence.split('#');
        
        if (parts.length >= 3) {
            // Has explicit blank
            const prefix = parts[0];
            const answer = parts[1];
            const suffix = parts[2];
            const question = `${prefix}___${suffix}`;
            const fullSentence = rawSentence.replace(/#/g, '');
            
            // Parallel fetch: distractors + metadata
            const [distractors, metadata] = await Promise.all([
                generateDistractors(answer, fullSentence),
                getSentenceMetadata(fullSentence)
            ]);

            const options = shuffleArray([answer, ...distractors]);
            
            setQuizData({ 
                question, 
                answer, 
                options,
                pinyin: metadata?.pinyin || '',
                translation: metadata?.translation || '',
                fullSentence
            });
        } else {
            // No explicit blank, use AI to generate quiz
            const quiz = await generateQuizFromSentence(rawSentence);
            if (quiz) {
                // Ensure options are shuffled
                const options = shuffleArray(quiz.options);
                // Reconstruct full sentence for audio
                const fullSentence = quiz.question.replace('___', quiz.answer);
                
                setQuizData({ 
                    ...quiz, 
                    options,
                    fullSentence
                });
            } else {
                // Fallback if AI fails (skip or show error)
                console.error("Failed to generate quiz for:", rawSentence);
                handleNext(); // Skip
            }
        }
        setLoading(false);
    };

    loadQuiz();
  }, [sentences, currentIndex, isFinished]);

  const handleOptionClick = (option: string) => {
      if (selectedOption || !quizData) return; // Prevent multiple clicks
      
      setSelectedOption(option);
      const correct = option === quizData.answer;
      setIsCorrect(correct);
      
      if (correct) {
          onRecordResult(quizData.answer, 100, 'FILL_IN_BLANKS');
      } else {
          onRecordResult(quizData.answer, 0, 'FILL_IN_BLANKS');
      }
  };

  const handleNext = () => {
      if (currentIndex >= sentences.length - 1) {
          setIsFinished(true);
      } else {
          setCurrentIndex(prev => prev + 1);
      }
  };

  if (sentences.length === 0) return <div className="p-8 text-center text-slate-500">Loading lesson...</div>;

  // SUCCESS SCREEN
  if (isFinished) {
      return (
        <div className="max-w-xl mx-auto pt-12 animate-float">
            <div className="bg-white p-12 rounded-[3rem] shadow-xl border-4 border-emerald-100 flex flex-col items-center text-center">
                <div className="text-8xl mb-6 animate-bounce">🎉</div>
                <h2 className="text-4xl font-extrabold text-emerald-600 mb-4">Quiz Complete!</h2>
                <p className="text-slate-500 text-lg mb-8 font-medium">
                    You've completed all the questions!
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

  return (
    <div className="max-w-4xl mx-auto min-h-[60vh] flex flex-col items-center justify-center p-4">
       <div className="w-full flex justify-between items-center mb-6">
            <Button variant="ghost" onClick={onExit}>Quit</Button>
            <div className="flex flex-col items-end">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded mb-1">Fill In Blanks</span>
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                    Question {currentIndex + 1} / {sentences.length}
                </span>
            </div>
       </div>

       {/* GAME BOARD */}
       <div className="w-full max-w-2xl bg-white rounded-[2rem] p-8 md:p-12 shadow-2xl border border-slate-100 flex flex-col items-center min-h-[400px] relative">
            
            {loading || !quizData ? (
                <div className="flex flex-col items-center justify-center h-full flex-1">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-400 font-bold animate-pulse">Generating Quiz...</p>
                </div>
            ) : (
                <>
                    {/* Helper Buttons */}
                    <div className="flex gap-3 mb-8 w-full justify-center">
                        <button 
                            onClick={() => setShowPinyin(!showPinyin)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${showPinyin ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                            Pinyin
                        </button>
                        <button 
                            onClick={() => playPronunciation(quizData.fullSentence)}
                            className="px-4 py-2 rounded-full text-sm font-bold bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 transition-all flex items-center gap-2"
                        >
                            <span>🔊</span> Audio
                        </button>
                        <button 
                            onClick={() => setShowTranslation(!showTranslation)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${showTranslation ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                            English
                        </button>
                    </div>

                    {/* Question Area */}
                    <div className="w-full text-center mb-12">
                        {showPinyin && (
                            <div className="text-xl text-indigo-500 mb-2 font-medium animate-fade-in">
                                {quizData.pinyin}
                            </div>
                        )}
                        
                        <h2 className="text-2xl md:text-4xl font-bold text-slate-800 leading-relaxed">
                            {quizData.question.split('___').map((part, i, arr) => (
                                <React.Fragment key={i}>
                                    {part}
                                    {i < arr.length - 1 && (
                                        <span className="inline-block border-b-4 border-indigo-300 px-4 mx-2 text-indigo-600 min-w-[60px]">
                                            {selectedOption && isCorrect ? quizData.answer : '___'}
                                        </span>
                                    )}
                                </React.Fragment>
                            ))}
                        </h2>

                        {showTranslation && (
                            <div className="text-lg text-slate-500 mt-4 italic animate-fade-in">
                                {quizData.translation}
                            </div>
                        )}
                    </div>

                    {/* Options */}
                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        {quizData.options.map((option, index) => {
                            const label = String.fromCharCode(97 + index); // a, b, c, d...
                            
                            let buttonStyle = "bg-white border-2 border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50";
                            
                            if (selectedOption) {
                                if (option === quizData.answer) {
                                    buttonStyle = "bg-emerald-100 border-emerald-500 text-emerald-700";
                                } else if (option === selectedOption) {
                                    buttonStyle = "bg-rose-100 border-rose-500 text-rose-700";
                                } else {
                                    buttonStyle = "bg-slate-50 border-slate-100 text-slate-300";
                                }
                            }

                            return (
                                <button
                                    key={index}
                                    onClick={() => handleOptionClick(option)}
                                    disabled={!!selectedOption}
                                    className={`
                                        relative p-4 rounded-xl text-left transition-all duration-200 flex items-center gap-4
                                        ${buttonStyle}
                                        ${!selectedOption && 'hover:shadow-md hover:-translate-y-0.5'}
                                    `}
                                >
                                    <span className={`
                                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2
                                        ${selectedOption && option === quizData.answer ? 'bg-emerald-500 border-emerald-500 text-white' : 
                                          selectedOption && option === selectedOption ? 'bg-rose-500 border-rose-500 text-white' :
                                          'bg-slate-100 border-slate-200 text-slate-500'}
                                    `}>
                                        {label}
                                    </span>
                                    <span className="text-xl font-bold">{option}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Feedback / Next */}
                    {selectedOption && (
                        <div className="w-full animate-fade-in">
                            <div className={`p-4 rounded-xl mb-4 text-center font-bold ${isCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                {isCorrect ? "Correct! 🎉" : `Oops! The answer is ${quizData.answer}`}
                            </div>
                            <Button onClick={handleNext} className="w-full py-4 text-lg shadow-lg">
                                {currentIndex >= sentences.length - 1 ? "Finish Quiz" : "Next Question →"}
                            </Button>
                        </div>
                    )}
                </>
            )}
       </div>
    </div>
  );
};
