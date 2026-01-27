import React, { useState } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';

interface SetupModalProps {
  onClose: () => void;
}

const APPS_SCRIPT_CODE = `
// CONFIGURATION
const VERSION = 'v1.14'; 
const SHEET_ID = ''; 

function getSpreadsheet() {
  if (SHEET_ID) {
    try {
      return SpreadsheetApp.openById(SHEET_ID);
    } catch (e) {
      Logger.log("Could not open by ID: " + e.toString());
    }
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {
    Logger.log("Could not open active: " + e.toString());
  }
  throw new Error("Could not find the Spreadsheet.");
}

function setup() {
  const ss = getSpreadsheet();
  
  let studentSheet = ss.getSheetByName('Students');
  if (!studentSheet) {
    studentSheet = ss.insertSheet('Students');
    studentSheet.appendRow(['ID', 'Name', 'JoinedAt', 'LastLogin', 'Password', 'Script']);
    studentSheet.setFrozenRows(1);
  } else {
    const lastCol = studentSheet.getLastColumn();
    if (lastCol > 0) {
      const headers = studentSheet.getRange(1, 1, 1, lastCol).getValues()[0];
      if (headers.indexOf('Password') === -1) studentSheet.getRange(1, lastCol + 1).setValue('Password');
      const updatedHeaders = studentSheet.getRange(1, 1, 1, studentSheet.getLastColumn()).getValues()[0];
      if (updatedHeaders.indexOf('Script') === -1) studentSheet.getRange(1, updatedHeaders.length + 1).setValue('Script');
    }
  }

  let assignSheet = ss.getSheetByName('Assignments');
  if (!assignSheet) {
    assignSheet = ss.insertSheet('Assignments');
    assignSheet.appendRow(['ID', 'Title', 'Description', 'Characters', 'StartDate', 'EndDate']);
    assignSheet.setFrozenRows(1);
  }

  let progressSheet = ss.getSheetByName('Progress');
  if (!progressSheet) {
    progressSheet = ss.insertSheet('Progress');
    progressSheet.appendRow(['ID', 'StudentName', 'Character', 'Score', 'Feedback', 'Timestamp', 'Date']);
    progressSheet.setFrozenRows(1);
  }

  let saSheet = ss.getSheetByName('StudentAssignments');
  if (!saSheet) {
    saSheet = ss.insertSheet('StudentAssignments');
    saSheet.appendRow(['StudentID', 'AssignmentID', 'Status', 'Timestamp']);
    saSheet.setFrozenRows(1);
  }
  
  return ss.getName();
}

function doGet(e) {
  if (!e || !e.parameter) return ContentService.createTextOutput("Script running. v1.14");
  const params = e.parameter;
  const action = params.action;

  try {
      if (action === 'getAssignments') return getAssignments();
      else if (action === 'getHistory') return getHistory(params.studentName);
      else if (action === 'getAssignmentStatuses') return getAssignmentStatuses(params.studentId);
      else if (action === 'getAllStudentProgress') return getAllStudentProgress();
      return response({status: 'error', message: 'Invalid action'});
  } catch (err) {
      return response({status: 'error', message: err.toString()});
  }
}

function doPost(e) {
  if (!e || !e.postData) return response({status: 'error', message: 'No data'});
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    if (action === 'login') return handleLogin(data.payload);
    else if (action === 'saveRecord') return saveRecord(data.payload);
    else if (action === 'createAssignment') return createAssignment(data.payload);
    else if (action === 'updateAssignmentStatus') return updateAssignmentStatus(data.payload);
    else if (action === 'seed') return seedData();
    return response({status: 'error', message: 'Invalid action: ' + action});
  } catch (error) {
    return response({status: 'error', message: error.toString()});
  }
}

// ... (Rest of logic same as v1.12 provided previously) ...
function seedData() {
  try { setup(); } catch(e) { return response({ status: 'error', message: 'Setup failed: ' + e.toString() }); }
  return response({ status: 'success', message: 'Data generated.' });
}
function getAssignments() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ lessons: [] });
  const rows = sheet.getDataRange().getValues();
  rows.shift();
  const lessons = rows.reverse().map(row => ({
    id: row[0],
    title: row[1],
    description: row[2],
    characters: row[3] ? String(row[3]).split(/[,，]/).map(c => c.trim()).filter(c => c) : [],
    startDate: formatDate(row[4]),
    endDate: formatDate(row[5])
  })).filter(l => l.title);
  return response({ lessons: lessons });
}
function formatDate(dateObj) {
  if (!dateObj) return "";
  if (typeof dateObj === 'string') return dateObj;
  try { return Utilities.formatDate(new Date(dateObj), Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch (e) { return ""; }
}
function getAssignmentStatuses(studentId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('StudentAssignments');
  if (!sheet) return response({ statuses: [] });
  const rows = sheet.getDataRange().getValues();
  const statuses = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(studentId)) {
       statuses.push({ assignmentId: rows[i][1], status: rows[i][2] });
    }
  }
  return response({ statuses: statuses });
}
function updateAssignmentStatus(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('StudentAssignments');
  if (!sheet) { setup(); sheet = ss.getSheetByName('StudentAssignments'); }
  const data = sheet.getDataRange().getValues();
  const timestamp = new Date().toISOString();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
     if (String(data[i][0]) === String(payload.studentId) && String(data[i][1]) === String(payload.assignmentId)) {
        foundRow = i + 1;
        break;
     }
  }
  if (foundRow > 0) {
    sheet.getRange(foundRow, 3).setValue(payload.status);
    sheet.getRange(foundRow, 4).setValue(timestamp);
  } else {
    sheet.appendRow([payload.studentId, payload.assignmentId, payload.status, timestamp]);
  }
  return response({ status: 'success' });
}
function createAssignment(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Assignments');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Assignments'); }
  sheet.appendRow([payload.id, payload.title, payload.description, payload.characters.join(','), payload.startDate || "", payload.endDate || ""]);
  return response({ status: 'success' });
}
function getHistory(studentName) {
  if (!studentName) return response({ records: [] });
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Progress');
  if (!sheet) return response({ records: [] });
  const rows = sheet.getDataRange().getValues();
  rows.shift();
  const records = rows.filter(row => row[1] === studentName).map(row => ({
      id: row[0], character: row[2], score: Number(row[3]), feedback: row[4], timestamp: Number(row[5])
  }));
  return response({ records: records });
}
function getAllStudentProgress() {
  const ss = getSpreadsheet();
  const studentSheet = ss.getSheetByName('Students');
  const progressSheet = ss.getSheetByName('Progress');
  const assignmentSheet = ss.getSheetByName('StudentAssignments');
  if (!studentSheet) return response({ students: [] });
  const studentsData = studentSheet.getDataRange().getValues();
  const headers = studentsData.shift(); 
  const scriptIndex = headers.indexOf('Script');
  const students = {}; 
  studentsData.forEach(row => {
    const id = String(row[0]);
    students[id] = {
      id: id, name: row[1], assignmentsCompleted: 0, totalPracticed: 0, rawScores: [], averageScore: 0, lastActive: row[3], 
      script: scriptIndex > -1 ? row[scriptIndex] : 'Simplified'
    };
  });
  if (assignmentSheet) {
    const assignData = assignmentSheet.getDataRange().getValues();
    assignData.shift();
    assignData.forEach(row => {
      const sId = String(row[0]);
      if (students[sId] && row[2] === 'COMPLETED') students[sId].assignmentsCompleted += 1;
    });
  }
  if (progressSheet) {
     const progData = progressSheet.getDataRange().getValues();
     progData.shift();
     const nameToId = {};
     Object.values(students).forEach(s => { nameToId[s.name] = s.id });
     progData.forEach(row => {
        const sId = nameToId[row[1]];
        if (sId && students[sId]) {
            students[sId].totalPracticed += 1;
            students[sId].rawScores.push(Number(row[3]));
        }
     });
  }
  const result = Object.values(students).map(s => {
    const total = s.rawScores.reduce((a, b) => a + b, 0);
    s.averageScore = s.rawScores.length > 0 ? Math.round(total / s.rawScores.length) : 0;
    delete s.rawScores;
    return s;
  });
  return response({ students: result });
}
function handleLogin(student) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Students');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Students'); }
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const inputName = student.name.trim();
  const inputPass = student.password ? student.password.trim() : "";
  const scriptPref = student.scriptPreference || 'Simplified';
  let foundRow = -1;
  let existingId = "";
  let correctName = inputName; 
  let scriptColIndex = headers.indexOf('Script') + 1;
  if (scriptColIndex === 0) {
      const lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1).setValue('Script');
      scriptColIndex = lastCol + 1;
  }
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() == inputName.toLowerCase()) { 
      foundRow = i + 1;
      existingId = String(data[i][0]); 
      correctName = String(data[i][1]).trim();
      break;
    }
  }
  const timestamp = new Date().toISOString();
  if (foundRow > 0) {
    sheet.getRange(foundRow, 4).setValue(timestamp); 
    if (scriptColIndex > 0) sheet.getRange(foundRow, scriptColIndex).setValue(scriptPref);
    return response({ status: 'success', student: { ...student, id: existingId, name: correctName, scriptPreference: scriptPref } });
  } else {
    const newId = 's-' + new Date().getTime();
    // Use appendRow to prevent data fragmentation
    const rowData = [newId, inputName, timestamp, timestamp, inputPass];
    if (scriptColIndex > 0) {
        while(rowData.length < scriptColIndex - 1) rowData.push("");
        rowData[scriptColIndex - 1] = scriptPref;
    }
    sheet.appendRow(rowData);
    return response({ status: 'success', student: { ...student, id: newId, name: inputName, scriptPreference: scriptPref } });
  }
}
function saveRecord(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Progress');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Progress'); }
  sheet.appendRow([payload.id, payload.studentName, payload.character, payload.score, payload.feedback, payload.timestamp, new Date().toISOString()]);
  return response({ status: 'success' });
}
function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
`;

export const SetupModal: React.FC<SetupModalProps> = ({ onClose }) => {
  const [url, setUrl] = useState(sheetService.getUrl());
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  const handleSave = async (force: boolean = false) => {
    setIsSaving(true);
    setStatus('idle');
    
    if (!url.includes('script.google.com')) {
        setStatus('error');
        setStatusMsg('Invalid URL.');
        setIsSaving(false);
        return;
    }
    sheetService.saveUrl(url);

    if (force) {
        setStatus('success');
        setStatusMsg('Saved without testing.');
        setTimeout(() => { setIsSaving(false); onClose(); }, 800);
        return;
    }
    try {
        const result = await sheetService.seedSampleData();
        if (result.success) {
            setStatus('success');
            setStatusMsg('Connected & Ready!');
            setTimeout(() => { setIsSaving(false); onClose(); }, 1500);
        } else {
            setStatus('error');
            setStatusMsg(result.message || 'Connection failed');
            setIsSaving(false);
        }
    } catch (e) {
        setStatus('error');
        setStatusMsg("Unexpected error");
        setIsSaving(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    alert('Code copied!');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
           <div>
             <h2 className="text-xl font-extrabold text-slate-800">🛠️ App Setup</h2>
             <p className="text-sm text-slate-500 font-bold">Connect your Google Sheet</p>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
             <span className="text-2xl">×</span>
           </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-8">
            <section>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center border border-indigo-200">1</div>
                    <h3 className="font-bold text-slate-800">Google Apps Script</h3>
                </div>
                <div className="pl-11 space-y-4">
                     <p className="text-sm text-slate-600">
                        Copy the code below into a new Google Apps Script project (Extensions &gt; Apps Script), then Deploy as Web App (Access: Anyone).
                    </p>
                    <div className="relative">
                        <textarea 
                            readOnly 
                            className="w-full h-32 p-4 bg-slate-800 text-emerald-400 font-mono text-xs rounded-xl resize-none"
                            value={APPS_SCRIPT_CODE}
                        />
                        <button 
                            onClick={copyCode}
                            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                        >
                            Copy Code
                        </button>
                    </div>
                </div>
            </section>

            <section>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center border border-indigo-200">2</div>
                    <h3 className="font-bold text-slate-800">Connect Backend</h3>
                </div>
                <div className="pl-11">
                    <input 
                        type="text" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="Paste Web App URL here..."
                        className="w-full px-5 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-mono text-sm"
                    />
                </div>
            </section>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-4">
            {status !== 'idle' && (
                 <div className={`text-sm px-4 py-3 rounded-xl font-bold flex justify-between items-center ${
                    status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                    <span>{statusMsg}</span>
                    {status === 'error' && (
                        <button onClick={() => handleSave(true)} className="underline ml-2">Save Anyway</button>
                    )}
                </div>
            )}
            <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button onClick={() => handleSave(false)} isLoading={isSaving}>Save & Connect</Button>
            </div>
        </div>
      </div>
    </div>
  );
};