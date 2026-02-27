
// -----------------------------------------------------
// HANZI MASTER BACKEND SCRIPT (v3.27.0)
// Copy ALL of this code into your Google Apps Script
// -----------------------------------------------------

// CONFIGURATION
const VERSION = 'v3.27.1'; 
const SHEET_ID = ''; // Leave empty to use the bound sheet

function getSpreadsheet() {
  if (SHEET_ID) { try { return SpreadsheetApp.openById(SHEET_ID); } catch (e) {} }
  try { var ss = SpreadsheetApp.getActiveSpreadsheet(); if (ss) return ss; } catch (e) {}
  throw new Error("Could not find the Spreadsheet. Please ensuring this script is bound to a Google Sheet.");
}

function setup() {
  const ss = getSpreadsheet();
  
  // 1. STUDENTS SHEET & MIGRATION
  let studentSheet = ss.getSheetByName('Students');
  if (!studentSheet) {
    studentSheet = ss.insertSheet('Students');
    studentSheet.appendRow(['ID', 'Name', 'JoinedAt', 'LastLogin', 'Password', 'Script', 'Points', 'Stickers', 'Permissions']);
    studentSheet.setFrozenRows(1);
  } else {
    // AUTO-MIGRATION
    var headers = studentSheet.getRange(1, 1, 1, studentSheet.getLastColumn()).getValues()[0];
    if (findColumnIndex(headers, ['points']) === -1) { studentSheet.getRange(1, studentSheet.getLastColumn() + 1).setValue('Points'); }
    if (findColumnIndex(headers, ['stickers']) === -1) { studentSheet.getRange(1, studentSheet.getLastColumn() + 1).setValue('Stickers'); }
    if (findColumnIndex(headers, ['permissions', 'perm']) === -1) { studentSheet.getRange(1, studentSheet.getLastColumn() + 1).setValue('Permissions'); }
    SpreadsheetApp.flush();
  }

  // 2. CUSTOM STICKERS SHEET
  let customStickerSheet = ss.getSheetByName('CustomStickers');
  if (!customStickerSheet) {
    customStickerSheet = ss.insertSheet('CustomStickers');
    customStickerSheet.appendRow(['ID', 'StudentID', 'DataUrl', 'Prompt', 'Timestamp']);
    customStickerSheet.setFrozenRows(1);
  }

  // 3. STORE SHEET
  let storeSheet = ss.getSheetByName('Store');
  if (!storeSheet) {
    storeSheet = ss.insertSheet('Store');
    storeSheet.appendRow(['ID', 'Name', 'ImageURL', 'Cost', 'Active', 'Category']);
    storeSheet.setFrozenRows(1);
  } else {
    var headers = storeSheet.getRange(1, 1, 1, storeSheet.getLastColumn()).getValues()[0];
    if (findColumnIndex(headers, ['category']) === -1) { storeSheet.getRange(1, storeSheet.getLastColumn() + 1).setValue('Category'); }
    SpreadsheetApp.flush();
  }

  // 4. ASSIGNMENTS
  let assignSheet = ss.getSheetByName('Assignments');
  if (!assignSheet) {
    assignSheet = ss.insertSheet('Assignments');
    assignSheet.appendRow(['ID', 'Title', 'Description', 'Characters', 'StartDate', 'EndDate', 'Type', 'AssignedTo', 'Metadata']);
    assignSheet.setFrozenRows(1);
  } else {
    // Migration: Add Metadata column if missing
    var headers = assignSheet.getRange(1, 1, 1, assignSheet.getLastColumn()).getValues()[0];
    if (findColumnIndex(headers, ['metadata']) === -1) { assignSheet.getRange(1, assignSheet.getLastColumn() + 1).setValue('Metadata'); }
  }

  // 5. PROGRESS
  let progressSheet = ss.getSheetByName('Progress');
  if (!progressSheet) {
    progressSheet = ss.insertSheet('Progress');
    progressSheet.appendRow(['ID', 'StudentName', 'Character', 'Score', 'Details', 'Timestamp', 'Date', 'Type']);
    progressSheet.setFrozenRows(1);
  }

  // 6. STUDENT ASSIGNMENTS
  let saSheet = ss.getSheetByName('StudentAssignments');
  if (!saSheet) { 
      saSheet = ss.insertSheet('StudentAssignments'); 
      saSheet.appendRow(['StudentID', 'AssignmentID', 'Status', 'Timestamp', 'PointsEarned']); 
      saSheet.setFrozenRows(1); 
  } else {
      var headers = saSheet.getRange(1, 1, 1, saSheet.getLastColumn()).getValues()[0];
      if (findColumnIndex(headers, ['pointsearned', 'points']) === -1) { 
          saSheet.getRange(1, saSheet.getLastColumn() + 1).setValue('PointsEarned'); 
      }
  }

  // 6.5 STUDENT STICKERS (New Normalized Table)
  let ssSheet = ss.getSheetByName('StudentStickers');
  if (!ssSheet) {
      ssSheet = ss.insertSheet('StudentStickers');
      ssSheet.appendRow(['ID', 'StudentID', 'StickerID', 'DateAcquired', 'Type']);
      ssSheet.setFrozenRows(1);
  }

  // 7. LOGS
  let logSheet = ss.getSheetByName('LoginLogs');
  if (!logSheet) {
    logSheet = ss.insertSheet('LoginLogs');
    logSheet.appendRow(['Timestamp', 'StudentID', 'Name', 'Action', 'Device']);
    logSheet.setFrozenRows(1);
  } else {
    const lastCol = logSheet.getLastColumn();
    if (lastCol > 0) {
        const headers = logSheet.getRange(1, 1, 1, lastCol).getValues()[0];
        if (headers.indexOf('Device') === -1) { logSheet.getRange(1, headers.length + 1).setValue('Device'); }
    }
  }

  // 8. POINT LOGS
  let pointLogSheet = ss.getSheetByName('PointLogs');
  if (!pointLogSheet) {
    pointLogSheet = ss.insertSheet('PointLogs');
    pointLogSheet.appendRow(['Timestamp', 'StudentID', 'Delta', 'Reason', 'NewBalance']);
    pointLogSheet.setFrozenRows(1);
  }

  // 9. FEEDBACK
  let fbSheet = ss.getSheetByName('Feedback');
  if (!fbSheet) { fbSheet = ss.insertSheet('Feedback'); fbSheet.appendRow(['Timestamp', 'Name', 'Email', 'Message']); fbSheet.setFrozenRows(1); }

  // 10. CALENDAR
  let calSheet = ss.getSheetByName('Calendar');
  if (!calSheet) {
    calSheet = ss.insertSheet('Calendar');
    calSheet.appendRow(['ID', 'Date', 'Title', 'Type', 'Description']);
    calSheet.setFrozenRows(1);
  }

  // 11. CLASS GOALS
  let goalSheet = ss.getSheetByName('ClassGoals');
  if (!goalSheet) {
    goalSheet = ss.insertSheet('ClassGoals');
    goalSheet.appendRow(['ID', 'Title', 'Target', 'Current', 'Status', 'Type']);
    goalSheet.setFrozenRows(1);
  }

  // 12. REWARD RULES
  let ruleSheet = ss.getSheetByName('RewardRules');
  if (!ruleSheet) {
    ruleSheet = ss.insertSheet('RewardRules');
    ruleSheet.appendRow(['ID', 'ActionKey', 'Description', 'Points']);
    ruleSheet.appendRow(['rule-1', 'ASSIGNMENT_COMPLETE', 'Complete an assignment', 30]);
    ruleSheet.appendRow(['rule-2', 'ASSIGNMENT_RETRY', 'Practice again (Review)', 30]);
    ruleSheet.setFrozenRows(1);
  }

  // 13. DICTIONARY (Audio Library)
  let dictSheet = ss.getSheetByName('Dictionary');
  if (!dictSheet) {
    dictSheet = ss.insertSheet('Dictionary');
    dictSheet.appendRow(['Character', 'Pinyin', 'Definition', 'AudioURL']);
    dictSheet.setFrozenRows(1);
  } else {
    var headers = dictSheet.getRange(1, 1, 1, dictSheet.getLastColumn()).getValues()[0];
    if (findColumnIndex(headers, ['audiourl', 'audio']) === -1) { 
        dictSheet.getRange(1, dictSheet.getLastColumn() + 1).setValue('AudioURL'); 
    }
  }
  
  // 14. ACTIVITY LOGS
  let actSheet = ss.getSheetByName('ActivityLogs');
  if (!actSheet) {
    actSheet = ss.insertSheet('ActivityLogs');
    actSheet.appendRow(['Timestamp', 'StudentID', 'Name', 'Action', 'Details', 'Metadata']);
    actSheet.setFrozenRows(1);
  }

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CLASS_STATUS')) { props.setProperty('CLASS_STATUS', 'OPEN'); }
  
  return "Database Verified and Updated.";
}

function findColumnIndex(headers, keys) {
  const lowerHeaders = headers.map(h => String(h).trim().toLowerCase());
  for (var i = 0; i < keys.length; i++) { var idx = lowerHeaders.indexOf(keys[i]); if (idx !== -1) return idx; }
  return -1;
}

function saveMediaToDrive(dataUrl, filenamePrefix) {
  try {
    var contentType = dataUrl.substring(5, dataUrl.indexOf(';'));
    var base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
    var extension = "png";
    if (contentType.includes('audio')) {
        if (contentType.includes('mpeg') || contentType.includes('mp3')) extension = "mp3";
        else if (contentType.includes('webm')) extension = "webm";
        else if (contentType.includes('wav')) extension = "wav";
        else extension = "m4a";
    } else if (contentType.includes('jpeg')) {
        extension = "jpg";
    }
    
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), contentType, filenamePrefix + "_" + Date.now() + "." + extension);
    var props = PropertiesService.getScriptProperties();
    var folderId = props.getProperty('STICKER_FOLDER_ID');
    var folder;
    if (folderId) { try { folder = DriveApp.getFolderById(folderId); if (folder.isTrashed()) folder = null; } catch (e) { folder = null; } }
    if (!folder) {
      var folderName = "HanziMaster_Assets";
      var folders = DriveApp.getFoldersByName(folderName);
      while (folders.hasNext()) { var f = folders.next(); if (!f.isTrashed()) { folder = f; break; } }
      if (!folder) { folder = DriveApp.createFolder(folderName); try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {} }
      props.setProperty('STICKER_FOLDER_ID', folder.getId());
    }
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    
    if (contentType.includes('audio')) {
        return "https://drive.google.com/uc?export=download&id=" + file.getId();
    }
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (e) { throw new Error("Drive Save Failed: " + e.toString()); }
}

function doGet(e) {
  const params = e ? e.parameter : {};
  const action = params.action;
  if (!action) return ContentService.createTextOutput("✅ HanziMaster Backend " + VERSION + " is ONLINE.").setMimeType(ContentService.MimeType.TEXT);
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
      else if (action === 'getPointLogs') return getPointLogs(params.studentId);
      else if (action === 'getClassGoals') return getClassGoals();
      else if (action === 'getRecentGoalContributions') return getRecentGoalContributions();
      else if (action === 'getRewardRules') return getRewardRules();
      else if (action === 'getDictionary') return getDictionary();
      return response({status: 'error', message: 'Invalid action: ' + action});
  } catch (err) { return response({status: 'error', message: err.toString()}); }
}

function doPost(e) {
  if (!e || !e.postData) return response({status: 'error', message: 'No data'});
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const data = JSON.parse(e.postData.contents); const action = data.action;
    
    if (action === 'login') return handleLogin(data.payload);
    else if (action === 'adminSetup') return handleForceSetup();
    else if (action === 'addStudent') return addStudent(data.payload);
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
    else if (action === 'uploadMedia') return uploadMedia(data.payload);
    else if (action === 'addStoreItem') return addStoreItem(data.payload);
    else if (action === 'deleteStoreItem') return deleteStoreItem(data.payload);
    else if (action === 'syncStudentData') return syncStudentData(data.payload);
    else if (action === 'createClassGoal') return createClassGoal(data.payload);
    else if (action === 'contributeToGoal') return contributeToGoal(data.payload);
    else if (action === 'deleteClassGoal') return deleteClassGoal(data.payload);
    else if (action === 'toggleGoalStatus') return toggleGoalStatus(data.payload);
    else if (action === 'updateRewardRule') return updateRewardRule(data.payload);
    else if (action === 'addToDictionary') return addToDictionary(data.payload);
    else if (action === 'deleteFromDictionary') return deleteFromDictionary(data.payload);
    else if (action === 'logActivity') return logActivity(data.payload);
    
    return response({status: 'error', message: 'Invalid action: ' + action});
  } catch (error) { return response({status: 'error', message: 'Server Error: ' + error.toString()}); } 
  finally { lock.releaseLock(); }
}

function response(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }

// --- FEATURE FUNCTIONS ---

function logActivity(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('ActivityLogs');
  if (!sheet) { setup(); sheet = ss.getSheetByName('ActivityLogs'); }
  
  const timestamp = new Date().toISOString();
  // Columns: Timestamp, StudentID, Name, Action, Details, Metadata
  sheet.appendRow([
    timestamp,
    payload.studentId || 'Anonymous',
    payload.studentName || 'Guest',
    payload.action || 'Unknown',
    payload.details || '',
    JSON.stringify(payload.metadata || {})
  ]);
  
  return response({ status: 'success' });
}

function addStudent(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Students');
    if (!sheet) { setup(); sheet = ss.getSheetByName('Students'); }
    
    const name = String(payload.name).trim();
    if (!name) return response({ status: 'error', message: "Name required" });
    
    // Check duplicates
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]).toLowerCase() === name.toLowerCase()) {
            return response({ status: 'error', message: "Student already exists" });
        }
    }
    
    const newId = 'student-' + Date.now();
    const timestamp = new Date().toISOString();
    // 'ID', 'Name', 'JoinedAt', 'LastLogin', 'Password', 'Script', 'Points', 'Stickers', 'Permissions'
    sheet.appendRow([newId, name, timestamp, '', payload.password || '', 'Simplified', 0, '[]', false]);
    
    return response({ status: 'success', id: newId });
}

function toggleGoalStatus(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('ClassGoals');
    if (!sheet) return response({ status: 'error' });
    const data = sheet.getDataRange().getValues();
    for(let i=1; i<data.length; i++) {
        if(String(data[i][0]) === String(payload.id)) {
            sheet.getRange(i+1, 5).setValue(payload.status);
            return response({ status: 'success' });
        }
    }
    return response({ status: 'error' });
}

function getDictionary() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Dictionary');
  if (!sheet) return response({ dictionary: {} });
  
  const data = sheet.getDataRange().getValues();
  const dictionary = {};
  
  for (let i = 1; i < data.length; i++) {
    const char = String(data[i][0]).trim();
    const url = String(data[i][3] || '').trim();
    if (char) {
        dictionary[char] = {
            pinyin: String(data[i][1]).trim(),
            definition: String(data[i][2]).trim(),
            audio: url
        };
    }
  }
  const simpleDict = {};
  for(const k in dictionary) simpleDict[k] = dictionary[k].audio;
  return response({ dictionary: simpleDict, fullDictionary: dictionary });
}

function addToDictionary(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Dictionary');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Dictionary'); }
  
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
      if(String(data[i][0]) === String(payload.character)) {
          if(payload.pinyin) sheet.getRange(i+1, 2).setValue(payload.pinyin);
          if(payload.definition) sheet.getRange(i+1, 3).setValue(payload.definition);
          if (payload.audioUrl) sheet.getRange(i+1, 4).setValue(payload.audioUrl);
          return response({ status: 'success', action: 'updated' });
      }
  }

  sheet.appendRow([payload.character, payload.pinyin || '', payload.definition || '', payload.audioUrl || '']);
  return response({ status: 'success', action: 'added' });
}

function deleteFromDictionary(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Dictionary');
  if (!sheet) return response({ status: 'error' });
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.character)) {
        sheet.deleteRow(i + 1);
        return response({ status: 'success' });
    }
  }
  return response({ status: 'error', message: 'Character not found' });
}

function getCalendarEvents() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Calendar');
  if (!sheet) return response({ events: [] });
  const data = sheet.getDataRange().getValues();
  const events = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      let dateStr = data[i][1];
      if (data[i][1] instanceof Date) { dateStr = data[i][1].toISOString().split('T')[0]; }
      events.push({ id: String(data[i][0]), date: dateStr, title: String(data[i][2]), type: String(data[i][3]), description: String(data[i][4]) });
    }
  }
  return response({ events: events });
}

function saveCalendarEvent(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Calendar');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Calendar'); }
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.id)) { foundRow = i + 1; break; }
  }
  if (foundRow > 0) {
    sheet.getRange(foundRow, 2).setValue(payload.date);
    sheet.getRange(foundRow, 3).setValue(payload.title);
    sheet.getRange(foundRow, 4).setValue(payload.type);
    sheet.getRange(foundRow, 5).setValue(payload.description || '');
  } else {
    sheet.appendRow([payload.id, payload.date, payload.title, payload.type, payload.description || '']);
  }
  return response({ status: 'success' });
}

function deleteCalendarEvent(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Calendar');
  if (!sheet) return response({ status: 'error', message: 'No calendar sheet' });
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.id)) { sheet.deleteRow(i + 1); return response({ status: 'success' }); }
  }
  return response({ status: 'error', message: 'Event not found' });
}

function getAssignments() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ lessons: [] });
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return response({ lessons: [] });
  const headers = data[0];
  const metaIdx = findColumnIndex(headers, ['metadata']);
  const lessons = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      let chars = []; try { chars = data[i][3] ? String(data[i][3]).split(',') : []; } catch(e) {}
      let assignedTo = []; try { assignedTo = data[i][7] ? JSON.parse(data[i][7]) : []; } catch(e) {}
      let metadata = {}; 
      if (metaIdx > -1) { try { metadata = data[i][metaIdx] ? JSON.parse(data[i][metaIdx]) : {}; } catch(e) {} }
      
      lessons.push({
        id: String(data[i][0]), title: String(data[i][1]), description: String(data[i][2]), characters: chars,
        startDate: data[i][4] instanceof Date ? data[i][4].toISOString().split('T')[0] : data[i][4],
        endDate: data[i][5] instanceof Date ? data[i][5].toISOString().split('T')[0] : data[i][5],
        type: String(data[i][6]), assignedTo: assignedTo,
        metadata: metadata
      });
    }
  }
  return response({ lessons: lessons });
}

function createAssignment(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Assignments');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Assignments'); }
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let metaIdx = findColumnIndex(headers, ['metadata']);
  if (metaIdx === -1) { sheet.getRange(1, lastCol + 1).setValue('Metadata'); metaIdx = lastCol; }
  
  const row = [payload.id, payload.title, payload.description, payload.characters.join(','), payload.startDate, payload.endDate, payload.type, JSON.stringify(payload.assignedTo || [])];
  row[8] = JSON.stringify(payload.metadata || {});
  
  sheet.appendRow(row);
  return response({ status: 'success' });
}

function editAssignment(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ status: 'error' });
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let metaIdx = findColumnIndex(headers, ['metadata']);
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.id)) {
      const chars = Array.isArray(payload.characters) ? payload.characters.join(',') : payload.characters;
      const assigned = JSON.stringify(payload.assignedTo || []);
      
      const rowData = [[
        payload.title,
        payload.description,
        chars,
        payload.startDate,
        payload.endDate,
        payload.type,
        assigned
      ]];
      
      sheet.getRange(i+1, 2, 1, 7).setValues(rowData);
      
      if (metaIdx > -1) {
          sheet.getRange(i+1, metaIdx + 1).setValue(JSON.stringify(payload.metadata || {}));
      }
      return response({ status: 'success' });
    }
  }
  return response({ status: 'error' });
}

function deleteAssignment(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Assignments');
  if (!sheet) return response({ status: 'error' });
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.id)) { sheet.deleteRow(i + 1); return response({ status: 'success' }); }
  }
  return response({ status: 'error' });
}

function getHistory(studentName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Progress');
  if (!sheet) return response({ records: [] });
  const data = sheet.getDataRange().getValues();
  const records = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === studentName.toLowerCase()) {
      records.push({
        id: String(data[i][0]), character: String(data[i][2]), score: Number(data[i][3]), details: String(data[i][4]),
        timestamp: new Date(data[i][5]).getTime(), type: String(data[i][7] || 'WRITING')
      });
    }
  }
  return response({ records: records });
}

function saveRecord(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Progress');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Progress'); }
  const timestamp = new Date();
  sheet.appendRow(['rec-' + Date.now(), payload.studentName, payload.character, payload.score, payload.details, timestamp.toISOString(), timestamp.toISOString().split('T')[0], payload.type || 'WRITING']);
  return response({ status: 'success' });
}

function getAssignmentStatuses(studentId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('StudentAssignments');
  if (!sheet) return response({ statuses: [] });
  const data = sheet.getDataRange().getValues();
  const statuses = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(studentId)) {
      statuses.push({ assignmentId: String(data[i][1]), status: String(data[i][2]) });
    }
  }
  return response({ statuses: statuses });
}

function updateAssignmentStatus(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('StudentAssignments');
  if (!sheet) { setup(); sheet = ss.getSheetByName('StudentAssignments'); }
  const data = sheet.getDataRange().getValues();
  
  // Headers check for Points column
  const headers = data[0];
  let ptsIdx = findColumnIndex(headers, ['points', 'pointsearned']);
  if (ptsIdx === -1) { 
      sheet.getRange(1, headers.length + 1).setValue('PointsEarned'); 
      ptsIdx = headers.length; 
      SpreadsheetApp.flush();
  }

  let foundRow = -1;
  let currentPoints = 0;
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.studentId) && String(data[i][1]) === String(payload.assignmentId)) { 
        foundRow = i + 1; 
        currentPoints = Number(data[i][ptsIdx]) || 0;
        break; 
    }
  }

  const MAX_POINTS = 60; // Max cap per assignment
  const requestedPoints = Number(payload.pointsToAdd) || 0;
  const availableRoom = Math.max(0, MAX_POINTS - currentPoints);
  const actualPoints = Math.min(requestedPoints, availableRoom);
  const newTotal = currentPoints + actualPoints;

  if (foundRow > 0) { 
      sheet.getRange(foundRow, 3).setValue(payload.status); 
      sheet.getRange(foundRow, 4).setValue(new Date().toISOString());
      sheet.getRange(foundRow, ptsIdx + 1).setValue(newTotal);
  } else { 
      const row = [payload.studentId, payload.assignmentId, payload.status, new Date().toISOString()];
      // Ensure row has enough columns if PointsEarned is far out
      while(row.length < ptsIdx) row.push('');
      row[ptsIdx] = newTotal;
      sheet.appendRow(row);
  }
  
  return response({ status: 'success', actualPoints: actualPoints });
}

function getLoginLogs() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('LoginLogs');
  if (!sheet) return response({ logs: [] });
  const data = sheet.getDataRange().getValues();
  const logs = [];
  const start = Math.max(1, data.length - 50);
  for (let i = data.length - 1; i >= start; i--) {
    logs.push({ timestamp: data[i][0], studentId: String(data[i][1]), name: String(data[i][2]), action: String(data[i][3]), device: String(data[i][4] || '') });
  }
  return response({ logs: logs });
}

function submitFeedback(payload) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Feedback');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Feedback'); }
  sheet.appendRow([new Date(), payload.name, payload.email, payload.message]);
  return response({ status: 'success' });
}

function getStoreItems() {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Store');
    if (!sheet) return response({ items: [] });
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const catIdx = findColumnIndex(headers, ['category']);
    const items = [];
    for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
            items.push({ id: String(data[i][0]), name: String(data[i][1]), imageUrl: String(data[i][2]), cost: Number(data[i][3]) || 100, active: data[i][4] === true || data[i][4] === 'TRUE' || data[i][4] === '', category: catIdx > -1 ? String(data[i][catIdx]) : 'Misc.' });
        }
    }
    return response({ items: items });
}

function addStoreItem(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Store');
    if (!sheet) { setup(); sheet = ss.getSheetByName('Store'); }
    const id = payload.id || 'store-' + Date.now();
    sheet.appendRow([id, payload.name, payload.imageUrl, payload.cost, true, payload.category || 'Misc.']);
    return response({ status: 'success' });
}

function deleteStoreItem(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Store');
    if (!sheet) return response({ status: 'error' });
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(payload.id)) { sheet.deleteRow(i + 1); return response({ status: 'success' }); }
    }
    return response({ status: 'error' });
}

function getPointLogs(studentId) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('PointLogs');
    if (!sheet) return response({ logs: [] });
    const data = sheet.getDataRange().getValues();
    const logs = [];
    for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][1]) === String(studentId)) {
            logs.push({ timestamp: data[i][0], delta: Number(data[i][2]), reason: String(data[i][3]), balance: Number(data[i][4]) });
            if (logs.length >= 50) break;
        }
    }
    return response({ logs: logs });
}

function getClassGoals() {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('ClassGoals');
    if (!sheet) return response({ goals: [] });
    const data = sheet.getDataRange().getValues();
    const goals = [];
    for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
            goals.push({ id: String(data[i][0]), title: String(data[i][1]), target: Number(data[i][2]), current: Number(data[i][3]), status: String(data[i][4]), type: String(data[i][5]) });
        }
    }
    return response({ goals: goals });
}

function createClassGoal(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('ClassGoals');
    if (!sheet) { setup(); sheet = ss.getSheetByName('ClassGoals'); }
    const id = 'goal-' + Date.now();
    sheet.appendRow([id, payload.title || 'Pizza Party', payload.target || 200, 0, 'ACTIVE', payload.type || 'PIZZA']);
    return response({ status: 'success', id: id });
}

function deleteClassGoal(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('ClassGoals');
    if (!sheet) return response({ status: 'error' });
    const data = sheet.getDataRange().getValues();
    for(let i=1; i<data.length; i++) {
        if(String(data[i][0]) === String(payload.id)) { sheet.deleteRow(i+1); return response({ status: 'success' }); }
    }
    return response({ status: 'error' });
}

function getRewardRules() {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('RewardRules');
    if (!sheet) return response({ rules: [] });
    const data = sheet.getDataRange().getValues();
    const rules = [];
    for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
            rules.push({ id: String(data[i][0]), actionKey: String(data[i][1]), description: String(data[i][2]), points: Number(data[i][3]) });
        }
    }
    return response({ rules: rules });
}

function updateRewardRule(payload) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('RewardRules');
    if (!sheet) { setup(); sheet = ss.getSheetByName('RewardRules'); }
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]) === String(payload.actionKey)) {
            sheet.getRange(i+1, 4).setValue(payload.points);
            return response({ status: 'success' });
        }
    }
    return response({ status: 'error', message: 'Rule not found' });
}

function contributeToGoal(payload) {
    const ss = getSpreadsheet();
    const studentSheet = ss.getSheetByName('Students');
    const goalSheet = ss.getSheetByName('ClassGoals');
    const logSheet = ss.getSheetByName('PointLogs');
    if (!studentSheet || !goalSheet) return response({ status: 'error', message: 'Missing sheets' });
    const amount = Number(payload.amount);
    if (amount <= 0) return response({ status: 'error', message: 'Invalid amount' });
    const sData = studentSheet.getDataRange().getValues();
    let sRow = -1;
    let sPointsIdx = findColumnIndex(sData[0], ['points']);
    for (let i = 1; i < sData.length; i++) { if (String(sData[i][0]) === String(payload.studentId)) { sRow = i + 1; break; } }
    if (sRow === -1) return response({ status: 'error', message: 'Student not found' });
    const currentPoints = Number(studentSheet.getRange(sRow, sPointsIdx + 1).getValue() || 0);
    if (currentPoints < amount) return response({ status: 'error', message: 'Not enough points' });
    const gData = goalSheet.getDataRange().getValues();
    let gRow = -1; let target = 0; let current = 0;
    for (let i = 1; i < gData.length; i++) {
        if (String(gData[i][0]) === String(payload.goalId)) { gRow = i + 1; target = Number(gData[i][2]); current = Number(gData[i][3]); break; }
    }
    if (gRow === -1) return response({ status: 'error', message: 'Goal not found' });
    const newStudentPoints = currentPoints - amount;
    studentSheet.getRange(sRow, sPointsIdx + 1).setValue(newStudentPoints);
    const newGoalCurrent = current + amount;
    goalSheet.getRange(gRow, 4).setValue(newGoalCurrent);
    let goalStatus = 'ACTIVE';
    if (newGoalCurrent >= target) { goalStatus = 'COMPLETED'; goalSheet.getRange(gRow, 5).setValue('COMPLETED'); }
    if (logSheet) { logSheet.appendRow([new Date(), payload.studentId, -amount, 'Contributed to Goal: ' + (payload.goalTitle || 'Class Goal'), newStudentPoints]); }
    return response({ status: 'success', points: newStudentPoints, goalCurrent: newGoalCurrent, goalStatus: goalStatus });
}

function getRecentGoalContributions() {
    const ss = getSpreadsheet();
    const logSheet = ss.getSheetByName('PointLogs');
    const studentSheet = ss.getSheetByName('Students');
    if (!logSheet || !studentSheet) return response({ logs: [] });
    const logsData = logSheet.getDataRange().getValues();
    const studentData = studentSheet.getDataRange().getValues();
    const nameMap = {};
    for (let i = 1; i < studentData.length; i++) { nameMap[String(studentData[i][0])] = studentData[i][1]; }
    const logs = [];
    for (let i = logsData.length - 1; i >= 1; i--) {
        const reason = String(logsData[i][3] || '');
        if (reason.toLowerCase().includes('contributed to goal')) {
            const sid = String(logsData[i][1]);
            logs.push({ id: 'log-' + i, studentName: nameMap[sid] || 'Unknown Student', amount: Number(logsData[i][2]), timestamp: logsData[i][0], goalTitle: reason.split(': ')[1] || 'Class Goal' });
            if (logs.length >= 20) break;
        }
    }
    return response({ logs: logs });
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

function testDriveSave(payload) {
    try {
        const testUrl = saveMediaToDrive(payload.dataUrl, "Test_Connection");
        return response({ status: 'success', url: testUrl });
    } catch(e) { return response({ status: 'error', message: e.message }); }
}

function uploadMedia(payload) {
    try {
        const url = saveMediaToDrive(payload.dataUrl, "Audio_" + Date.now());
        return response({ status: 'success', url: url });
    } catch(e) { return response({ status: 'error', message: e.message }); }
}

function handleLogin(payload) {
  const ss = getSpreadsheet(); 
  let sheet = ss.getSheetByName('Students');
  if (!sheet) { setup(); sheet = ss.getSheetByName('Students'); }
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  
  // Initialize with empty array if sheet is empty
  const data = lastRow > 0 ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : []; 
  const headers = data.length > 0 ? data[0] : [];
  
  const inputName = payload.name.trim(); 
  const inputPass = payload.password ? payload.password.trim() : "";
  const scriptPref = payload.scriptPreference || 'Simplified';
  const userAgent = payload.userAgent || "";
  
  let foundRow = -1; let existingId = ""; let correctName = inputName; let storedPass = "";
  let points = 0; let stickers = []; let canCreate = false;
  
  const pointsIdx = findColumnIndex(headers, ['points']);
  const stickersIdx = findColumnIndex(headers, ['stickers', 'rewards']);
  const permIdx = findColumnIndex(headers, ['permissions', 'perm']);
  
  for (let i = 1; i < data.length; i++) { 
    if (String(data[i][1]).trim().toLowerCase() == inputName.toLowerCase()) { 
      foundRow = i + 1; existingId = String(data[i][0]); correctName = String(data[i][1]).trim(); storedPass = String(data[i][4]); 
      points = pointsIdx > -1 ? Number(data[i][pointsIdx] || 0) : 0;
      canCreate = permIdx > -1 ? Boolean(data[i][permIdx]) : false;
      const stickerRaw = stickersIdx > -1 ? String(data[i][stickersIdx] || "") : "";
      try { stickers = stickerRaw ? JSON.parse(stickerRaw) : []; } catch(e) { stickers = []; }
      break; 
    } 
  }

  // Merge with StudentStickers (New Sheet)
  const ssSheet = ss.getSheetByName('StudentStickers');
  if (ssSheet && existingId) {
      const ssData = ssSheet.getDataRange().getValues();
      for (let j = 1; j < ssData.length; j++) {
          if (String(ssData[j][1]) === existingId) {
              stickers.push(String(ssData[j][2]));
          }
      }
  }
  // Deduplicate
  stickers = [...new Set(stickers)];
  
  const timestamp = new Date().toISOString();
  
  if (foundRow > 0) { 
      // Existing User Login
      if (storedPass && storedPass != inputPass) return response({ status: 'error', message: 'Incorrect Password' });
      sheet.getRange(foundRow, 4).setValue(timestamp); 
      let scriptColIndex = headers.indexOf('Script') + 1;
      if (scriptColIndex > 0) sheet.getRange(foundRow, scriptColIndex).setValue(scriptPref); 
      
      // Log it
      let logSheet = ss.getSheetByName('LoginLogs');
      if (logSheet) {
          let simplifiedDevice = "Unknown";
          if (userAgent.indexOf("iPhone") > -1) simplifiedDevice = "iPhone";
          else if (userAgent.indexOf("iPad") > -1) simplifiedDevice = "iPad";
          else if (userAgent.indexOf("Android") > -1) simplifiedDevice = "Android";
          else if (userAgent.indexOf("Mac") > -1) simplifiedDevice = "Mac";
          else if (userAgent.indexOf("Win") > -1) simplifiedDevice = "Windows";
          else if (userAgent.indexOf("CrOS") > -1) simplifiedDevice = "Chromebook";
          logSheet.appendRow([new Date(), existingId, correctName, 'Login', simplifiedDevice]);
      }
      
      let customStickers = [];
      const cSheet = ss.getSheetByName('CustomStickers');
      if (cSheet) {
          const cData = cSheet.getDataRange().getValues();
          for (let k = 1; k < cData.length; k++) {
              if (String(cData[k][1]) === existingId) {
                  customStickers.push({ id: cData[k][0], studentId: cData[k][1], dataUrl: cData[k][2], prompt: cData[k][3] });
              }
          }
      }
      return response({ status: 'success', student: { ...payload, id: existingId, name: correctName, scriptPreference: scriptPref, points: points, stickers: stickers, customStickers: customStickers, canCreateStickers: canCreate } });
  } else { 
      // AUTO-CREATION DISABLED
      return response({ status: 'error', message: "User not found. Ask teacher to create account." });
  }
}

function handleForceSetup() {
    try { const msg = setup(); return response({ status: 'success', message: msg }); } catch(e) { return response({ status: 'error', message: e.toString() }); }
}

function updatePermission(payload) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Students');
    if (!sheet) return response({ status: 'error', message: 'No Student sheet' });
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const permIdx = findColumnIndex(headers, ['permissions', 'perm']);
    let targetCol = permIdx + 1;
    if (permIdx === -1) { targetCol = sheet.getLastColumn() + 1; sheet.getRange(1, targetCol).setValue('Permissions'); }
    let foundRow = -1;
    for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(payload.studentId)) { foundRow = i + 1; break; } }
    if (foundRow === -1) return response({ status: 'error', message: 'Student not found' });
    sheet.getRange(foundRow, targetCol).setValue(payload.canCreate);
    return response({ status: 'success' });
}

function updatePoints(payload) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Students');
    if (!sheet) return response({ status: 'error', message: 'No Student sheet' });
    const lastCol = sheet.getLastColumn();
    const data = sheet.getRange(1, 1, sheet.getLastRow(), lastCol).getValues();
    const headers = data[0];
    let pointsIdx = findColumnIndex(headers, ['points']);
    let targetCol = pointsIdx + 1;
    if (pointsIdx === -1) { targetCol = lastCol + 1; sheet.getRange(1, targetCol).setValue("Points"); pointsIdx = targetCol - 1; }
    let foundRow = -1; let currentPoints = 0;
    for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(payload.studentId)) { foundRow = i + 1; currentPoints = pointsIdx > -1 ? Number(data[i][pointsIdx] || 0) : 0; break; } }
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
    const stickersIdx = findColumnIndex(headers, ['stickers', 'rewards']);
    if (stickersIdx === -1) return response({ status: 'error', message: 'No stickers column' });
    const targetIds = payload.studentIds || [];
    const stickerData = payload.sticker; 
    const stickerId = stickerData.id || ('gift-' + Date.now());
    let savedUrl = stickerData.dataUrl;
    if (savedUrl && savedUrl.startsWith('data:')) {
       try { savedUrl = saveMediaToDrive(savedUrl, "Sticker_" + stickerId); } catch (e) { if (savedUrl.length > 49000) return response({ status: 'error', message: e.message }); }
    }
    if (!stickerData.id && cSheet) { for (let sid of targetIds) { try { cSheet.appendRow([stickerId, sid, savedUrl, stickerData.prompt, new Date()]); } catch(e) {} } }
    
    // Add to StudentStickers Sheet
    let ssSheet = ss.getSheetByName('StudentStickers');
    if (!ssSheet) { setup(); ssSheet = ss.getSheetByName('StudentStickers'); }
    
    for (let sid of targetIds) {
        ssSheet.appendRow(['ss-' + Date.now() + Math.random(), sid, stickerId, new Date(), 'GIFT']);
    }

    return response({ status: 'success' });
}

function purchaseSticker(payload) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Students');
    if (!sheet) return response({ status: 'error', message: 'No Student sheet' });
    
    // Setup StudentStickers if missing
    let ssSheet = ss.getSheetByName('StudentStickers');
    if (!ssSheet) { setup(); ssSheet = ss.getSheetByName('StudentStickers'); }

    const lastCol = sheet.getLastColumn();
    let data = sheet.getRange(1, 1, sheet.getLastRow(), lastCol).getValues();
    let headers = data[0];
    let pointsIdx = findColumnIndex(headers, ['points']);
    
    if (pointsIdx === -1) { return response({ status: 'error', message: 'Database Error: Missing Columns.' }); }
    
    let foundRow = -1; let currentPoints = 0;
    for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(payload.studentId)) { foundRow = i + 1; currentPoints = Number(data[i][pointsIdx]); if (isNaN(currentPoints)) currentPoints = 0; break; } }
    
    if (foundRow === -1) return response({ status: 'error', message: 'Student not found in DB' });
    if (currentPoints < payload.cost) { return response({ status: 'error', message: 'Not enough points.' }); }
    
    const newPoints = currentPoints - payload.cost;
    sheet.getRange(foundRow, pointsIdx + 1).setValue(newPoints);
    
    // Add to StudentStickers
    ssSheet.appendRow(['ss-' + Date.now(), payload.studentId, payload.stickerId, new Date(), 'STORE']);
    
    const logSheet = ss.getSheetByName('PointLogs');
    if(logSheet) logSheet.appendRow([new Date(), payload.studentId, -payload.cost, 'Bought sticker: ' + payload.stickerId, newPoints]);
    
    return response({ status: 'success', points: newPoints, stickers: [payload.stickerId] }); // Frontend will refresh anyway
}

function saveCustomSticker(payload) {
    const ss = getSpreadsheet();
    let cSheet = ss.getSheetByName('CustomStickers');
    if (!cSheet) { setup(); cSheet = ss.getSheetByName('CustomStickers'); }
    const studentSheet = ss.getSheetByName('Students');
    if (!studentSheet) return response({ status: 'error', message: 'No Student sheet' });
    const lastCol = studentSheet.getLastColumn();
    const data = studentSheet.getRange(1, 1, studentSheet.getLastRow(), lastCol).getValues();
    const headers = data[0];
    const pointsIdx = findColumnIndex(headers, ['points']);
    
    if (pointsIdx === -1) { return response({ status: 'error', message: "Database error." }); }
    let foundRow = -1; let currentPoints = 0;
    for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(payload.studentId)) { foundRow = i + 1; currentPoints = Number(data[i][pointsIdx]); if (isNaN(currentPoints)) currentPoints = 0; break; } }
    if (foundRow === -1) return response({ status: 'error', message: 'Student not found' });
    if (currentPoints < payload.cost) return response({ status: 'error', message: 'Not enough points' });
    
    let savedUrl = payload.dataUrl;
    if (savedUrl.startsWith('data:')) { try { savedUrl = saveMediaToDrive(savedUrl, "CustomSticker_" + payload.studentId); } catch (e) { if (savedUrl.length > 49000) return response({ status: 'error', message: e.message }); } }
    
    const newPoints = currentPoints - payload.cost;
    studentSheet.getRange(foundRow, pointsIdx + 1).setValue(newPoints);
    
    const stickerId = 'custom-' + Date.now();
    cSheet.appendRow([stickerId, payload.studentId, savedUrl, payload.prompt, new Date()]);
    
    // We don't strictly need to add custom stickers to StudentStickers because CustomStickers table already links them to StudentID
    // But for consistency, we could. However, getAllStudentProgress fetches CustomStickers separately.
    // So we will leave it as is (only in CustomStickers).
    
    const logSheet = ss.getSheetByName('PointLogs');
    if(logSheet) logSheet.appendRow([new Date(), payload.studentId, -payload.cost, 'Created AI Sticker', newPoints]);
    
    return response({ status: 'success', points: newPoints, sticker: { id: stickerId, dataUrl: savedUrl, prompt: payload.prompt } });
}

function syncStudentData(payload) {
    const ss = getSpreadsheet();
    const studentSheet = ss.getSheetByName('Students');
    const logsSheet = ss.getSheetByName('PointLogs');
    const customSheet = ss.getSheetByName('CustomStickers');
    if (!studentSheet || !logsSheet) return response({ status: 'error', message: 'Missing sheets' });
    const studentId = String(payload.studentId);
    let calculatedPoints = 0;
    const logData = logsSheet.getDataRange().getValues();
    for (let i = 1; i < logData.length; i++) { if (String(logData[i][1]) === studentId) { calculatedPoints += Number(logData[i][2] || 0); } }
    if (calculatedPoints < 0) calculatedPoints = 0;
    let validCustomIds = [];
    if (customSheet) { const cData = customSheet.getDataRange().getValues(); for (let i = 1; i < cData.length; i++) { if (cData[i][0]) validCustomIds.push(String(cData[i][0])); } }
    const sData = studentSheet.getDataRange().getValues();
    const headers = sData[0];
    const pointsIdx = findColumnIndex(headers, ['points']);
    const stickersIdx = findColumnIndex(headers, ['stickers', 'rewards']);
    let foundRow = -1;
    for (let i = 1; i < sData.length; i++) {
        if (String(sData[i][0]) === studentId) {
            foundRow = i + 1;
            let currentStickers = []; try { currentStickers = JSON.parse(sData[i][stickersIdx] || '[]'); } catch(e) {}
            const cleanStickers = currentStickers.filter(id => { const isCustom = String(id).startsWith('custom-') || String(id).startsWith('gift-'); if (!isCustom) return true; return validCustomIds.includes(id); });
            studentSheet.getRange(foundRow, pointsIdx + 1).setValue(calculatedPoints);
            studentSheet.getRange(foundRow, stickersIdx + 1).setValue(JSON.stringify(cleanStickers));
            break;
        }
    }
    return response({ status: 'success', points: calculatedPoints });
}

function getAllStudentProgress(startDate, endDate) {
  const ss = getSpreadsheet();
  const studentSheet = ss.getSheetByName('Students');
  if (!studentSheet) return response({ students: [] });
  
  const sData = studentSheet.getDataRange().getValues();
  if (sData.length <= 1) return response({ students: [] });
  const sHeaders = sData[0];
  
  const idIdx = findColumnIndex(sHeaders, ['id']);
  const nameIdx = findColumnIndex(sHeaders, ['name']);
  const lastIdx = findColumnIndex(sHeaders, ['lastlogin', 'lastactive']);
  const ptsIdx = findColumnIndex(sHeaders, ['points']);
  const permIdx = findColumnIndex(sHeaders, ['permissions', 'perm']);
  const stickIdx = findColumnIndex(sHeaders, ['stickers']);
  const rewardIdx = findColumnIndex(sHeaders, ['rewards']);
  const scriptIdx = findColumnIndex(sHeaders, ['script']);
  
  // Auxiliary Data
  const saSheet = ss.getSheetByName('StudentAssignments');
  const saData = saSheet ? saSheet.getDataRange().getValues() : [];
  
  const pSheet = ss.getSheetByName('Progress');
  const pData = pSheet ? pSheet.getDataRange().getValues() : [];
  
  const cSheet = ss.getSheetByName('CustomStickers');
  const cData = cSheet ? cSheet.getDataRange().getValues() : [];
  
  const ssSheet = ss.getSheetByName('StudentStickers');
  const ssData = ssSheet ? ssSheet.getDataRange().getValues() : [];
  
  const students = [];
  
  for (let i = 1; i < sData.length; i++) {
    const id = String(sData[i][idIdx]);
    const name = String(sData[i][nameIdx]);
    
    // Filter assignments for this student
    let completed = 0;
    let inProgress = 0;
    if (saData.length > 1) {
        for(let j=1; j<saData.length; j++) {
            if(String(saData[j][0]) === id) {
                const status = String(saData[j][2]);
                if(status === 'COMPLETED') completed++;
                else if(status === 'IN_PROGRESS') inProgress++;
            }
        }
    }
    
    // Filter progress/practice
    let totalPracticed = 0;
    let totalScore = 0;
    if (pData.length > 1) {
        for(let k=1; k<pData.length; k++) {
            // Match by name because Progress stores name (legacy decision)
            if(String(pData[k][1]).toLowerCase() === name.toLowerCase()) {
                totalPracticed++;
                totalScore += Number(pData[k][3] || 0);
            }
        }
    }
    const avg = totalPracticed > 0 ? Math.round(totalScore / totalPracticed) : 0;
    
    // Custom Stickers
    const myCustomStickers = [];
    if (cData.length > 1) {
        for(let m=1; m<cData.length; m++) {
            if(String(cData[m][1]) === id) {
                myCustomStickers.push({
                    id: String(cData[m][0]),
                    studentId: String(cData[m][1]),
                    dataUrl: String(cData[m][2]),
                    prompt: String(cData[m][3])
                });
            }
        }
    }
    
    let stickers = [];
    // 1. Legacy Stickers from JSON column
    try { if (stickIdx > -1 && sData[i][stickIdx]) stickers = JSON.parse(sData[i][stickIdx]); } catch(e) {}
    try { if (rewardIdx > -1 && rewardIdx !== stickIdx && sData[i][rewardIdx]) stickers = [...stickers, ...JSON.parse(sData[i][rewardIdx])]; } catch(e) {}
    
    // 2. New Stickers from StudentStickers Sheet
    if (ssData.length > 1) {
        for (let n = 1; n < ssData.length; n++) {
            if (String(ssData[n][1]) === id) {
                stickers.push(String(ssData[n][2]));
            }
        }
    }
    // Deduplicate
    stickers = [...new Set(stickers)];

    students.push({
        id: id,
        name: name,
        points: ptsIdx > -1 ? Number(sData[i][ptsIdx]) : 0,
        script: scriptIdx > -1 ? String(sData[i][scriptIdx]) : 'Simplified',
        assignmentsCompleted: completed,
        assignmentsInProgress: inProgress,
        totalPracticed: totalPracticed,
        averageScore: avg,
        lastActive: lastIdx > -1 ? sData[i][lastIdx] : '',
        canCreateStickers: permIdx > -1 ? (sData[i][permIdx] === true || sData[i][permIdx] === 'TRUE') : false,
        stickers: stickers,
        customStickers: myCustomStickers
    });
  }
  
  return response({ students: students });
}
