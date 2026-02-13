
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';

interface SetupModalProps {
  onClose: () => void;
}

const APPS_SCRIPT_CODE = `
// -----------------------------------------------------
// HANZI MASTER BACKEND SCRIPT (v3.9)
// Copy ALL of this code into your Google Apps Script
// -----------------------------------------------------

// CONFIGURATION
const VERSION = 'v3.9'; 
const SHEET_ID = ''; // Leave empty to use the bound sheet

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
  } else {
    // Upgrade existing sheet safely
    const lastCol = logSheet.getLastColumn();
    if (lastCol > 0) {
        const headers = logSheet.getRange(1, 1, 1, lastCol).getValues()[0];
        if (headers.indexOf('Device') === -1) {
             logSheet.getRange(1, headers.length + 1).setValue('Device');
        }
    } else {
        // Sheet exists but is empty (user cleared it)
        logSheet.appendRow(['Timestamp', 'StudentID', 'Name', 'Action', 'Device']);
    }
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

// --- HELPER: Save Image to Google Drive ---
function saveImageToDrive(dataUrl, filenamePrefix) {
  try {
    // 1. Parse Data URL
    var contentType = dataUrl.substring(5, dataUrl.indexOf(';'));
    var base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), contentType, filenamePrefix + "_" + Date.now() + ".png");
    
    // 2. Find or Create Folder (Robust Method)
    var props = PropertiesService.getScriptProperties();
    var folderId = props.getProperty('STICKER_FOLDER_ID');
    var folder;

    if (folderId) {
      try {
        folder = DriveApp.getFolderById(folderId);
        if (folder.isTrashed()) folder = null;
      } catch (e) { folder = null; }
    }

    if (!folder) {
      var folderName = "HanziMaster_Stickers";
      var folders = DriveApp.getFoldersByName(folderName);
      while (folders.hasNext()) {
        var f = folders.next();
        if (!f.isTrashed()) { folder = f; break; }
      }
      if (!folder) {
        folder = DriveApp.createFolder(folderName);
        try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
      }
      props.setProperty('STICKER_FOLDER_ID', folder.getId());
    }
    
    // 3. Create File
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    
    // 5. Return Direct Link
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (e) {
    throw new Error("Drive Save Failed: " + e.toString());
  }
}

// --- CRITICAL FUNCTIONS: doGet and doPost ---

function doGet(e) {
  const params = e ? e.parameter : {};
  const action = params.action;
  
  // DEFAULT RESPONSE (Browser Test)
  // This prevents "Invalid action" errors when visiting the URL directly
  if (!action) {
      return ContentService.createTextOutput("✅ HanziMaster Backend " + VERSION + " is ONLINE.\\n\\nIf you see this, the URL is correct! You can now copy it into the App Settings.")
          .setMimeType(ContentService.MimeType.TEXT);
  }

  try {
      if (action === 'health') return response({status: 'success', version: VERSION});
      else if (action === 'getClassStatus') return getClassStatus();
      else if (action === 'getAssignments') return getAssignments();
      else if (action === 'getHistory') return getHistory(params.studentName);
      else if (action === 'getAssignmentStatuses') return getAssignmentStatuses(params.studentId);
      else if (action === 'getAllStudentProgress') return getAllStudentProgress(params.startDate, params.endDate);
      else if (action === 'getLoginLogs') return getLoginLogs();
      else if (action === 'getCalendarEvents') return getCalendarEvents();
      else if (action === 'getStoreItems') return getStoreItems();
      return response({status: 'error', message: 'Invalid action: ' + action});
  } catch (err) { return response({status: 'error', message: err.toString()}); }
}

function doPost(e) {
  if (!e || !e.postData) return response({status: 'error', message: 'No data'});
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 30 seconds wait for concurrency
    const data = JSON.parse(e.postData.contents); const action = data.action;
    
    if (action === 'login') return handleLogin(data.payload);
    else if (action === 'setClassStatus') return setClassStatus(data.payload);
    else if (action === 'saveRecord') return saveRecord(data.payload);
    else if (action === 'createAssignment') return createAssignment(data.payload);
    else if (action === 'editAssignment') return editAssignment(data.payload);
    else if (action === 'deleteAssignment') return deleteAssignment(data.payload);
    else if (action === 'updateAssignmentStatus') return updateAssignmentStatus(data.payload);
    else if (action === 'submitFeedback') return submitFeedback(data.payload);
    else if (action === 'saveCalendarEvent') return saveCalendarEvent(data.payload);
    else if (action === 'deleteCalendarEvent') return deleteCalendarEvent(data.payload);
    else if (action === 'updatePoints') return updatePoints(data.payload);
    else if (action === 'purchaseSticker') return purchaseSticker(data.payload);
    else if (action === 'saveCustomSticker') return saveCustomSticker(data.payload);
    else if (action === 'adminGivePoints') return adminGivePoints(data.payload);
    else if (action === 'adminGiveSticker') return adminGiveSticker(data.payload);
    else if (action === 'updatePermission') return updatePermission(data.payload);
    else if (action === 'testDriveSave') return testDriveSave(data.payload);
    else if (action === 'addStoreItem') return addStoreItem(data.payload);
    else if (action === 'deleteStoreItem') return deleteStoreItem(data.payload);
    
    return response({status: 'error', message: 'Invalid action: ' + action});
  } catch (error) { 
      return response({status: 'error', message: 'Server Error: ' + error.toString()}); 
  } finally {
      lock.releaseLock();
  }
}

// --- HELPER FUNCTIONS ---

function response(data) { 
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); 
}

function getClassStatus() {
    const props = PropertiesService.getScriptProperties();
    const status = props.getProperty('CLASS_STATUS') || 'OPEN';
    return response({ status: 'success', classStatus: status });
}

function setClassStatus(payload) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('CLASS_STATUS', payload.isOpen ? 'OPEN' : 'CLOSED');
    return response({ status: 'success', classStatus: payload.isOpen ? 'OPEN' : 'CLOSED' });
}

function getStoreItems() {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Store');
    if (!sheet) return response({ items: [] });
    
    const data = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
        if (data[i][0]) { // Check ID
            items.push({
                id: String(data[i][0]),
                name: String(data[i][1]),
                imageUrl: String(data[i][2]),
                cost: Number(data[i][3]) || 100,
                active: data[i][4] === true || data[i][4] === 'TRUE' || data[i][4] === ''
            });
        }
    }
    return response({ items: items });
}

function addStoreItem(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Store');
    if (!sheet) { setup(); sheet = ss.getSheetByName('Store'); }
    
    const id = payload.id || 'store-' + Date.now();
    sheet.appendRow([
        id,
        payload.name,
        payload.imageUrl,
        payload.cost,
        true // Active
    ]);
    return response({ status: 'success' });
}

function deleteStoreItem(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Store');
    if (!sheet) return response({ status: 'error', message: 'No store sheet' });
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(payload.id)) {
            sheet.deleteRow(i + 1);
            return response({ status: 'success' });
        }
    }
    return response({ status: 'error', message: 'Item not found' });
}

function testDriveSave(payload) {
    try {
        const testUrl = saveImageToDrive(payload.dataUrl, "Test_Connection");
        return response({ status: 'success', url: testUrl });
    } catch(e) {
        return response({ status: 'error', message: e.message });
    }
}

function handleLogin(payload) {
  // Payload contains student info + optional 'userAgent'
  const ss = getSpreadsheet(); 
  let sheet = ss.getSheetByName('Students');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Students'); }
  const data = sheet.getDataRange().getValues(); 
  const headers = data[0];
  const inputName = payload.name.trim(); 
  const inputPass = payload.password ? payload.password.trim() : "";
  const scriptPref = payload.scriptPreference || 'Simplified';
  const userAgent = payload.userAgent || "";
  
  let foundRow = -1; 
  let existingId = ""; 
  let correctName = inputName; 
  let storedPass = "";
  let points = 0;
  let stickers = [];
  let canCreate = false;

  const pointsIdx = findColumnIndex(headers, ['points']);
  const stickersIdx = findColumnIndex(headers, ['stickers', 'rewards']);
  const permIdx = findColumnIndex(headers, ['permissions', 'perm']);

  for (let i = 1; i < data.length; i++) { 
    if (String(data[i][1]).trim().toLowerCase() == inputName.toLowerCase()) { 
      foundRow = i + 1; 
      existingId = String(data[i][0]); 
      correctName = String(data[i][1]).trim(); 
      storedPass = String(data[i][4]); 
      points = pointsIdx > -1 ? Number(data[i][pointsIdx] || 0) : 0;
      canCreate = permIdx > -1 ? Boolean(data[i][permIdx]) : false;
      const stickerRaw = stickersIdx > -1 ? String(data[i][stickersIdx] || "") : "";
      try { stickers = stickerRaw ? JSON.parse(stickerRaw) : []; } catch(e) { stickers = []; }
      break; 
    } 
  }
  
  const timestamp = new Date().toISOString();
  if (foundRow > 0) { 
      if (storedPass && storedPass != inputPass) return response({ status: 'error', message: 'Incorrect Password' });
      sheet.getRange(foundRow, 4).setValue(timestamp); 
      let scriptColIndex = headers.indexOf('Script') + 1;
      if (scriptColIndex > 0) sheet.getRange(foundRow, scriptColIndex).setValue(scriptPref); 
      let logSheet = ss.getSheetByName('LoginLogs');
      if (logSheet) {
          // Add simplified device info (e.g. Chrome/Mac)
          let simplifiedDevice = "Unknown";
          if (userAgent.indexOf("iPhone") > -1) simplifiedDevice = "iPhone";
          else if (userAgent.indexOf("iPad") > -1) simplifiedDevice = "iPad";
          else if (userAgent.indexOf("Android") > -1) simplifiedDevice = "Android";
          else if (userAgent.indexOf("Mac") > -1) simplifiedDevice = "Mac";
          else if (userAgent.indexOf("Win") > -1) simplifiedDevice = "Windows";
          else if (userAgent.indexOf("CrOS") > -1) simplifiedDevice = "Chromebook";

          logSheet.appendRow([new Date(), existingId, correctName, 'Login', simplifiedDevice]);
      }
      
      // Fetch Custom Stickers
      let customStickers = [];
      const cSheet = ss.getSheetByName('CustomStickers');
      if (cSheet) {
          const cData = cSheet.getDataRange().getValues();
          for (let k = 1; k < cData.length; k++) {
              if (String(cData[k][1]) === existingId) {
                  customStickers.push({
                      id: cData[k][0],
                      studentId: cData[k][1],
                      dataUrl: cData[k][2], // This might be a URL now!
                      prompt: cData[k][3]
                  });
              }
          }
      }

      return response({ 
        status: 'success', 
        student: { 
            ...payload, 
            id: existingId, 
            name: correctName, 
            scriptPreference: scriptPref, 
            points: points,
            stickers: stickers,
            customStickers: customStickers,
            canCreateStickers: canCreate
        } 
      });
  } else { return response({ status: 'error', message: 'User not found. Please ask your teacher to create an account.' }); }
}

function updatePermission(payload) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Students');
    if (!sheet) return response({ status: 'error', message: 'No Student sheet' });
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const permIdx = findColumnIndex(headers, ['permissions', 'perm']);
    
    // Create column if missing
    let targetCol = permIdx + 1;
    if (permIdx === -1) {
        targetCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, targetCol).setValue('Permissions');
    }

    let foundRow = -1;
    for(let i=1; i<data.length; i++) {
        if(String(data[i][0]) === String(payload.studentId)) {
            foundRow = i + 1;
            break;
        }
    }
    
    if (foundRow === -1) return response({ status: 'error', message: 'Student not found' });
    sheet.getRange(foundRow, targetCol).setValue(payload.canCreate);
    return response({ status: 'success' });
}

function updatePoints(payload) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Students');
    if (!sheet) return response({ status: 'error', message: 'No Student sheet' });
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const pointsIdx = findColumnIndex(headers, ['points']);
    let targetCol = pointsIdx + 1;
    if (pointsIdx === -1) {
        targetCol = headers.length + 1;
        sheet.getRange(1, targetCol).setValue("Points");
    }
    let foundRow = -1;
    let currentPoints = 0;
    for(let i=1; i<data.length; i++) {
        if(String(data[i][0]) === String(payload.studentId)) {
            foundRow = i + 1;
            currentPoints = pointsIdx > -1 ? Number(data[i][pointsIdx] || 0) : 0;
            break;
        }
    }
    if (foundRow === -1) return response({ status: 'error', message: 'Student not found' });
    const newPoints = Math.max(0, currentPoints + Number(payload.delta));
    sheet.getRange(foundRow, targetCol).setValue(newPoints);
    const logSheet = ss.getSheetByName('PointLogs');
    if(logSheet) logSheet.appendRow([new Date(), payload.studentId, payload.delta, payload.reason, newPoints]);
    return response({ status: 'success', points: newPoints });
}

function adminGivePoints(payload) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Students');
    if (!sheet) return response({ status: 'error', message: 'No Student sheet' });
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const pointsIdx = findColumnIndex(headers, ['points']);
    if (pointsIdx === -1) return response({ status: 'error', message: 'No points column' });
    
    const targetIds = payload.studentIds || [];
    const delta = Number(payload.delta) || 0;
    const logSheet = ss.getSheetByName('PointLogs');
    
    for(let i=1; i<data.length; i++) {
        const sid = String(data[i][0]);
        if (targetIds.includes(sid)) {
            const currentPoints = Number(data[i][pointsIdx] || 0);
            const newPoints = Math.max(0, currentPoints + delta);
            sheet.getRange(i+1, pointsIdx + 1).setValue(newPoints);
            if(logSheet) logSheet.appendRow([new Date(), sid, delta, payload.reason || "Teacher Award", newPoints]);
        }
    }
    return response({ status: 'success' });
}

function adminGiveSticker(payload) {
    const ss = getSpreadsheet();
    let cSheet = ss.getSheetByName('CustomStickers');
    if (!cSheet) { setup(); cSheet = ss.getSheetByName('CustomStickers'); }
    const studentSheet = ss.getSheetByName('Students');
    if (!studentSheet) return response({ status: 'error', message: 'No Student sheet' });
    
    const data = studentSheet.getDataRange().getValues();
    const headers = data[0];
    const stickersIdx = findColumnIndex(headers, ['stickers']);
    if (stickersIdx === -1) return response({ status: 'error', message: 'No stickers column' });

    const targetIds = payload.studentIds || [];
    const stickerData = payload.sticker; // { dataUrl, prompt, id } (id optional)
    
    // Check if this is a store item (has ID already) or new generated sticker
    const stickerId = stickerData.id || ('gift-' + Date.now());
    
    // 1. SAVE TO DRIVE (Only if it's base64 data, not if it's a store URL)
    let savedUrl = stickerData.dataUrl;
    if (savedUrl && savedUrl.startsWith('data:')) {
       try {
         savedUrl = saveImageToDrive(savedUrl, "Sticker_" + stickerId);
       } catch (e) {
         // Return explicit error to frontend
         if (savedUrl.length > 49000) return response({ status: 'error', message: e.message });
       }
    }

    // 2. SAVE TO CUSTOM SHEET (Only if generated/new)
    // If it's a store item, we don't add it to custom stickers, just to student inventory
    if (!stickerData.id && cSheet) {
      for (let sid of targetIds) {
          try {
            cSheet.appendRow([stickerId, sid, savedUrl, stickerData.prompt, new Date()]);
          } catch(e) {}
      }
    }

    // 3. UPDATE STUDENT JSON
    for(let i=1; i<data.length; i++) {
        const sid = String(data[i][0]);
        if (targetIds.includes(sid)) {
            let currentStickers = [];
            try { currentStickers = data[i][stickersIdx] ? JSON.parse(data[i][stickersIdx]) : []; } catch(e) {}
            if (!currentStickers.includes(stickerId)) {
                currentStickers.push(stickerId);
                studentSheet.getRange(i+1, stickersIdx + 1).setValue(JSON.stringify(currentStickers));
            }
        }
    }
    
    return response({ status: 'success' });
}

function purchaseSticker(payload) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Students');
    if (!sheet) return response({ status: 'error', message: 'No Student sheet' });
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const pointsIdx = findColumnIndex(headers, ['points']);
    const stickersIdx = findColumnIndex(headers, ['stickers']);
    if (pointsIdx === -1 || stickersIdx === -1) return response({ status: 'error', message: 'Database schema update needed' });
    let foundRow = -1; let currentPoints = 0; let currentStickers = [];
    for(let i=1; i<data.length; i++) {
        if(String(data[i][0]) === String(payload.studentId)) {
            foundRow = i + 1;
            currentPoints = Number(data[i][pointsIdx] || 0);
            try { currentStickers = data[i][stickersIdx] ? JSON.parse(data[i][stickersIdx]) : []; } catch(e) {}
            break;
        }
    }
    if (foundRow === -1) return response({ status: 'error', message: 'Student not found' });
    if (currentPoints < payload.cost) return response({ status: 'error', message: 'Not enough points' });
    const newPoints = currentPoints - payload.cost;
    sheet.getRange(foundRow, pointsIdx + 1).setValue(newPoints);
    if (!currentStickers.includes(payload.stickerId)) {
        currentStickers.push(payload.stickerId);
        sheet.getRange(foundRow, stickersIdx + 1).setValue(JSON.stringify(currentStickers));
    }
    const logSheet = ss.getSheetByName('PointLogs');
    if(logSheet) logSheet.appendRow([new Date(), payload.studentId, -payload.cost, \`Bought sticker: \${payload.stickerId}\`, newPoints]);
    return response({ status: 'success', points: newPoints, stickers: currentStickers });
}

function saveCustomSticker(payload) {
    const ss = getSpreadsheet();
    let cSheet = ss.getSheetByName('CustomStickers');
    if (!cSheet) { setup(); cSheet = ss.getSheetByName('CustomStickers'); }
    const studentSheet = ss.getSheetByName('Students');
    if (!studentSheet) return response({ status: 'error', message: 'No Student sheet' });
    const data = studentSheet.getDataRange().getValues();
    const headers = data[0];
    const pointsIdx = findColumnIndex(headers, ['points']);
    const stickersIdx = findColumnIndex(headers, ['stickers']);
    let foundRow = -1; let currentPoints = 0; let currentStickers = [];
    for(let i=1; i<data.length; i++) {
        if(String(data[i][0]) === String(payload.studentId)) {
            foundRow = i + 1;
            currentPoints = Number(data[i][pointsIdx] || 0);
            try { currentStickers = data[i][stickersIdx] ? JSON.parse(data[i][stickersIdx]) : []; } catch(e) {}
            break;
        }
    }
    if (foundRow === -1) return response({ status: 'error', message: 'Student not found' });
    if (currentPoints < payload.cost) return response({ status: 'error', message: 'Not enough points' });
    
    // SAVE IMAGE TO DRIVE
    let savedUrl = payload.dataUrl;
    if (savedUrl.startsWith('data:')) {
       try {
         savedUrl = saveImageToDrive(savedUrl, "CustomSticker_" + payload.studentId);
       } catch (e) {
         if (savedUrl.length > 49000) return response({ status: 'error', message: e.message });
       }
    }

    const newPoints = currentPoints - payload.cost;
    studentSheet.getRange(foundRow, pointsIdx + 1).setValue(newPoints);
    const stickerId = 'custom-' + Date.now();
    
    cSheet.appendRow([stickerId, payload.studentId, savedUrl, payload.prompt, new Date()]);
    currentStickers.push(stickerId);
    studentSheet.getRange(foundRow, stickersIdx + 1).setValue(JSON.stringify(currentStickers));
    
    return response({ status: 'success', points: newPoints, sticker: { id: stickerId, dataUrl: savedUrl, prompt: payload.prompt } });
}

function getAllStudentProgress(startDate, endDate) {
  const ss = getSpreadsheet(); const studentSheet = ss.getSheetByName('Students');
  const progressSheet = ss.getSheetByName('Progress'); const assignmentSheet = ss.getSheetByName('StudentAssignments');
  if (!studentSheet) return response({ students: [] });
  const start = startDate ? new Date(startDate).setHours(0,0,0,0) : 0;
  const end = endDate ? new Date(endDate).setHours(23,59,59,999) : 8640000000000000;
  const isInRange = (dateStr) => { if (!dateStr) return false; const t = new Date(dateStr).getTime(); return t >= start && t <= end; };
  const studentsData = studentSheet.getDataRange().getValues(); const headers = studentsData.shift(); 
  const scriptIndex = headers.indexOf('Script'); const pointsIndex = findColumnIndex(headers, ['points']);
  const permIdx = findColumnIndex(headers, ['permissions', 'perm']);
  const stickersIndex = findColumnIndex(headers, ['stickers', 'rewards']);

  // Pre-fetch custom stickers to avoid O(N) lookup complexity
  const customStickersMap = {};
  const cSheet = ss.getSheetByName('CustomStickers');
  if (cSheet) {
      const cData = cSheet.getDataRange().getValues();
      // Start from 1 to skip header
      for (let k = 1; k < cData.length; k++) {
          const sid = String(cData[k][1]);
          if (!customStickersMap[sid]) customStickersMap[sid] = [];
          customStickersMap[sid].push({
              id: cData[k][0],
              studentId: sid,
              dataUrl: cData[k][2],
              prompt: cData[k][3]
          });
      }
  }

  const students = {}; 
  studentsData.forEach(row => { 
      const id = String(row[0]); 
      
      const stickerRaw = stickersIndex > -1 ? String(row[stickersIndex] || "") : "";
      let stickerIds = [];
      try { stickerIds = stickerRaw ? JSON.parse(stickerRaw) : []; } catch(e) {}

      students[id] = { 
          id: id, name: row[1], assignmentsCompleted: 0, assignmentsInProgress: 0, totalPracticed: 0, rawScores: [], averageScore: 0, 
          lastActive: row[3], script: scriptIndex > -1 ? row[scriptIndex] : 'Simplified', 
          points: pointsIndex > -1 ? Number(row[pointsIndex] || 0) : 0,
          canCreateStickers: permIdx > -1 ? Boolean(row[permIdx]) : false,
          stickers: stickerIds,
          customStickers: customStickersMap[id] || []
      }; 
  });
  if (assignmentSheet) {
    const assignData = assignmentSheet.getDataRange().getValues();
    for(let i=1; i<assignData.length; i++) {
      const row = assignData[i]; const sId = String(row[0]); const status = row[2]; const ts = row[3];
      if (students[sId] && (!startDate || isInRange(ts))) { 
         if (status === 'COMPLETED') students[sId].assignmentsCompleted += 1; 
         else if (status === 'IN_PROGRESS') students[sId].assignmentsInProgress += 1; 
      }
    }
  }
  if (progressSheet) {
     const progData = progressSheet.getDataRange().getValues(); const nameToId = {};
     Object.values(students).forEach(s => { nameToId[s.name] = s.id });
     for(let i=1; i<progData.length; i++) { 
         const row = progData[i]; const sId = nameToId[row[1]]; const dateStr = row[6];
         if (sId && students[sId] && (!startDate || isInRange(dateStr))) { students[sId].totalPracticed += 1; students[sId].rawScores.push(Number(row[3])); } 
     }
  }
  const result = Object.values(students).map(s => { const total = s.rawScores.reduce((a, b) => a + b, 0); s.averageScore = s.rawScores.length > 0 ? Math.round(total / s.rawScores.length) : 0; delete s.rawScores; return s; });
  return response({ students: result });
}

function getLoginLogs() {
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('LoginLogs');
  if (!sheet) return response({ logs: [] });
  const lastRow = sheet.getLastRow(); if (lastRow < 2) return response({ logs: [] });
  const startRow = Math.max(2, lastRow - 99); const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
  const logs = data.reverse().map(row => ({ timestamp: row[0], studentId: row[1], name: row[2], action: row[3], device: row[4] }));
  return response({ logs: logs });
}

function saveRecord(payload) {
  const ss = getSpreadsheet(); let sheet = ss.getSheetByName('Progress');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Progress'); }
  sheet.appendRow([payload.id, payload.studentName, payload.character, payload.score, payload.details, payload.timestamp, new Date().toISOString(), payload.type]);
  return response({ status: 'success' });
}

function submitFeedback(payload) {
  const ss = getSpreadsheet(); let sheet = ss.getSheetByName('Feedback');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Feedback'); }
  sheet.appendRow([new Date().toISOString(), payload.name, payload.email || "", payload.message]);
  return response({ status: 'success' });
}

function getAssignments() {
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ lessons: [] });
  const data = sheet.getDataRange().getValues();
  if (data.length < 1) return response({ lessons: [] });
  const headers = data[0];
  const typeIndex = findColumnIndex(headers, ['type', 'assignment type']);
  const assignIndex = findColumnIndex(headers, ['assignedto', 'assigned', 'students']);
  const lessons = [];
  for (var i = 1; i < data.length; i++) {
    const row = data[i]; if (!row[0]) continue;
    let rawType = ''; if (typeIndex > -1 && row.length > typeIndex) rawType = String(row[typeIndex]).toUpperCase().trim();
    let type = 'WRITING'; 
    if (rawType.indexOf('PIN') > -1) type = 'PINYIN';
    else if (rawType.indexOf('FILL') > -1 || rawType.indexOf('SENTENCE') > -1) type = 'FILL_IN_BLANKS';
    let assignedTo = [];
    if (assignIndex > -1 && row.length > assignIndex) {
        const rawAssigned = String(row[assignIndex]).trim();
        if (rawAssigned) assignedTo = rawAssigned.split(',').map(s => s.trim()).filter(s => s);
    }
    lessons.push({ id: row[0], title: row[1], description: row[2], characters: row[3] ? String(row[3]).split(/[,，]/).map(c => c.trim()).filter(c => c) : [], startDate: formatDate(row[4]), endDate: formatDate(row[5]), type: type, assignedTo: assignedTo });
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
  let assignIndex = findColumnIndex(headers, ['assignedto', 'assigned']);
  if (assignIndex === -1) { const nextCol = sheet.getLastColumn() + 1; sheet.getRange(1, nextCol).setValue('AssignedTo'); assignIndex = nextCol - 1; }
  const colMap = {}; 
  const newHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  newHeaders.forEach((h, i) => { colMap[String(h).trim().toLowerCase()] = i; });
  const maxIndex = Math.max(typeIndex, assignIndex, ...Object.values(colMap));
  const row = new Array(maxIndex + 1).fill("");
  const setVal = (key, val) => { if (key in colMap) row[colMap[key]] = val; };
  setVal('id', payload.id); setVal('title', payload.title); setVal('description', payload.description);
  setVal('characters', payload.characters.join(',')); setVal('startdate', payload.startDate || ""); setVal('enddate', payload.endDate || "");
  setVal('type', payload.type || 'WRITING');
  setVal('assignedto', payload.assignedTo ? payload.assignedTo.join(',') : "");
  sheet.appendRow(row); return response({ status: 'success' });
}

function editAssignment(payload) {
  const ss = getSpreadsheet(); let sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ status: 'error', message: 'Sheet not found' });
  const data = sheet.getDataRange().getValues(); const headers = data[0];
  const colMap = {}; headers.forEach((h, i) => { colMap[String(h).trim().toLowerCase()] = i + 1; }); 
  let rowIndex = -1;
  for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; } }
  if (rowIndex === -1) return response({ status: 'error', message: 'Assignment ID not found' });
  const setCell = (key, val) => { if (key in colMap) sheet.getRange(rowIndex, colMap[key]).setValue(val); };
  setCell('title', payload.title); setCell('description', payload.description); setCell('characters', payload.characters.join(',')); 
  setCell('startdate', payload.startDate || ""); setCell('enddate', payload.endDate || "");
  if ('type' in colMap) setCell('type', payload.type);
  if ('assignedto' in colMap) setCell('assignedto', payload.assignedTo ? payload.assignedTo.join(',') : "");
  return response({ status: 'success' });
}

function deleteAssignment(payload) {
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ status: 'error', message: 'Sheet not found' });
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; } }
  if (rowIndex > -1) { sheet.deleteRow(rowIndex); return response({ status: 'success' }); }
  return response({ status: 'error', message: 'ID not found' });
}

function getHistory(studentName) {
  if (!studentName) return response({ records: [] });
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('Progress');
  if (!sheet) return response({ records: [] });
  const data = sheet.getDataRange().getValues();
  const headers = data[0]; const typeIndex = findColumnIndex(headers, ['type']);
  const detailsIndex = findColumnIndex(headers, ['details']); const records = [];
  for (let i = 1; i < data.length; i++) {
     const row = data[i]; if (row[1] === studentName) {
         let type = 'WRITING'; if (typeIndex > -1 && row[typeIndex]) { const raw = String(row[typeIndex]).toUpperCase(); if (raw.includes('PIN')) type = 'PINYIN'; else if (raw.includes('FILL') || raw.includes('SENTENCE')) type = 'FILL_IN_BLANKS'; }
         records.push({ id: row[0], character: row[2], score: Number(row[3]), details: detailsIndex > -1 ? row[detailsIndex] : "", timestamp: Number(row[5]), type: type });
     }
  }
  return response({ records: records });
}

function getCalendarEvents() {
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('Calendar');
  if (!sheet) return response({ events: [] });
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return response({ events: [] });
  const events = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i]; if (!row[0]) continue;
    events.push({
      id: String(row[0]), date: formatDate(row[1]), title: String(row[2]), type: String(row[3]), description: String(row[4])
    });
  }
  return response({ events: events });
}

function saveCalendarEvent(payload) {
  const ss = getSpreadsheet(); let sheet = ss.getSheetByName('Calendar');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Calendar'); }
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; }
  }
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 2, 1, 4).setValues([[payload.date, payload.title, payload.type, payload.description || ""]]);
  } else {
    sheet.appendRow([payload.id || Utilities.getUuid(), payload.date, payload.title, payload.type, payload.description || ""]);
  }
  return response({ status: 'success' });
}

function deleteCalendarEvent(payload) {
  const ss = getSpreadsheet(); const sheet = ss.getSheetByName('Calendar');
  if (!sheet) return response({ status: 'error', message: 'Sheet not found' });
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.id)) { rowIndex = i + 1; break; }
  }
  if (rowIndex > 0) { sheet.deleteRow(rowIndex); return response({ status: 'success' }); }
  return response({ status: 'error', message: 'ID not found' });
}
`;

export const SetupModal: React.FC<SetupModalProps> = ({ onClose }) => {
  const [isLocked, setIsLocked] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  
  // Sheets State
  const [url, setUrl] = useState('');
  const [urlSource, setUrlSource] = useState<'MANUAL' | 'ENV'>('MANUAL');
  const [validationWarning, setValidationWarning] = useState('');
  
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [isDemo, setIsDemo] = useState(false);

  // Help Toggle
  const [showHelp, setShowHelp] = useState(true); // Default to showing help

  useEffect(() => {
      // Load existing config
      const currentUrl = sheetService.getUrl() || '';
      setUrl(currentUrl);
      validateUrl(currentUrl);
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

  const validateUrl = (input: string) => {
      if (!input) {
          setValidationWarning('');
          return;
      }
      if (input.includes('spreadsheets/d/')) {
          setValidationWarning("⚠️ Warning: This looks like a Spreadsheet URL, not the App Script URL. You need the 'Web App URL' from the Deploy dialog.");
      } else if (input.includes('/dev')) {
          setValidationWarning("⚠️ Warning: '/dev' URLs only work for the owner. Use the '/exec' URL for students.");
      } else if (!input.includes('script.google.com')) {
          setValidationWarning("⚠️ Warning: This doesn't look like a Google Apps Script URL.");
      } else {
          setValidationWarning('');
      }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setUrl(val);
      setUrlSource('MANUAL');
      validateUrl(val);
  };

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

  const handleBrowserTest = () => {
      if (!url) return;
      // Append action=health to see JSON response
      const clean = url.trim().replace(/\/edit.*$/, '/exec').replace(/\/dev.*$/, '/exec');
      // Just test the base URL to verify doGet is working for humans
      window.open(clean, '_blank');
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
                {/* 403 / BLOCKER ERROR GUIDE - ALWAYS VISIBLE IF ERROR PRESENT OR HELP TOGGLED */}
                {(showHelp || (status === 'error' && (statusMsg.includes('Blocked') || statusMsg.includes('Access Denied') || statusMsg.includes('Failed to fetch')))) && (
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 animate-bounce-in shadow-inner">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-rose-700 font-black text-lg flex items-center gap-2">
                                ⚠️ "Connection Blocked" or "Script not found"?
                            </h3>
                            <button onClick={() => setShowHelp(false)} className="text-xs text-rose-500 underline">Hide Guide</button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <p className="text-rose-800 text-sm font-bold">Solution: Check Permissions</p>
                                <ol className="list-decimal list-inside text-rose-800 space-y-1 text-xs font-medium">
                                    <li>Copy v3.9 Code below & Paste into Apps Script.</li>
                                    <li className="font-bold bg-rose-200 px-1 rounded inline-block">Click Deploy -> New Deployment.</li>
                                    <li>Execute as: <strong>Me</strong>.</li>
                                    <li>Who has access: <strong className="bg-rose-200 px-1 rounded text-rose-900">Anyone</strong> (NOT 'Anyone with Account'!).</li>
                                    <li>Copy the <strong>NEW URL</strong>.</li>
                                </ol>
                            </div>
                            <div className="space-y-2">
                                <p className="text-rose-800 text-sm font-bold">Step 2: Verify Access</p>
                                <p className="text-rose-600 text-xs">
                                    Click the <strong>"Test in Browser"</strong> button below.
                                </p>
                                <ul className="list-disc list-inside text-rose-800 space-y-1 text-xs font-medium">
                                    <li>If you see "HanziMaster Backend v3.9 is ONLINE": It works!</li>
                                    <li>If you see "Invalid action": Code is old (v3.7). Deploy again.</li>
                                    <li>If you see "Google Sign In": Permission is wrong.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
                
                {!showHelp && !statusMsg.includes('Blocked') && (
                     <div className="text-center">
                        <button onClick={() => setShowHelp(true)} className="text-indigo-500 text-xs font-bold underline">Show Deployment Guide</button>
                     </div>
                )}

                {/* Demo Mode Option */}
                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-indigo-900 text-lg">Use Offline Demo?</h3>
                        <p className="text-sm text-indigo-700 mt-1">
                            If you can't connect a backend right now, you can use the demo mode to test features.
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
                             📋 Copy v3.9 Code (Fixes Invalid Action)
                         </button>
                    </div>

                    <div className="relative">
                        <textarea readOnly className="w-full h-24 p-4 bg-slate-800 text-emerald-400 font-mono text-xs rounded-xl resize-none" value={APPS_SCRIPT_CODE} />
                        <div className="absolute top-2 right-2 text-[10px] text-white/50 bg-black/30 px-2 rounded">
                            {APPS_SCRIPT_CODE.length} chars
                        </div>
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
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input 
                                    type="text" 
                                    value={url} 
                                    onChange={handleUrlChange} 
                                    placeholder="https://script.google.com/macros/s/..../exec" 
                                    className={`w-full px-5 py-3 rounded-xl border-2 outline-none font-mono text-sm transition-colors ${validationWarning ? 'border-amber-300 bg-amber-50' : urlSource === 'ENV' ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800' : 'border-slate-200 focus:border-indigo-500'}`}
                                />
                            </div>
                            <Button 
                                variant="outline" 
                                onClick={handleBrowserTest} 
                                title="Open in new tab to verify"
                                className="px-4 shrink-0"
                            >
                                🔗 Test in Browser
                            </Button>
                        </div>
                        {validationWarning && (
                            <div className="text-xs font-bold text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
                                {validationWarning}
                            </div>
                        )}
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
