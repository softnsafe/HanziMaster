import React, { useState } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';

interface SetupModalProps {
  onClose: () => void;
}

const APPS_SCRIPT_CODE = `
// CONFIGURATION
const VERSION = 'v1.11'; 
// Leave empty to use the sheet where this script is bound (Recommended)
const SHEET_ID = ''; 

/**
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code completely, replacing any old code.
 * 4. Deploy > New Deployment.
 *    - Select type: "Web App"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (CRITICAL STEP)
 * 5. Copy the URL and paste it into the HanziMaster app setup.
 */

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
  throw new Error("Could not find the Spreadsheet. Please ensuring this script is bound to a Google Sheet.");
}

function setup() {
  const ss = getSpreadsheet();
  
  // 1. Setup Students Sheet
  let studentSheet = ss.getSheetByName('Students');
  if (!studentSheet) {
    studentSheet = ss.insertSheet('Students');
    studentSheet.appendRow(['ID', 'Name', 'JoinedAt', 'LastLogin', 'Password', 'Script']);
    studentSheet.setFrozenRows(1);
  } else {
    // Ensure headers exist
    const lastCol = studentSheet.getLastColumn();
    if (lastCol > 0) {
      const headers = studentSheet.getRange(1, 1, 1, lastCol).getValues()[0];
      if (headers.indexOf('Password') === -1) {
        studentSheet.getRange(1, lastCol + 1).setValue('Password');
      }
      // Re-fetch to check for Script after potentially adding Password
      const updatedHeaders = studentSheet.getRange(1, 1, 1, studentSheet.getLastColumn()).getValues()[0];
      if (updatedHeaders.indexOf('Script') === -1) {
        studentSheet.getRange(1, updatedHeaders.length + 1).setValue('Script');
      }
    } else {
       // Sheet exists but is empty
       studentSheet.appendRow(['ID', 'Name', 'JoinedAt', 'LastLogin', 'Password', 'Script']);
    }
  }

  // 2. Setup Assignments Sheet
  let assignSheet = ss.getSheetByName('Assignments');
  if (!assignSheet) {
    assignSheet = ss.insertSheet('Assignments');
    assignSheet.appendRow(['ID', 'Title', 'Description', 'Characters', 'StartDate', 'EndDate']);
    assignSheet.setFrozenRows(1);
  } else {
    const headers = assignSheet.getRange(1, 1, 1, assignSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('StartDate') === -1) {
      assignSheet.getRange(1, headers.length + 1).setValue('StartDate');
      assignSheet.getRange(1, headers.length + 2).setValue('EndDate');
    }
  }

  // 3. Setup Progress Sheet
  let progressSheet = ss.getSheetByName('Progress');
  if (!progressSheet) {
    progressSheet = ss.insertSheet('Progress');
    progressSheet.appendRow(['ID', 'StudentName', 'Character', 'Score', 'Feedback', 'Timestamp', 'Date']);
    progressSheet.setFrozenRows(1);
  }

  // 4. Setup StudentAssignments Sheet (Status Tracking)
  let saSheet = ss.getSheetByName('StudentAssignments');
  if (!saSheet) {
    saSheet = ss.insertSheet('StudentAssignments');
    saSheet.appendRow(['StudentID', 'AssignmentID', 'Status', 'Timestamp']);
    saSheet.setFrozenRows(1);
  }
  
  return ss.getName();
}

function doGet(e) {
  if (!e || !e.parameter) return ContentService.createTextOutput("Script is running. Version: " + VERSION + ". Deploy as Web App (Exec: Me, Access: Anyone).");
  
  const params = e.parameter;
  const action = params.action;

  try {
      if (action === 'getAssignments') {
        return getAssignments();
      } else if (action === 'getHistory') {
        return getHistory(params.studentName);
      } else if (action === 'getAssignmentStatuses') {
        return getAssignmentStatuses(params.studentId);
      } else if (action === 'getAllStudentProgress') {
        return getAllStudentProgress();
      }
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

    if (action === 'login') {
      return handleLogin(data.payload);
    } else if (action === 'saveRecord') {
      return saveRecord(data.payload);
    } else if (action === 'createAssignment') {
      return createAssignment(data.payload);
    } else if (action === 'updateAssignmentStatus') {
      return updateAssignmentStatus(data.payload);
    } else if (action === 'seed') {
      return seedData();
    }

    return response({status: 'error', message: 'Invalid action: ' + action});
  } catch (error) {
    return response({status: 'error', message: error.toString()});
  }
}

// --- LOGIC ---

function seedData() {
  try { setup(); } catch(e) { return response({ status: 'error', message: 'Setup failed: ' + e.toString() }); }

  const ss = getSpreadsheet();
  
  // Seed Students
  const studentSheet = ss.getSheetByName('Students');
  if (studentSheet.getLastRow() <= 1) {
    // ID, Name, Joined, LastLogin, Password, Script
    studentSheet.appendRow(['s-1', 'Alice', new Date().toISOString(), new Date().toISOString(), '1234', 'Simplified']);
    studentSheet.appendRow(['s-2', 'Bob', new Date().toISOString(), new Date().toISOString(), '1234', 'Traditional']);
  }

  // Seed Assignments
  const assignSheet = ss.getSheetByName('Assignments');
  if (assignSheet.getLastRow() <= 1) {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    // YYYY-MM-DD
    const sDate = today.toISOString().split('T')[0];
    const eDate = nextWeek.toISOString().split('T')[0];

    assignSheet.appendRow(['w-1', 'Week 1: Basics', 'Numbers and People', '一,二,三,人,口', sDate, eDate]);
    assignSheet.appendRow(['w-2', 'Week 2: Nature', 'The elements', '山,水,火,木,土', sDate, eDate]);
    assignSheet.appendRow(['w-3', 'Week 3: Animals', 'Common animals', '牛,羊,马,鱼,鸟', sDate, eDate]);
  }

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
    characters: row[3] ? row[3].split(',').map(c => c.trim()) : [],
    startDate: row[4] ? formatDate(row[4]) : '',
    endDate: row[5] ? formatDate(row[5]) : ''
  })).filter(l => l.title);
  return response({ lessons: lessons });
}

function formatDate(dateObj) {
  if (!dateObj) return "";
  if (typeof dateObj === 'string') return dateObj; // Already string
  try {
    return Utilities.formatDate(new Date(dateObj), Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (e) {
    return "";
  }
}

function getAssignmentStatuses(studentId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('StudentAssignments');
  if (!sheet) return response({ statuses: [] });
  
  const rows = sheet.getDataRange().getValues();
  // Skip header
  const statuses = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(studentId)) {
       statuses.push({
         assignmentId: rows[i][1],
         status: rows[i][2]
       });
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
  
  sheet.appendRow([
    payload.id, 
    payload.title, 
    payload.description, 
    payload.characters.join(','),
    payload.startDate || "",
    payload.endDate || ""
  ]);
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
      id: row[0],
      character: row[2],
      score: Number(row[3]),
      feedback: row[4],
      timestamp: Number(row[5])
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
      id: id,
      name: row[1],
      assignmentsCompleted: 0,
      totalPracticed: 0,
      rawScores: [],
      averageScore: 0,
      lastActive: row[3], 
      script: scriptIndex > -1 ? row[scriptIndex] : 'Simplified'
    };
  });

  if (assignmentSheet) {
    const assignData = assignmentSheet.getDataRange().getValues();
    assignData.shift();
    assignData.forEach(row => {
      const sId = String(row[0]);
      const status = row[2];
      if (students[sId] && status === 'COMPLETED') {
        students[sId].assignmentsCompleted += 1;
      }
    });
  }

  if (progressSheet) {
     const progData = progressSheet.getDataRange().getValues();
     progData.shift();
     
     const nameToId = {};
     Object.values(students).forEach(s => { nameToId[s.name] = s.id });

     progData.forEach(row => {
        const sName = row[1];
        const sId = nameToId[sName];
        if (sId && students[sId]) {
            students[sId].totalPracticed += 1;
            students[sId].rawScores.push(Number(row[3]));
            const recordTime = new Date(row[6]).getTime(); 
            const lastActiveTime = new Date(students[sId].lastActive).getTime();
            if (!isNaN(recordTime) && recordTime > lastActiveTime) {
                students[sId].lastActive = row[6];
            }
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
  let storedPassword = "";
  let existingId = "";
  let correctName = inputName; 

  // Fix: Check header for 'Script' dynamically
  let scriptColIndex = headers.indexOf('Script') + 1; // 1-based index
  
  // If column is missing, create it
  if (scriptColIndex === 0) {
      const lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1).setValue('Script');
      scriptColIndex = lastCol + 1;
  }

  // Case-insensitive search
  for (let i = 1; i < data.length; i++) {
    const rowName = String(data[i][1]).trim();
    if (rowName.toLowerCase() == inputName.toLowerCase()) { 
      foundRow = i + 1;
      existingId = String(data[i][0]); // ID is col A
      correctName = rowName; // Use casing from DB
      storedPassword = data[i][4] ? String(data[i][4]) : ""; 
      break;
    }
  }

  const timestamp = new Date().toISOString();

  if (foundRow > 0) {
    if (storedPassword === "" && inputPass !== "") {
       sheet.getRange(foundRow, 5).setValue(inputPass);
    } else if (String(storedPassword) !== String(inputPass)) {
       return response({ status: 'error', message: 'Incorrect Password' });
    }

    // Success login on existing: Update Metadata
    sheet.getRange(foundRow, 4).setValue(timestamp); // Last Login
    if (scriptColIndex > 0) {
        sheet.getRange(foundRow, scriptColIndex).setValue(scriptPref); // Update Script Pref
    }

    return response({ status: 'success', student: { ...student, id: existingId, name: correctName, scriptPreference: scriptPref } });

  } else {
    // AUTO-REGISTER if not found
    const newId = 's-' + new Date().getTime();
    
    // Explicitly set values for the first few columns
    sheet.getRange(sheet.getLastRow() + 1, 1).setValue(newId);
    sheet.getRange(sheet.getLastRow() + 1, 2).setValue(inputName);
    sheet.getRange(sheet.getLastRow() + 1, 3).setValue(timestamp);
    sheet.getRange(sheet.getLastRow() + 1, 4).setValue(timestamp);
    sheet.getRange(sheet.getLastRow() + 1, 5).setValue(inputPass);
    
    // Set script preference
    if (scriptColIndex > 0) {
        sheet.getRange(sheet.getLastRow() + 1, scriptColIndex).setValue(scriptPref);
    }
    
    return response({ status: 'success', student: { ...student, id: newId, name: inputName, scriptPreference: scriptPref } });
  }
}

function saveRecord(payload) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Progress');
  if (!sheet) setup();
  ss.getSheetByName('Progress').appendRow([payload.id, payload.studentName, payload.character, payload.score, payload.feedback, payload.timestamp, new Date().toISOString()]);
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
    
    // Basic validation
    if (!url.includes('script.google.com')) {
        setStatus('error');
        setStatusMsg('Invalid URL. It should contain "script.google.com"');
        setIsSaving(false);
        return;
    }

    sheetService.saveUrl(url);

    if (force) {
        setStatus('success');
        setStatusMsg('Saved (Connection test skipped).');
        setTimeout(() => {
            setIsSaving(false);
            onClose();
        }, 800);
        return;
    }

    try {
        const result = await sheetService.seedSampleData();
        if (result.success) {
            setStatus('success');
            setStatusMsg('Connected! Sample data created.');
            setTimeout(() => {
                setIsSaving(false);
                onClose();
            }, 1500);
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
    alert('Code copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-stone-200 flex justify-between items-center bg-stone-50">
           <div>
             <h2 className="text-xl font-bold text-stone-800">Backend Setup</h2>
             <p className="text-sm text-stone-500">Connect Google Sheets as your database</p>
           </div>
           <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-8">
            
            {/* Step 1 */}
            <section>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold flex items-center justify-center">1</div>
                    <h3 className="font-bold text-stone-800">Deploy Google Apps Script</h3>
                </div>
                <div className="pl-11 space-y-4">
                    <div className="text-sm text-stone-600 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <strong>Troubleshooting Connection Failures:</strong>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>Make sure you selected <strong>"New Deployment"</strong> (not Manage Deployments) if you updated the code.</li>
                            <li><strong>CRITICAL:</strong> "Who has access" must be set to <strong>"Anyone"</strong>. If set to "Myself", it will fail.</li>
                            <li>Copy the "Web App URL" (ends in <code>/exec</code>), NOT the browser URL.</li>
                        </ul>
                    </div>
                    
                    <p className="text-sm text-stone-600">
                        1. Create a new <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-red-600 underline">Google Sheet</a>.<br/>
                        2. Go to <strong>Extensions &gt; Apps Script</strong>.<br/>
                        3. Clear any code and paste the script below.<br/>
                        4. Click <strong>Deploy &gt; New Deployment</strong>.<br/>
                        5. Select type: <strong>Web App</strong>.<br/>
                        6. Set "Who has access" to: <strong>Anyone</strong>.<br/>
                        7. Copy the <strong>Web App URL</strong>.
                    </p>
                    <div className="relative">
                        <textarea 
                            readOnly 
                            className="w-full h-48 p-4 bg-stone-900 text-green-400 font-mono text-xs rounded-lg resize-none"
                            value={APPS_SCRIPT_CODE}
                        />
                        <button 
                            onClick={copyCode}
                            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded text-xs backdrop-blur-sm transition-colors"
                        >
                            Copy Code
                        </button>
                    </div>
                </div>
            </section>

            {/* Step 2 */}
            <section>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold flex items-center justify-center">2</div>
                    <h3 className="font-bold text-stone-800">Connect App</h3>
                </div>
                <div className="pl-11">
                    <label className="block text-sm font-medium text-stone-700 mb-2">Web App URL</label>
                    <input 
                        type="text" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm"
                    />
                </div>
            </section>

        </div>

        <div className="p-6 border-t border-stone-200 bg-stone-50 flex flex-col gap-4">
            
            {status !== 'idle' && (
                 <div className={`text-sm px-3 py-2 rounded break-words flex justify-between items-center ${
                    status === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'
                }`}>
                    <span>{statusMsg}</span>
                    {status === 'error' && (
                        <button 
                            onClick={() => handleSave(true)}
                            className="text-xs underline hover:text-red-900 font-bold ml-2 whitespace-nowrap"
                        >
                            Save Anyway
                        </button>
                    )}
                </div>
            )}

            <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={() => handleSave(false)} isLoading={isSaving}>Save & Connect</Button>
            </div>
        </div>
      </div>
    </div>
  );
};