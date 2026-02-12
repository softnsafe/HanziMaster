
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';

interface SetupModalProps {
  onClose: () => void;
}

const APPS_SCRIPT_CODE = `
// CONFIGURATION
const VERSION = 'v3.5'; // Teacher Disconnect Control
// Leave empty to use the sheet where this script is bound (Recommended)
const SHEET_ID = ''; 

function getSpreadsheet() {
  if (SHEET_ID) { try { return SpreadsheetApp.openById(SHEET_ID); } catch (e) {} }
  try { var ss = SpreadsheetApp.getActiveSpreadsheet(); if (ss) return ss; } catch (e) {}
  throw new Error("Could not find the Spreadsheet. Please ensuring this script is bound to a Google Sheet.");
}

function setup() {
  const ss = getSpreadsheet();
  
  let studentSheet = ss.getSheetByName('Students');
  if (!studentSheet) {
    studentSheet = ss.insertSheet('Students');
    studentSheet.appendRow(['ID', 'Name', 'JoinedAt', 'LastLogin', 'Password', 'Script', 'Points', 'Stickers', 'Permissions']);
    studentSheet.setFrozenRows(1);
  } else {
    const headers = studentSheet.getRange(1, 1, 1, studentSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('Points') === -1) {
        studentSheet.getRange(1, headers.length + 1).setValue('Points');
        studentSheet.getRange(1, headers.length + 2).setValue('Stickers');
    }
    if (headers.indexOf('Permissions') === -1) {
        const nextCol = studentSheet.getLastColumn() + 1;
        studentSheet.getRange(1, nextCol).setValue('Permissions');
    }
  }

  // CUSTOM STICKERS SHEET
  let customStickerSheet = ss.getSheetByName('CustomStickers');
  if (!customStickerSheet) {
    customStickerSheet = ss.insertSheet('CustomStickers');
    customStickerSheet.appendRow(['ID', 'StudentID', 'DataUrl', 'Prompt', 'Timestamp']);
    customStickerSheet.setFrozenRows(1);
  }

  // STORE SHEET (NEW)
  let storeSheet = ss.getSheetByName('Store');
  if (!storeSheet) {
    storeSheet = ss.insertSheet('Store');
    storeSheet.appendRow(['ID', 'Name', 'ImageURL', 'Cost', 'Active']);
    storeSheet.setFrozenRows(1);
  }

  let assignSheet = ss.getSheetByName('Assignments');
  if (!assignSheet) {
    assignSheet = ss.insertSheet('Assignments');
    assignSheet.appendRow(['ID', 'Title', 'Description', 'Characters', 'StartDate', 'EndDate', 'Type', 'AssignedTo']);
    assignSheet.setFrozenRows(1);
  }

  let progressSheet = ss.getSheetByName('Progress');
  if (!progressSheet) {
    progressSheet = ss.insertSheet('Progress');
    progressSheet.appendRow(['ID', 'StudentName', 'Character', 'Score', 'Details', 'Timestamp', 'Date', 'Type']);
    progressSheet.setFrozenRows(1);
  }

  let saSheet = ss.getSheetByName('StudentAssignments');
  if (!saSheet) { saSheet = ss.insertSheet('StudentAssignments'); saSheet.appendRow(['StudentID', 'AssignmentID', 'Status', 'Timestamp']); saSheet.setFrozenRows(1); }

  let logSheet = ss.getSheetByName('LoginLogs');
  if (!logSheet) {
    logSheet = ss.insertSheet('LoginLogs');
    logSheet.appendRow(['Timestamp', 'StudentID', 'Name', 'Action', 'Device']);
    logSheet.setFrozenRows(1);
  }

  let pointLogSheet = ss.getSheetByName('PointLogs');
  if (!pointLogSheet) {
    pointLogSheet = ss.insertSheet('PointLogs');
    pointLogSheet.appendRow(['Timestamp', 'StudentID', 'Delta', 'Reason', 'NewBalance']);
    pointLogSheet.setFrozenRows(1);
  }

  let fbSheet = ss.getSheetByName('Feedback');
  if (!fbSheet) { 
    fbSheet = ss.insertSheet('Feedback'); 
    fbSheet.appendRow(['Timestamp', 'Name', 'Email', 'Message']); 
    fbSheet.setFrozenRows(1); 
  }

  let calSheet = ss.getSheetByName('Calendar');
  if (!calSheet) {
    calSheet = ss.insertSheet('Calendar');
    calSheet.appendRow(['ID', 'Date', 'Title', 'Type', 'Description']);
    calSheet.setFrozenRows(1);
  }
  
  // Set default class status to OPEN if not set
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CLASS_STATUS')) {
      props.setProperty('CLASS_STATUS', 'OPEN');
  }
  
  return ss.getName();
}

function findColumnIndex(headers, keys) {
  const lowerHeaders = headers.map(h => String(h).trim().toLowerCase());
  for (var i = 0; i < keys.length; i++) { var idx = lowerHeaders.indexOf(keys[i]); if (idx !== -1) return idx; }
  return -1;
}

// ... (Rest of GAS code usually here)
`;

export const SetupModal: React.FC<SetupModalProps> = ({ onClose }) => {
  const [isLocked, setIsLocked] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  
  // Sheets State
  const [url, setUrl] = useState('');
  const [urlSource, setUrlSource] = useState<'MANUAL' | 'ENV'>('MANUAL');
  
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
      // Load existing config
      const currentUrl = sheetService.getUrl() || '';
      setUrl(currentUrl);
      setIsDemo(sheetService.isDemoMode());

      // Determine Source
      const envUrl = process.env.REACT_APP_BACKEND_URL;
      const localUrl = localStorage.getItem('hanzi_master_backend_url_v2');
      
      if (envUrl && currentUrl === envUrl && !localUrl) {
          setUrlSource('ENV');
      } else {
          setUrlSource('MANUAL');
      }
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '4465') {
        setIsLocked(false);
    } else {
        setPinError('Incorrect PIN');
        setPin('');
    }
  };

  const handleSave = () => {
      // 1. Save Sheets Config
      if (url) {
          if (!url.includes('script.google.com')) {
              setStatus('error'); setStatusMsg('Invalid Google Script URL'); return;
          }
          sheetService.saveUrl(url);
          setUrlSource('MANUAL'); // If saved manually, it's no longer just ENV
      }
      
      // Ensure demo mode is off if saving a URL
      sheetService.setDemoMode(false);
      setIsDemo(false);

      setStatus('saved');
      setStatusMsg('Configuration Saved!');
  };
  
  const handleEnableDemo = () => {
      sheetService.setDemoMode(true);
      setIsDemo(true);
      setStatus('success');
      setStatusMsg('Demo Mode Enabled! (No backend needed)');
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setStatus('idle');
    try {
        // Pass current state to checkConnection to allow testing before saving
        const result = await sheetService.checkConnection({ sheetUrl: url });

        if (result.success) {
            setStatus('success');
            setStatusMsg(result.message || 'Connected!');
        } else {
            setStatus('error');
            setStatusMsg(result.message || 'Connection failed');
        }
    } catch (e: any) {
        setStatus('error');
        setStatusMsg(e.message);
    } finally {
        setIsTesting(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    alert('Code copied! Create a NEW deployment in Apps Script.');
  };

  if (isLocked) {
      return (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
             <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-200">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🔒</div>
                <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Admin Access</h2>
                <p className="text-slate-500 font-bold text-sm mb-6">Enter PIN to configure backend.</p>
                <form onSubmit={handleUnlock} className="space-y-4">
                    <input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => { setPin(e.target.value); setPinError(''); }} className="w-full px-4 py-4 rounded-xl border-2 border-slate-200 text-center font-extrabold text-2xl tracking-[0.5em] outline-none focus:border-indigo-400 focus:bg-indigo-50 transition-colors" placeholder="••••" maxLength={4} />
                    {pinError && <div className="text-rose-500 font-bold text-sm bg-rose-50 py-2 rounded-lg">{pinError}</div>}
                    <div className="grid grid-cols-2 gap-3 mt-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Unlock</Button></div>
                </form>
             </div>
         </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
           <div>
             <h2 className="text-xl font-extrabold text-slate-800">🛠️ Backend Setup</h2>
             <p className="text-sm text-slate-500 font-bold">Configure Google Sheets Database</p>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><span className="text-2xl">×</span></button>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden p-6 overflow-y-auto">
            <div className="space-y-8">
                {/* Demo Mode Option */}
                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-indigo-900 text-lg">Having Connection Issues?</h3>
                        <p className="text-sm text-indigo-700 mt-1">
                            Environments like AI Studio or StackBlitz often block Google Script connections. 
                            Enable <strong>Demo Mode</strong> to mock the backend and use the app immediately.
                        </p>
                    </div>
                    <Button onClick={handleEnableDemo} variant={isDemo ? "primary" : "secondary"}>
                        {isDemo ? "✅ Demo Active" : "Enable Demo Mode"}
                    </Button>
                </div>

                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase">OR Connect Real Backend</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                </div>

                {/* Standard Sheets Config */}
                <div className={`space-y-4 transition-opacity ${isDemo ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex items-center justify-between">
                         <h3 className="font-bold text-slate-700">1. Google Apps Script Code</h3>
                         <button onClick={copyCode} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-bold border border-indigo-100 hover:bg-indigo-100">
                             📋 Copy v3.5 Code
                         </button>
                    </div>

                    <div className="relative">
                        <textarea readOnly className="w-full h-24 p-4 bg-slate-800 text-emerald-400 font-mono text-xs rounded-xl resize-none" value={APPS_SCRIPT_CODE} />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-slate-700">2. Web App URL</h3>
                            {urlSource === 'ENV' && (
                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 px-2 py-1 rounded border border-emerald-200">
                                    Loaded from Environment Variable
                                </span>
                            )}
                        </div>
                        <input 
                            type="text" 
                            value={url} 
                            onChange={(e) => { setUrl(e.target.value); setUrlSource('MANUAL'); }} 
                            placeholder="https://script.google.com/macros/s/..../exec" 
                            className={`w-full px-5 py-3 rounded-xl border-2 outline-none font-mono text-sm transition-colors ${urlSource === 'ENV' ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800' : 'border-slate-200 focus:border-indigo-500'}`}
                        />
                    </div>
                </div>
            </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-4">
            {status !== 'idle' && (
                <div className={`text-sm px-4 py-3 rounded-xl font-bold flex justify-between items-center ${status === 'success' ? 'bg-emerald-100 text-emerald-700' : status === 'saved' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
                    <span>{statusMsg}</span>
                </div>
            )}
            <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={onClose}>Close</Button>
                <Button variant="secondary" onClick={handleSave} disabled={isDemo}>Save Config</Button>
                <Button onClick={handleTestConnection} isLoading={isTesting} disabled={isDemo}>Test Connection</Button>
            </div>
        </div>
      </div>
    </div>
  );
};
