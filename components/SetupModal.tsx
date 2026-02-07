
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import React, { useState } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';

interface SetupModalProps {
  onClose: () => void;
}

const APPS_SCRIPT_CODE = `
// CONFIGURATION
const VERSION = '020226-v7'; // Updated Version
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
    studentSheet.appendRow(['ID', 'Name', 'JoinedAt', 'LastLogin', 'Password', 'Script']);
    studentSheet.setFrozenRows(1);
  } else {
    const headers = studentSheet.getRange(1, 1, 1, studentSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('Password') === -1) studentSheet.getRange(1, headers.length + 1).setValue('Password');
    const updatedHeaders = studentSheet.getRange(1, 1, 1, studentSheet.getLastColumn()).getValues()[0];
    if (updatedHeaders.indexOf('Script') === -1) studentSheet.getRange(1, updatedHeaders.length + 1).setValue('Script');
  }

  let assignSheet = ss.getSheetByName('Assignments');
  if (!assignSheet) {
    assignSheet = ss.insertSheet('Assignments');
    assignSheet.appendRow(['ID', 'Title', 'Description', 'Characters', 'StartDate', 'EndDate', 'Type']);
    assignSheet.setFrozenRows(1);
  } else {
     const headers = assignSheet.getRange(1, 1, 1, assignSheet.getLastColumn()).getValues()[0];
     if (headers.indexOf('StartDate') === -1) {
        assignSheet.getRange(1, headers.length + 1).setValue('StartDate');
        assignSheet.getRange(1, headers.length + 2).setValue('EndDate');
     }
     const updatedHeaders = assignSheet.getRange(1, 1, 1, assignSheet.getLastColumn()).getValues()[0];
     const typeIndex = findColumnIndex(updatedHeaders, ['type', 'assignment type']);
     if (typeIndex === -1) assignSheet.getRange(1, updatedHeaders.length + 1).setValue('Type');
  }

  let progressSheet = ss.getSheetByName('Progress');
  if (!progressSheet) {
    progressSheet = ss.insertSheet('Progress');
    progressSheet.appendRow(['ID', 'StudentName', 'Character', 'Score', 'Details', 'Timestamp', 'Date', 'Type']);
    progressSheet.setFrozenRows(1);
  } else {
    const headers = progressSheet.getRange(1, 1, 1, progressSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('Type') === -1) progressSheet.getRange(1, headers.length + 1).setValue('Type');
  }

  let saSheet = ss.getSheetByName('StudentAssignments');
  if (!saSheet) { saSheet = ss.insertSheet('StudentAssignments'); saSheet.appendRow(['StudentID', 'AssignmentID', 'Status', 'Timestamp']); saSheet.setFrozenRows(1); }

  let logSheet = ss.getSheetByName('LoginLogs');
  if (!logSheet) {
    logSheet = ss.insertSheet('LoginLogs');
    logSheet.appendRow(['Timestamp', 'StudentID', 'Name', 'Action', 'InputPassword']);
    logSheet.setFrozenRows(1);
  }

  let fbSheet = ss.getSheetByName('Feedback');
  if (!fbSheet) { 
    fbSheet = ss.insertSheet('Feedback'); 
    fbSheet.appendRow(['Timestamp', 'Name', 'Email', 'Message']); 
    fbSheet.setFrozenRows(1); 
  } else {
    const headers = fbSheet.getRange(1, 1, 1, fbSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('Email') === -1) fbSheet.getRange(1, headers.length + 1).setValue('Email');
  }
  
  return ss.getName();
}

function findColumnIndex(headers, keys) {
  const lowerHeaders = headers.map(h => String(h).trim().toLowerCase());
  for (var i = 0; i < keys.length; i++) { var idx = lowerHeaders.indexOf(keys[i]); if (idx !== -1) return idx; }
  for (var i = 0; i < keys.length; i++) { for (var h = 0; h < lowerHeaders.length; h++) { if (lowerHeaders[h].indexOf(keys[i]) > -1) return h; } }
  return -1;
}

function doGet(e) {
  if (!e || !e.parameter) return ContentService.createTextOutput("Script running. " + VERSION);
  const params = e.parameter; const action = params.action;
  try {
      if (action === 'health') return response({status: 'success', version: VERSION});
      else if (action === 'getAssignments') return getAssignments();
      else if (action === 'getHistory') return getHistory(params.studentName);
      else if (action === 'getAssignmentStatuses') return getAssignmentStatuses(params.studentId);
      else if (action === 'getAllStudentProgress') return getAllStudentProgress();
      else if (action === 'getLoginLogs') return getLoginLogs();
      return response({status: 'error', message: 'Invalid action'});
  } catch (err) { return response({status: 'error', message: err.toString()}); }
}

function doPost(e) {
  if (!e || !e.postData) return response({status: 'error', message: 'No data'});
  // Use LockService to prevent race conditions during writes
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Wait up to 10 seconds for other users
    const data = JSON.parse(e.postData.contents); const action = data.action;
    
    if (action === 'login') return handleLogin(data.payload);
    else if (action === 'saveRecord') return saveRecord(data.payload);
    else if (action === 'createAssignment') return createAssignment(data.payload);
    else if (action === 'editAssignment') return editAssignment(data.payload);
    else if (action === 'deleteAssignment') return deleteAssignment(data.payload);
    else if (action === 'updateAssignmentStatus') return updateAssignmentStatus(data.payload);
    else if (action === 'seed') return seedData();
    else if (action === 'submitFeedback') return submitFeedback(data.payload);
    
    return response({status: 'error', message: 'Invalid action: ' + action});
  } catch (error) { 
      return response({status: 'error', message: 'Server Busy: ' + error.toString()}); 
  } finally {
      lock.releaseLock();
  }
}

function seedData() {
  try { setup(); } catch(e) { return response({ status: 'error', message: 'Setup failed: ' + e.toString() }); }
  const ss = getSpreadsheet();
  const assignSheet = ss.getSheetByName('Assignments');
  if (assignSheet.getLastRow() <= 1) {
    const today = new Date().toISOString().split('T')[0];
    assignSheet.appendRow(['w-1', 'Demo Writing', 'Practice writing', '一,二,三', today, today, 'WRITING']);
    assignSheet.appendRow(['w-2', 'Demo Pinyin', 'Practice tones', '好,吗', today, today, 'PINYIN']);
  }
  return response({ status: 'success', message: 'Data generated.' });
}

function getAssignments() {
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ lessons: [] });
  const data = sheet.getDataRange().getValues();
  if (data.length < 1) return response({ lessons: [] });
  const headers = data[0];
  const typeIndex = findColumnIndex(headers, ['type', 'assignment type']);
  const lessons = [];
  for (var i = 1; i < data.length; i++) {
    const row = data[i]; if (!row[0]) continue;
    let rawType = '';
    if (typeIndex > -1 && row.length > typeIndex) {
        rawType = String(row[typeIndex]).toUpperCase().trim();
    }
    let type = 'WRITING'; 
    if (rawType.indexOf('PIN') > -1) type = 'PINYIN';
    // Accepts FILL, FILL_IN_BLANK, SENTENCE, SENTENCE_BUILDER
    else if (rawType.indexOf('FILL') > -1 || rawType.indexOf('SENTENCE') > -1) type = 'FILL_IN_BLANKS';
    else if (rawType.length > 0) type = 'WRITING'; 
    
    lessons.push({
      id: row[0], title: row[1], description: row[2],
      characters: row[3] ? String(row[3]).split(/[,，]/).map(c => c.trim()).filter(c => c) : [],
      startDate: formatDate(row[4]), endDate: formatDate(row[5]), type: type
    });
  }
  return response({ lessons: lessons.reverse() });
}

function formatDate(dateObj) {
  if (!dateObj) return "";
  if (typeof dateObj === 'string') return dateObj;
  try { return Utilities.formatDate(new Date(dateObj), Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch (e) { return ""; }
}

function getAssignmentStatuses(studentId) {
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('StudentAssignments');
  if (!sheet) return response({ statuses: [] });
  const rows = sheet.getDataRange().getValues(); const statuses = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(studentId)) statuses.push({ assignmentId: rows[i][1], status: rows[i][2] });
  }
  return response({ statuses: statuses });
}

function updateAssignmentStatus(payload) {
  const ss = getSpreadsheet(); let sheet = ss.getSheetByName('StudentAssignments');
  if (!sheet) { setup(); sheet = ss.getSheetByName('StudentAssignments'); }
  const data = sheet.getDataRange().getValues();
  const timestamp = new Date().toISOString(); let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
     if (String(data[i][0]) === String(payload.studentId) && String(data[i][1]) === String(payload.assignmentId)) { foundRow = i + 1; break; }
  }
  if (foundRow > 0) { sheet.getRange(foundRow, 3).setValue(payload.status); sheet.getRange(foundRow, 4).setValue(timestamp); } 
  else { sheet.appendRow([payload.studentId, payload.assignmentId, payload.status, timestamp]); }
  return response({ status: 'success' });
}

function createAssignment(payload) {
  const ss = getSpreadsheet(); let sheet = ss.getSheetByName('Assignments');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Assignments'); }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let typeIndex = findColumnIndex(headers, ['type', 'assignment type']);
  if (typeIndex === -1) { const nextCol = headers.length + 1; sheet.getRange(1, nextCol).setValue('Type'); typeIndex = nextCol - 1; }
  const colMap = {}; headers.forEach((h, i) => { colMap[String(h).trim().toLowerCase()] = i; });
  const maxIndex = Math.max(typeIndex, ...Object.values(colMap));
  const row = new Array(maxIndex + 1).fill("");
  const setVal = (key, val) => { if (key in colMap) row[colMap[key]] = val; };
  setVal('id', payload.id); setVal('title', payload.title); setVal('description', payload.description);
  setVal('characters', payload.characters.join(',')); setVal('startdate', payload.startDate || ""); setVal('enddate', payload.endDate || "");
  
  let typeVal = 'WRITING'; 
  if (payload.type) {
      const t = payload.type.toUpperCase();
      if (t === 'PINYIN') typeVal = 'PINYIN';
      else if (t === 'FILL_IN_BLANKS') typeVal = 'SENTENCE_BUILDER'; // Save as SENTENCE_BUILDER
  }
  row[typeIndex] = typeVal;
  sheet.appendRow(row);
  return response({ status: 'success' });
}

function editAssignment(payload) {
  const ss = getSpreadsheet(); let sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ status: 'error', message: 'Sheet not found' });
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colMap = {}; 
  headers.forEach((h, i) => { colMap[String(h).trim().toLowerCase()] = i + 1; }); 
  let rowIndex = -1;
  for(let i=1; i<data.length; i++) {
      if(String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) return response({ status: 'error', message: 'Assignment ID not found' });
  const setCell = (key, val) => { if (key in colMap) sheet.getRange(rowIndex, colMap[key]).setValue(val); };
  setCell('title', payload.title);
  setCell('description', payload.description);
  setCell('characters', payload.characters.join(','));
  setCell('startdate', payload.startDate || "");
  setCell('enddate', payload.endDate || "");
  let typeVal = 'WRITING'; 
  if (payload.type) {
      const t = payload.type.toUpperCase();
      if (t === 'PINYIN') typeVal = 'PINYIN';
      else if (t === 'FILL_IN_BLANKS') typeVal = 'SENTENCE_BUILDER'; // Save as SENTENCE_BUILDER
  }
  let typeIndex = findColumnIndex(headers, ['type', 'assignment type']);
  if (typeIndex > -1) { sheet.getRange(rowIndex, typeIndex + 1).setValue(typeVal); }
  return response({ status: 'success' });
}

function deleteAssignment(payload) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ status: 'error', message: 'Sheet not found' });
  
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for(let i=1; i<data.length; i++) {
      if(String(data[i][0]) === String(payload.id)) {
          rowIndex = i + 1;
          break;
      }
  }
  
  if (rowIndex > -1) {
      sheet.deleteRow(rowIndex);
      return response({ status: 'success' });
  }
  return response({ status: 'error', message: 'ID not found' });
}

function getHistory(studentName) {
  if (!studentName) return response({ records: [] });
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('Progress');
  if (!sheet) return response({ records: [] });
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const typeIndex = findColumnIndex(headers, ['type']);
  const detailsIndex = findColumnIndex(headers, ['details']); const feedbackIndex = findColumnIndex(headers, ['feedback']);
  const msgColIndex = detailsIndex > -1 ? detailsIndex : feedbackIndex;
  const records = [];
  for (let i = 1; i < data.length; i++) {
     const row = data[i];
     if (row[1] === studentName) {
         let type = 'WRITING';
         if (typeIndex > -1 && row[typeIndex]) { 
            const raw = String(row[typeIndex]).toUpperCase(); 
            if (raw.includes('PIN')) type = 'PINYIN'; 
            else if (raw.includes('FILL') || raw.includes('SENTENCE')) type = 'FILL_IN_BLANKS';
         }
         records.push({ id: row[0], character: row[2], score: Number(row[3]), details: msgColIndex > -1 ? row[msgColIndex] : "", timestamp: Number(row[5]), type: type });
     }
  }
  return response({ records: records });
}

function getAllStudentProgress() {
  const ss = getSpreadsheet(); const studentSheet = ss.getSheetByName('Students');
  const progressSheet = ss.getSheetByName('Progress'); const assignmentSheet = ss.getSheetByName('StudentAssignments');
  const assignDefSheet = ss.getSheetByName('Assignments');
  if (!studentSheet) return response({ students: [] });
  const studentsData = studentSheet.getDataRange().getValues(); const headers = studentsData.shift(); 
  const scriptIndex = headers.indexOf('Script'); const students = {}; 
  studentsData.forEach(row => {
    const id = String(row[0]);
    students[id] = { 
        id: id, 
        name: row[1], 
        assignmentsCompleted: 0, 
        assignmentsInProgress: 0, 
        completedWriting: 0, 
        completedPinyin: 0, 
        completedFillBlank: 0, 
        totalPracticed: 0, 
        rawScores: [], 
        averageScore: 0, 
        lastActive: row[3], 
        script: scriptIndex > -1 ? row[scriptIndex] : 'Simplified' 
    };
  });
  const assignmentTypes = {};
  if (assignDefSheet) {
      const aData = assignDefSheet.getDataRange().getValues();
      if (aData.length > 0) {
          const aHeaders = aData[0]; const tIdx = findColumnIndex(aHeaders, ['type', 'assignment type']);
          for(let i=1; i<aData.length; i++) {
             const r = aData[i];
             if (r[0]) {
                 let t = 'WRITING'; if (tIdx > -1 && r[tIdx]) { 
                    const raw = String(r[tIdx]).toUpperCase(); 
                    if (raw.includes('PIN')) t = 'PINYIN'; 
                    else if (raw.includes('FILL') || raw.includes('SENTENCE')) t = 'FILL_IN_BLANKS';
                 }
                 assignmentTypes[String(r[0])] = t;
             }
          }
      }
  }
  if (assignmentSheet) {
    const assignData = assignmentSheet.getDataRange().getValues();
    for(let i=1; i<assignData.length; i++) {
      const row = assignData[i]; const sId = String(row[0]); const aId = String(row[1]); const status = row[2];
      if (students[sId]) {
         if (status === 'COMPLETED') {
            students[sId].assignmentsCompleted += 1; 
            const type = assignmentTypes[aId] || 'WRITING';
            if (type === 'WRITING') students[sId].completedWriting += 1; 
            else if (type === 'PINYIN') students[sId].completedPinyin += 1; 
            else if (type === 'FILL_IN_BLANKS') students[sId].completedFillBlank += 1;
         } else if (status === 'IN_PROGRESS') {
             students[sId].assignmentsInProgress += 1;
         }
      }
    }
  }
  if (progressSheet) {
     const progData = progressSheet.getDataRange().getValues(); const nameToId = {};
     Object.values(students).forEach(s => { nameToId[s.name] = s.id });
     for(let i=1; i<progData.length; i++) {
        const row = progData[i]; const sId = nameToId[row[1]]; if (sId && students[sId]) { students[sId].totalPracticed += 1; students[sId].rawScores.push(Number(row[3])); }
     }
  }
  const result = Object.values(students).map(s => {
    const total = s.rawScores.reduce((a, b) => a + b, 0); s.averageScore = s.rawScores.length > 0 ? Math.round(total / s.rawScores.length) : 0; delete s.rawScores; return s;
  });
  return response({ students: result });
}

function getLoginLogs() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('LoginLogs');
  if (!sheet) return response({ logs: [] });
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return response({ logs: [] });
  
  // Fetch last 100 rows max
  const startRow = Math.max(2, lastRow - 99);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 4).getValues();
  
  // Map and reverse (newest first)
  const logs = data.reverse().map(row => ({
     timestamp: row[0],
     studentId: row[1],
     name: row[2],
     action: row[3]
  }));
  return response({ logs: logs });
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
  let storedPass = "";

  // 1. Find User by Name (Case Insensitive)
  for (let i = 1; i < data.length; i++) { 
    if (String(data[i][1]).trim().toLowerCase() == inputName.toLowerCase()) { 
      foundRow = i + 1; 
      existingId = String(data[i][0]); 
      correctName = String(data[i][1]).trim(); 
      storedPass = String(data[i][4]); // Password column index 4
      break; 
    } 
  }
  
  const timestamp = new Date().toISOString();
  
  if (foundRow > 0) { 
      // 2. Enforce Password Check if user exists
      if (storedPass && storedPass != inputPass) {
          return response({ status: 'error', message: 'Incorrect Password' });
      }

      // 3. Update Timestamp
      sheet.getRange(foundRow, 4).setValue(timestamp); 
      
      // 4. Update Script Preference
      let scriptColIndex = headers.indexOf('Script') + 1;
      if (scriptColIndex === 0) { 
          // Attempt to find or create if missing from header (unlikely given setup())
          const lastCol = sheet.getLastColumn(); 
          sheet.getRange(1, lastCol + 1).setValue('Script'); 
          scriptColIndex = lastCol + 1; 
      }
      if (scriptColIndex > 0) {
          sheet.getRange(foundRow, scriptColIndex).setValue(scriptPref); 
      }

      // 5. Log Success
      let logSheet = ss.getSheetByName('LoginLogs');
      if (!logSheet) { setup(); logSheet = ss.getSheetByName('LoginLogs'); }
      if (logSheet) {
          logSheet.appendRow([new Date(), existingId, correctName, 'Login', '']);
      }

      return response({ status: 'success', student: { ...student, id: existingId, name: correctName, scriptPreference: scriptPref } });
  } else { 
      // 6. User Not Found - Reject Registration
      return response({ status: 'error', message: 'User not found. Please ask your teacher to create an account.' });
  }
}

function saveRecord(payload) {
  const ss = getSpreadsheet(); let sheet = ss.getSheetByName('Progress');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Progress'); }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let typeIndex = findColumnIndex(headers, ['type']);
  if (typeIndex === -1) { const nextCol = headers.length + 1; sheet.getRange(1, nextCol).setValue('Type'); typeIndex = nextCol - 1; }
  const row = new Array(typeIndex + 1).fill(""); 
  row[0] = payload.id; 
  row[1] = payload.studentName; 
  row[2] = payload.character; 
  row[3] = payload.score; 
  row[4] = payload.details; 
  row[5] = payload.timestamp; 
  row[6] = new Date().toISOString(); 
  
  let typeVal = 'WRITING';
  if (payload.type === 'PINYIN') typeVal = 'PINYIN';
  else if (payload.type === 'FILL_IN_BLANKS') typeVal = 'SENTENCE_BUILDER'; // Save as SENTENCE_BUILDER
  
  row[typeIndex] = typeVal;
  sheet.appendRow(row);
  return response({ status: 'success' });
}
function submitFeedback(payload) {
  const ss = getSpreadsheet(); 
  let sheet = ss.getSheetByName('Feedback');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Feedback'); }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let emailIndex = findColumnIndex(headers, ['email']);
  if (emailIndex === -1) { const nextCol = headers.length + 1; sheet.getRange(1, nextCol).setValue('Email'); emailIndex = nextCol - 1; }
  const row = []; for(let i=0; i<= Math.max(emailIndex, headers.length - 1); i++) row.push("");
  const tsIndex = findColumnIndex(headers, ['timestamp']); const nameIndex = findColumnIndex(headers, ['name']); const msgIndex = findColumnIndex(headers, ['message']);
  if (tsIndex > -1) row[tsIndex] = new Date().toISOString(); if (nameIndex > -1) row[nameIndex] = payload.name; if (msgIndex > -1) row[msgIndex] = payload.message; if (emailIndex > -1) row[emailIndex] = payload.email || "";
  sheet.appendRow(row);
  return response({ status: 'success' });
}
function response(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
`;

export const SetupModal: React.FC<SetupModalProps> = ({ onClose }) => {
  const [isLocked, setIsLocked] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [url, setUrl] = useState(sheetService.getUrl() || '');
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '4465') {
        setIsLocked(false);
    } else {
        setPinError('Incorrect PIN');
        setPin('');
    }
  };

  // STEP 1: Just Save the URL
  const handleSaveOnly = () => {
    if (!url || !url.trim()) {
       setStatus('error'); setStatusMsg('URL cannot be empty'); return;
    }
    const cleanUrl = url.trim();
    if (!cleanUrl.includes('script.google.com')) {
       setStatus('error'); setStatusMsg('Invalid URL (must contain script.google.com).'); return;
    }

    sheetService.saveUrl(cleanUrl);
    setStatus('saved');
    setStatusMsg('URL Saved locally! Now click Test Connection.');
  };

  // STEP 2: Test Connection
  const handleTestConnection = async () => {
    const currentUrl = sheetService.getUrl();
    if (!currentUrl) {
        setStatus('error'); setStatusMsg('Please save a URL first.'); return;
    }

    setIsTesting(true);
    setStatus('idle');
    
    try {
        const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Connection check timed out.")), 8000);
        });

        // Use the new checkConnection method
        const result: any = await Promise.race([
            sheetService.checkConnection(),
            timeout
        ]);

        if (result.success) {
            setStatus('success');
            setStatusMsg(result.message || 'Connected & Ready!');
            setTimeout(() => { onClose(); }, 1500);
        } else {
            setStatus('error');
            setStatusMsg(result.message || 'Connection failed');
        }
    } catch (e: any) {
        setStatus('error');
        setStatusMsg(e.message || "Connection Error");
    } finally {
        setIsTesting(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    alert('Code copied!');
  };

  if (isLocked) {
      return (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
             <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-200">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🔒</div>
                <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Admin Access</h2>
                <p className="text-slate-500 font-bold text-sm mb-6">Enter PIN to configure backend.</p>
                
                <form onSubmit={handleUnlock} className="space-y-4">
                    <input 
                        type="password"
                        inputMode="numeric" 
                        autoFocus
                        value={pin}
                        onChange={(e) => { setPin(e.target.value); setPinError(''); }}
                        className="w-full px-4 py-4 rounded-xl border-2 border-slate-200 text-center font-extrabold text-2xl tracking-[0.5em] outline-none focus:border-indigo-400 focus:bg-indigo-50 transition-colors"
                        placeholder="••••"
                        maxLength={4}
                    />
                    {pinError && <div className="text-rose-500 font-bold text-sm bg-rose-50 py-2 rounded-lg">{pinError}</div>}
                    
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit">Unlock</Button>
                    </div>
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
             <h2 className="text-xl font-extrabold text-slate-800">🛠️ App Setup (v020226)</h2>
             <p className="text-sm text-slate-500 font-bold">Connect your Google Sheet</p>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600" type="button">
             <span className="text-2xl">×</span>
           </button>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 overflow-y-auto flex-1 space-y-8">
                <section>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center border border-indigo-200">1</div>
                        <h3 className="font-bold text-slate-800">Google Apps Script</h3>
                    </div>
                    <div className="pl-11 space-y-4">
                        <p className="text-sm text-slate-600">
                            Copy the new code below (v020226-v7). <br/>
                            <strong>Important:</strong> You must create a new deployment after pasting this code.
                        </p>
                        <div className="relative">
                            <textarea 
                                readOnly 
                                className="w-full h-32 p-4 bg-slate-800 text-emerald-400 font-mono text-xs rounded-xl resize-none"
                                value={APPS_SCRIPT_CODE}
                            />
                            <button 
                                onClick={copyCode}
                                type="button"
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
                        <div className="flex gap-2">
                             <input 
                                type="text" 
                                value={url}
                                onChange={(e) => {
                                    setUrl(e.target.value);
                                    if (status !== 'saved') setStatus('idle');
                                }}
                                placeholder="Paste Web App URL here..."
                                className="flex-1 px-5 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-mono text-sm"
                                autoComplete="off"
                            />
                            <Button onClick={handleSaveOnly} type="button" variant={status === 'saved' ? 'secondary' : 'primary'}>
                                {status === 'saved' ? 'Saved' : 'Save URL'}
                            </Button>
                        </div>
                        <p className="text-xs text-slate-400 mt-2 font-bold ml-1">Step 1: Save the URL. Step 2: Test Connection.</p>
                    </div>
                </section>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-4">
                {status !== 'idle' && (
                    <div className={`text-sm px-4 py-3 rounded-xl font-bold flex justify-between items-center ${
                        status === 'success' ? 'bg-emerald-100 text-emerald-700' : 
                        status === 'saved' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-rose-100 text-rose-700'
                    }`}>
                        <span>{statusMsg}</span>
                    </div>
                )}
                
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose} type="button">Close</Button>
                    
                    {/* Test Connection - Enabled only if saved or URL present */}
                    <Button 
                        onClick={handleTestConnection} 
                        type="button" 
                        isLoading={isTesting}
                        disabled={!url || status === 'error' && !url} // allow retry if error
                        className={status === 'saved' ? 'animate-pulse' : ''}
                    >
                        Test Connection
                    </Button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
