
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Lesson } from '../types';

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
  // Use pre-converted characters if available, otherwise fallback to lesson default
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Game State for current sentence
  const [targetBlocks, setTargetBlocks] = useState<string[]>([]);
  const [availableBlocks, setAvailableBlocks] = useState<{id: string, text: string}[]>([]);
  const [placedBlocks, setPlacedBlocks] = useState<{id: string, text: string}[]>([]);
  
  const [status, setStatus] = useState<'IDLE' | 'CORRECT' | 'WRONG'>('IDLE');
  const [isFinished, setIsFinished] = useState(false);

  // Initialize sentences
  useEffect(() => {
    // Determine source: pre-converted props or raw lesson data
    const source = (initialCharacters && initialCharacters.length > 0) ? initialCharacters : lesson.characters;
    const s = source.filter(c => c.trim().length > 0);
    setSentences(s);
  }, [lesson, initialCharacters]);

  // Setup current round
  useEffect(() => {
    if (sentences.length === 0) return;
    if (isFinished) return;
    if (currentIndex >= sentences.length) return;

    const rawSentence = sentences[currentIndex];
    
    // Split by # for blocks
    const parts = rawSentence.split('#')
        .map(p => p.trim())
        .filter(p => p.length > 0);

    setTargetBlocks(parts);
    setPlacedBlocks([]);
    setStatus('IDLE');

    // Create unique IDs for blocks to handle duplicate words
    const blocksWithIds = parts.map((text, idx) => ({
        id: `${text}-${idx}`,
        text
    }));
    
    setAvailableBlocks(shuffleArray(blocksWithIds));

  }, [sentences, currentIndex, isFinished]);

  // Check Answer
  useEffect(() => {
      if (targetBlocks.length === 0) return;
      
      // Auto-check when all slots are filled
      if (placedBlocks.length === targetBlocks.length) {
          const currentAnswer = placedBlocks.map(b => b.text).join('');
          const targetAnswer = targetBlocks.join('');
          
          if (currentAnswer === targetAnswer) {
              setStatus('CORRECT');
              onRecordResult(targetAnswer, 100, 'FILL_IN_BLANKS');
          } else {
              setStatus('WRONG');
              onRecordResult(targetAnswer, 0, 'FILL_IN_BLANKS');
          }
      } else {
          setStatus('IDLE');
      }
  }, [placedBlocks, targetBlocks, onRecordResult]);

  const handlePlaceBlock = (blockId: string) => {
      if (status === 'CORRECT') return; // Locked if correct

      const block = availableBlocks.find(b => b.id === blockId);
      if (!block) return;

      // Move from available to placed
      setAvailableBlocks(prev => prev.filter(b => b.id !== blockId));
      setPlacedBlocks(prev => [...prev, block]);
  };

  const handleRemoveBlock = (blockId: string) => {
      if (status === 'CORRECT') return; // Locked if correct

      const block = placedBlocks.find(b => b.id === blockId);
      if (!block) return;

      // Move from placed to available
      setPlacedBlocks(prev => prev.filter(b => b.id !== blockId));
      setAvailableBlocks(prev => [...prev, block]);
  };

  const handleNext = () => {
      if (currentIndex >= sentences.length - 1) {
          setIsFinished(true);
      } else {
          setCurrentIndex(prev => prev + 1);
      }
  };

  // --- Brick Styling Helpers ---
  const getBrickColor = (index: number) => {
      const colors = [
          'bg-red-500 border-red-700 shadow-[0_4px_0_#991b1b] text-white',
          'bg-blue-500 border-blue-700 shadow-[0_4px_0_#1e40af] text-white',
          'bg-yellow-400 border-yellow-600 shadow-[0_4px_0_#ca8a04] text-yellow-900',
          'bg-green-500 border-green-700 shadow-[0_4px_0_#15803d] text-white',
          'bg-orange-500 border-orange-700 shadow-[0_4px_0_#c2410c] text-white',
      ];
      return colors[index % colors.length];
  };

  const baseplateStyle = {
      backgroundColor: '#f1f5f9',
      backgroundImage: 'radial-gradient(#cbd5e1 3px, transparent 3px)',
      backgroundSize: '20px 20px',
      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.1)'
  };

  if (sentences.length === 0) return <div className="p-8 text-center text-slate-500">Loading lesson...</div>;

  // SUCCESS SCREEN
  if (isFinished) {
      return (
        <div className="max-w-xl mx-auto pt-12 animate-float">
            <div className="bg-white p-12 rounded-[3rem] shadow-xl border-4 border-emerald-100 flex flex-col items-center text-center">
                <div className="text-8xl mb-6 animate-bounce">🏗️</div>
                <h2 className="text-4xl font-extrabold text-emerald-600 mb-4">Master Builder!</h2>
                <p className="text-slate-500 text-lg mb-8 font-medium">
                    You've built all the sentences correctly!
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
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded mb-1">LinguaBrick Mode</span>
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                    Build {currentIndex + 1} / {sentences.length}
                </span>
            </div>
       </div>

       {/* GAME BOARD */}
       <div className="w-full rounded-[2rem] p-6 md:p-10 shadow-2xl relative overflow-hidden border-b-8 border-slate-300 flex flex-col min-h-[500px]" style={baseplateStyle}>
            
            <div className="text-center mb-4 opacity-50 font-bold uppercase tracking-widest text-slate-400 text-xs">
                 Build Area
            </div>

            {/* Construction Area (Sockets) */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-12 min-h-[120px] bg-black/5 rounded-2xl p-4 border-2 border-slate-300/50">
                {targetBlocks.map((_, i) => {
                    const placedBlock = placedBlocks[i];
                    
                    return (
                        <div 
                            key={i} 
                            onClick={() => placedBlock && handleRemoveBlock(placedBlock.id)}
                            className={`
                                h-16 min-w-[80px] px-2 rounded-lg border-4 border-dashed flex items-center justify-center transition-all duration-300 relative
                                ${placedBlock 
                                    ? `cursor-pointer hover:scale-95 ${getBrickColor(placedBlock.text.length)} border-solid shadow-lg` 
                                    : 'bg-white/40 border-slate-300 text-slate-300'
                                }
                            `}
                        >
                             {placedBlock ? (
                                 <>
                                    <div className="absolute -top-1.5 left-2 w-3 h-1.5 bg-inherit rounded-t-sm opacity-80 filter brightness-110"></div>
                                    <div className="absolute -top-1.5 right-2 w-3 h-1.5 bg-inherit rounded-t-sm opacity-80 filter brightness-110"></div>
                                    <span className="font-bold text-xl drop-shadow-sm px-2">{placedBlock.text}</span>
                                 </>
                             ) : (
                                 <span className="font-black text-2xl opacity-20">{i + 1}</span>
                             )}
                        </div>
                    );
                })}
            </div>

            <div className="text-center mb-4 opacity-50 font-bold uppercase tracking-widest text-slate-400 text-xs">
                 Brick Yard
            </div>

            {/* Brick Yard (Options) */}
            <div className="flex flex-wrap justify-center gap-4">
                {availableBlocks.map((block, i) => {
                    const brickStyle = getBrickColor(block.text.length + i); // Varied colors
                    return (
                        <button
                            key={block.id}
                            onClick={() => handlePlaceBlock(block.id)}
                            className={`
                                relative py-3 px-6 rounded-lg text-lg md:text-xl font-extrabold transition-all transform
                                active:scale-95 active:translate-y-1 active:shadow-none border-b-4 border-r-2 border-l-2 border-t-2
                                ${brickStyle}
                                hover:-translate-y-1
                            `}
                        >
                            {/* Studs */}
                            <div className="absolute -top-1.5 left-2 w-3 h-1.5 bg-inherit filter brightness-110 rounded-t-sm border-t border-l border-r border-black/10"></div>
                            <div className="absolute -top-1.5 right-2 w-3 h-1.5 bg-inherit filter brightness-110 rounded-t-sm border-t border-l border-r border-black/10"></div>
                            
                            <span className="relative z-10 drop-shadow-sm">{block.text}</span>
                        </button>
                    );
                })}
            </div>
            
            {/* Feedback / Next Overlay */}
            {(status === 'CORRECT' || status === 'WRONG') && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-[2px] animate-fade-in">
                    <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce-in max-w-sm mx-4 w-full">
                        <div className="text-4xl mb-2">
                            {status === 'CORRECT' ? '🎉' : '💥'}
                        </div>
                        <h3 className={`text-2xl font-extrabold mb-4 ${status === 'CORRECT' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {status === 'CORRECT' ? 'Perfect Build!' : 'Structure Unstable!'}
                        </h3>
                        
                        {status === 'WRONG' && (
                             <div className="text-center mb-6 w-full">
                                 <p className="text-slate-400 text-xs font-bold uppercase mb-1">Blueprint</p>
                                 <div className="bg-slate-100 p-3 rounded-xl font-bold text-slate-700 text-lg">
                                     {targetBlocks.join('')}
                                 </div>
                                 <p className="text-slate-400 text-xs mt-2">Tap bricks to undo and try again.</p>
                             </div>
                        )}

                        <div className="flex gap-3 w-full">
                            {status === 'WRONG' && (
                                <Button 
                                    variant="secondary"
                                    onClick={() => {
                                        // Reset board
                                        setPlacedBlocks([]);
                                        // Re-shuffle available
                                        const parts = sentences[currentIndex].split('#').map(p => p.trim()).filter(p => p.length > 0);
                                        const blocksWithIds = parts.map((text, idx) => ({ id: `${text}-${idx}`, text }));
                                        setAvailableBlocks(shuffleArray(blocksWithIds));
                                        setStatus('IDLE');
                                    }}
                                    className="flex-1"
                                >
                                    Rebuild
                                </Button>
                            )}
                            {status === 'CORRECT' && (
                                <Button onClick={handleNext} className="w-full py-3 text-lg shadow-xl">
                                    {currentIndex >= sentences.length - 1 ? "Finish Set" : "Next Project →"}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
       </div>
    </div>
  );
};
