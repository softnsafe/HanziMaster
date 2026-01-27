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
    // Clear previous content
    containerRef.current.innerHTML = '';
    
    // Reset mode to prop default when character changes
    setMode(initialMode);

    const HanziWriter = window.HanziWriter;
    if (!HanziWriter) {
      console.error("HanziWriter not loaded");
      if (containerRef.current) containerRef.current.innerText = "Library not loaded";
      return;
    }

    try {
      writerRef.current = HanziWriter.create(containerRef.current, character, {
        width: 250, // Made bigger for practice
        height: 250,
        padding: 15,
        showOutline: true,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 200,
        radicalColor: '#b91c1c', // red-700
        highlightColor: '#b91c1c',
        outlineColor: '#d6d3d1', // stone-300
        drawingWidth: 20, // Thicker strokes for writing
        onLoadCharDataSuccess: () => {
          setIsLoading(false);
          // Auto-start based on initial mode
          if (initialMode === 'quiz') {
            startQuizInternal();
          } else {
            writerRef.current?.animateCharacter();
          }
        },
        onLoadCharDataError: () => {
          setIsLoading(false);
          if (containerRef.current) containerRef.current.innerHTML = "<span class='text-xs text-red-500'>Error loading char</span>";
        }
      });
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }

  }, [character, initialMode]); 
  // Re-run if character changes. 
  // Note: We don't usually re-run just for initialMode changing unless we want to reset the whole writer.

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
      onComplete: (summary: any) => {
        // Trigger parent callback
        if (onComplete) onComplete();
      },
      highlightOnVariation: true
    });
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div 
        className={`relative bg-white rounded-xl shadow-sm overflow-hidden transition-colors duration-300 ${mode === 'quiz' ? 'border-4 border-red-100' : 'border border-stone-200'}`}
        style={{ width: 252, height: 252 }}
      >
         {/* Background Grid */}
         <div className="absolute inset-0 pointer-events-none opacity-10 z-0">
             <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="red" strokeWidth="1" strokeDasharray="5,5" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="red" strokeWidth="1" strokeDasharray="5,5" />
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="red" strokeWidth="1" />
                <line x1="100%" y1="0" x2="0" y2="100%" stroke="red" strokeWidth="1" />
             </svg>
         </div>

         {isLoading && (
             <div className="absolute inset-0 flex items-center justify-center bg-stone-50 z-10">
                 <svg className="animate-spin h-6 w-6 text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
             </div>
         )}
         <div ref={containerRef} className="relative z-10 cursor-crosshair" />
      </div>

      <div className="flex gap-2 w-full max-w-[250px] justify-center">
        <Button 
            variant={mode === 'view' ? 'secondary' : 'outline'} 
            onClick={animate} 
            className="text-xs flex-1"
            disabled={isLoading}
        >
           Watch
        </Button>
         <Button 
            variant={mode === 'quiz' ? 'secondary' : 'outline'} 
            onClick={startQuiz} 
            className="text-xs flex-1"
            disabled={isLoading}
        >
           Practice
        </Button>
      </div>
      
      {mode === 'quiz' && (
          <p className="text-stone-400 text-xs animate-pulse">Draw the character in the box above</p>
      )}
    </div>
  );
};