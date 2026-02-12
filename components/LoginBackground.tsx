
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React from 'react';

interface LoginBackgroundProps {
  bgImage: string | null;
}

export const LoginBackground = React.memo<LoginBackgroundProps>(({ bgImage }) => {
  return (
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-700"
        style={{ 
             backgroundImage: bgImage ? `url(${bgImage})` : 'linear-gradient(to bottom right, #bae6fd, #e0f2fe, #eff6ff)', // Sky Gradient
             backgroundColor: '#f0f9ff'
        }}
      >
        {/* Optional overlay to improve text readability if needed */}
        {bgImage && <div className="absolute inset-0 bg-black/10"></div>}

        {/* Fallback Background Decorations (only if no AI image) */}
        {!bgImage && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                {/* Subtle Grid */}
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                
                {/* Cloud 1 - Top Left */}
                <div className="absolute top-10 left-[5%] text-white w-48 animate-float drop-shadow-lg opacity-90" style={{ animationDuration: '8s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5,19c-3.037,0-5.5-2.463-5.5-5.5c0-0.34,0.032-0.673,0.091-1C9.224,12.783,5,15.111,5,18c0,0.552,0.448,1,1,1h11.5 C17.948,19,18,19,17.5,19z M19,5.5c-3.037,0-5.5,2.463-5.5,5.5c0,0.573,0.09,1.123,0.252,1.641C13.235,12.21,12.636,12,12,12 c-3.313,0-6,2.687-6,6c0,0.485,0.063,0.957,0.174,1.408C6.113,19.224,6,19.096,6,19h13c2.761,0,5-2.239,5-5S21.761,9,19,9V5.5z" /></svg>
                </div>
                
                {/* Cloud 2 - Top Right */}
                <div className="absolute top-24 right-[10%] text-white w-32 animate-float drop-shadow-md opacity-80" style={{ animationDuration: '12s', animationDelay: '1s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c.276 0 .548.026.812.072C18.675 8.653 15.65 6 12 6c-3.23 0-5.96 2.067-6.84 5h-.66c-2.485 0-4.5 2.015-4.5 4.5S2.015 20 4.5 20h14c3.037 0 5.5-2.463 5.5-5.5S21.537 9 18.5 9z" /></svg>
                </div>

                {/* Cloud 3 - Middle Left */}
                <div className="absolute top-[45%] left-[-2%] text-white/80 w-64 animate-float drop-shadow-sm opacity-60" style={{ animationDuration: '15s', animationDelay: '2s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19,5.5c-3.037,0-5.5,2.463-5.5,5.5c0,0.573,0.09,1.123,0.252,1.641C13.235,12.21,12.636,12,12,12 c-3.313,0-6,2.687-6,6c0,0.485,0.063,0.957,0.174,1.408C6.113,19.224,6,19.096,6,19h13c2.761,0,5-2.239,5-5S21.761,9,19,9V5.5z" /></svg>
                </div>

                {/* Cloud 4 - Bottom Right */}
                <div className="absolute bottom-[15%] right-[5%] text-white w-56 animate-float drop-shadow-xl opacity-80" style={{ animationDuration: '10s', animationDelay: '0.5s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5,19c-3.037,0-5.5-2.463-5.5-5.5c0-0.34,0.032-0.673,0.091-1C9.224,12.783,5,15.111,5,18c0,0.552,0.448,1,1,1h11.5 C17.948,19,18,19,17.5,19z M19,5.5c-3.037,0-5.5,2.463-5.5,5.5c0,0.573,0.09,1.123,0.252,1.641C13.235,12.21,12.636,12,12,12 c-3.313,0-6,2.687-6,6c0,0.485,0.063,0.957,0.174,1.408C6.113,19.224,6,19.096,6,19h13c2.761,0,5-2.239,5-5S21.761,9,19,9V5.5z" /></svg>
                </div>

                {/* Cloud 5 - Bottom Left Small */}
                <div className="absolute bottom-[25%] left-[15%] text-white/70 w-24 animate-float drop-shadow-sm opacity-70" style={{ animationDuration: '9s', animationDelay: '3s' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c.276 0 .548.026.812.072C18.675 8.653 15.65 6 12 6c-3.23 0-5.96 2.067-6.84 5h-.66c-2.485 0-4.5 2.015-4.5 4.5S2.015 20 4.5 20h14c3.037 0 5.5-2.463 5.5-5.5S21.537 9 18.5 9z" /></svg>
                </div>
            </div>
        )}
      </div>
  );
});
