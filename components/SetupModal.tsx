
import React, { useState } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';
import { APPS_SCRIPT_TEMPLATE } from '../utils/backendScript';

interface SetupModalProps {
  onClose: () => void;
}

export const SetupModal: React.FC<SetupModalProps> = ({ onClose }) => {
  const [url, setUrl] = useState(sheetService.getUrl());
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(1);

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
        const res = await sheetService.checkConnection({ sheetUrl: url });
        setTestResult(res);
        if (res.success) {
            sheetService.saveUrl(url);
            // Auto-setup if connected
            if (!sheetService.isDemoMode()) {
               await sheetService.forceSetup();
            }
        }
    } catch (e) {
        setTestResult({ success: false, message: "Connection check failed" });
    }
    setIsTesting(false);
  };

  const handleSave = () => {
      sheetService.saveUrl(url);
      onClose(); // Close modal and let parent handle state refresh
  };

  const handleDemo = () => {
      sheetService.setDemoMode(true);
      onClose(); // Close modal and let parent handle state refresh
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
         <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 font-bold">✕</button>
         
         <div className="mb-6">
             <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Backend Setup ⚙️</h2>
             <p className="text-slate-500 font-medium">Connect your own Google Sheet to store data.</p>
         </div>

         {/* Steps Navigation */}
         <div className="flex gap-2 mb-6 border-b border-slate-100 pb-4">
             <button onClick={() => setStep(1)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${step === 1 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}>1. Get Code</button>
             <button onClick={() => setStep(2)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${step === 2 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}>2. Connect</button>
         </div>

         {step === 1 && (
             <div className="space-y-4">
                 <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-800 text-sm font-medium">
                     <strong className="block mb-1">Instructions:</strong>
                     <ol className="list-decimal list-inside space-y-1">
                         <li>Create a new Google Sheet.</li>
                         <li>Go to <strong>Extensions &gt; Apps Script</strong>.</li>
                         <li>Paste the code below (replace everything).</li>
                         <li>Click <strong>Deploy &gt; New Deployment</strong>.</li>
                         <li>Select type: <strong>Web App</strong>.</li>
                         <li>Set access to: <strong>Anyone</strong> (Important!).</li>
                         <li>Copy the generated <strong>Web App URL</strong>.</li>
                     </ol>
                 </div>
                 <div className="relative">
                     <textarea 
                        readOnly 
                        value={APPS_SCRIPT_TEMPLATE.trim()} 
                        className="w-full h-48 bg-slate-800 text-slate-300 font-mono text-xs p-4 rounded-xl outline-none resize-none"
                     />
                     <button 
                        onClick={handleCopy}
                        className={`absolute top-4 right-4 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                     >
                        {copied ? 'Copied!' : 'Copy Code'}
                     </button>
                 </div>
                 <Button onClick={() => setStep(2)} className="w-full">Next Step →</Button>
             </div>
         )}

         {step === 2 && (
             <div className="space-y-6">
                 <div>
                     <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Web App URL</label>
                     <input 
                        type="url" 
                        value={url} 
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/..." 
                        className="w-full px-5 py-4 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-400 outline-none font-bold text-slate-700"
                     />
                 </div>

                 {testResult && (
                     <div className={`p-4 rounded-xl text-sm font-bold ${testResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                         {testResult.success ? '✅ ' : '❌ '}
                         {testResult.message}
                     </div>
                 )}

                 <div className="flex gap-4">
                     <Button 
                        onClick={handleTest} 
                        isLoading={isTesting}
                        variant="secondary"
                        className="flex-1"
                        disabled={!url}
                     >
                        Test Connection
                     </Button>
                     <Button 
                        onClick={handleSave} 
                        disabled={!testResult?.success}
                        className="flex-1"
                     >
                        Save & Restart
                     </Button>
                 </div>

                 <div className="border-t border-slate-100 pt-6 mt-6">
                     <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 text-center">Or Try It Out</h4>
                     <Button variant="outline" onClick={handleDemo} className="w-full border-slate-200 hover:border-purple-200 hover:text-purple-600 hover:bg-purple-50">
                        Start Demo Mode (No Setup Required)
                     </Button>
                 </div>
             </div>
         )}
      </div>
    </div>
  );
};
