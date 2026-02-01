/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React from 'react';
import QRCode from 'react-qr-code';
import { Button } from './Button';

interface QRCodeModalProps {
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ onClose }) => {
  const currentUrl = window.location.href;

  return (
    <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-200 flex flex-col items-center">
        
        <div className="flex justify-between items-center w-full mb-6">
            <h2 className="text-xl font-extrabold text-slate-800">📱 Scan to Join</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold transition-colors">×</button>
        </div>

        <div className="bg-white p-4 rounded-xl border-2 border-slate-100 shadow-inner mb-6">
            <QRCode 
                value={currentUrl} 
                size={200}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox={`0 0 256 256`}
            />
        </div>

        <p className="text-slate-500 text-sm font-bold break-all mb-6 px-2">
            {currentUrl}
        </p>

        <Button onClick={onClose} className="w-full">
            Done
        </Button>
      </div>
    </div>
  );
};