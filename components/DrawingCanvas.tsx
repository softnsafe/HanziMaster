import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from './Button';

interface DrawingCanvasProps {
  onCapture: (base64: string) => void;
  targetChar: string;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onCapture, targetChar }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12; // Brush thickness
    ctx.strokeStyle = '#1c1917'; // warm black
  }, []);

  const getCoordinates = (event: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = (event as React.MouseEvent).clientX;
      clientY = (event as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling on touch
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling on touch
    if (!isDrawing) return;
    
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasDrawn(true);
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height); // use raw width/height for clear
      setHasDrawn(false);
    }
  };

  const handleCapture = () => {
    if (canvasRef.current && hasDrawn) {
      const base64 = canvasRef.current.toDataURL('image/png');
      onCapture(base64);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-full max-w-[350px] aspect-square bg-white border-4 border-stone-800 shadow-xl rounded-sm overflow-hidden">
        {/* Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
             <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="red" strokeWidth="1" strokeDasharray="5,5" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="red" strokeWidth="1" strokeDasharray="5,5" />
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="red" strokeWidth="1" />
                <line x1="100%" y1="0" x2="0" y2="100%" stroke="red" strokeWidth="1" />
             </svg>
        </div>

        {/* Target Character Ghost (Optional guide) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-10">
          <span className="font-serif-sc text-[200px] leading-none text-stone-900 select-none">
            {targetChar}
          </span>
        </div>

        <canvas
          ref={canvasRef}
          className="relative z-10 w-full h-full cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      <div className="flex gap-3 w-full max-w-[350px]">
        <Button variant="secondary" onClick={clearCanvas} className="flex-1">
          Clear
        </Button>
        <Button onClick={handleCapture} disabled={!hasDrawn} className="flex-1">
          Submit
        </Button>
      </div>
    </div>
  );
};