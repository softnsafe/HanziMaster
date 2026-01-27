import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

interface HanziPlayerProps {
  character: string;
  initialMode?: 'view' | 'quiz';
  onComplete?: () => void;
}

export const HanziPlayer: React.FC<HanziPlayerProps> = ({ 
  character, 
  initialMode = 'view',
  onComplete 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'view' | 'quiz'>(initialMode);

  useEffect(() => {
    if (!containerRef.current || !character) return;
    setIsLoading(true);
    containerRef.current.innerHTML = '';
    setMode(initialMode);
    const HanziWriter = window.HanziWriter;
    if (!HanziWriter) {
      if (containerRef.current) containerRef.current.innerText = "Lib missing";
      return;
    }

    try {
      writerRef.current = HanziWriter.create(containerRef.current, character, {
        width: 250, 
        height: 250,
        padding: 15,
        showOutline: true,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 200,
        radicalColor: '#6366f1', // indigo-500
        highlightColor: '#10b981', // emerald-500
        outlineColor: '#cbd5e1', // slate-300
        drawingWidth: 25, 
        strokeColor: '#334155', // slate-700
        onLoadCharDataSuccess: () => {
          setIsLoading(false);
          if (initialMode === 'quiz') startQuizInternal();
          else writerRef.current?.animateCharacter();
        },
        onLoadCharDataError: () => {
          setIsLoading(false);
          if (containerRef.current) containerRef.current.innerHTML = "<span class='text-xs text-rose-500'>Error</span>";
        }
      });
    } catch (e) {
      setIsLoading(false);
    }
  }, [character, initialMode]); 

  const animate = () => {
    setMode('view');
    writerRef.current?.animateCharacter();
  };

  const startQuiz = () => {
    setMode('quiz');
    startQuizInternal();
  };

  const startQuizInternal = () => {
    writerRef.current?.quiz({
      onComplete: () => {
        if (onComplete) onComplete();
      },
      highlightOnVariation: true
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div 
        className={`relative bg-white rounded-3xl overflow-hidden transition-all duration-300 ${mode === 'quiz' ? 'shadow-xl shadow-indigo-100 scale-105 border-4 border-indigo-100' : 'border border-slate-200'}`}
        style={{ width: 250, height: 250 }}
      >
         {/* Grid */}
         <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
             <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#ef4444" strokeWidth="2" strokeDasharray="6,6" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#ef4444" strokeWidth="2" strokeDasharray="6,6" />
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="#ef4444" strokeWidth="2" />
                <line x1="100%" y1="0" x2="0" y2="100%" stroke="#ef4444" strokeWidth="2" />
             </svg>
         </div>

         {isLoading && (
             <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
             </div>
         )}
         <div ref={containerRef} className="relative z-10 cursor-crosshair" />
      </div>

      <div className="flex gap-4 w-full max-w-[280px] justify-center">
        <Button 
            variant={mode === 'view' ? 'secondary' : 'outline'} 
            onClick={animate} 
            className="flex-1 text-sm"
            disabled={isLoading}
        >
           👀 Watch
        </Button>
         <Button 
            variant={mode === 'quiz' ? 'secondary' : 'outline'} 
            onClick={startQuiz} 
            className="flex-1 text-sm"
            disabled={isLoading}
        >
           ✍️ Write
        </Button>
      </div>
    </div>
  );
};