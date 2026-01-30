/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useState } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';

export const SupportWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus('submitting');
    const result = await sheetService.submitFeedback(name || 'Anonymous', email, message);
    
    if (result.success) {
        setStatus('success');
        setTimeout(() => {
            setIsOpen(false);
            setMessage('');
            setName('');
            setEmail('');
            setStatus('idle');
        }, 2000);
    } else {
        setStatus('error');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end pointer-events-none">
       {/* The Form Popover */}
       <div className={`pointer-events-auto bg-white rounded-2xl shadow-2xl border border-slate-100 w-80 mb-4 overflow-hidden transition-all duration-300 origin-bottom-right ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'}`}>
           <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
               <h3 className="font-bold">Contact Support</h3>
               <button onClick={() => setIsOpen(false)} className="opacity-80 hover:opacity-100">✕</button>
           </div>
           
           {status === 'success' ? (
               <div className="p-8 text-center text-emerald-600">
                   <div className="text-4xl mb-2">✅</div>
                   <p className="font-bold">Message Sent!</p>
               </div>
           ) : (
               <form onSubmit={handleSubmit} className="p-4 space-y-4">
                   <div>
                       <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Name (Optional)</label>
                       <input 
                         className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                         value={name}
                         onChange={e => setName(e.target.value)}
                         placeholder="Your name"
                       />
                   </div>
                   <div>
                       <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Email (Optional)</label>
                       <input 
                         type="email"
                         className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                         value={email}
                         onChange={e => setEmail(e.target.value)}
                         placeholder="parent@example.com"
                       />
                   </div>
                   <div>
                       <label className="block text-xs font-bold text-slate-400 uppercase mb-1">How can we help?</label>
                       <textarea 
                         required
                         rows={3}
                         className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                         value={message}
                         onChange={e => setMessage(e.target.value)}
                         placeholder="Describe your issue..."
                       />
                   </div>
                   <Button type="submit" isLoading={status === 'submitting'} className="w-full py-2 text-sm">
                       Send Message
                   </Button>
                   {status === 'error' && <p className="text-xs text-rose-500 text-center font-bold">Failed to send. Try again.</p>}
               </form>
           )}
       </div>

       {/* The Button */}
       <button 
         onClick={() => setIsOpen(!isOpen)}
         className={`pointer-events-auto w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-slate-200 text-slate-600 rotate-90' : 'bg-indigo-600 text-white hover:scale-110 hover:bg-indigo-700'}`}
         aria-label="Contact Support"
       >
          {isOpen ? (
              <span className="text-2xl font-bold">✕</span>
          ) : (
              <span className="text-2xl">💬</span>
          )}
       </button>
    </div>
  );
};