// ============================================================
// PHD VISIT DAY SCHEDULER — Google Apps Script Backend
// ============================================================
// 1. Create a new Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Paste this entire file, replacing any default code
// 4. Run setupSheets() once from the toolbar (Run > setupSheets)
// 5. Deploy: Deploy > New deployment > Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 6. Copy the deployment URL into your index.html (API_URL variable)
// ============================================================

// ========== HTTP HANDLERS ==========

function doGet(e) {
  var action = (e.parameter.action || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    if (action === "getConfig") return ok(getConfig(ss));
    if (action === "getBookings") return ok(getPublicBookings(ss));
    if (action === "lookup") {
      var q = (e.parameter.q || "").trim();
      return ok(lookupBookings(ss, q));
    }
    return ok({ error: "Unknown action: " + action });
  } catch (err) {
    return ok({ error: err.message });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (err) {
    return ok({ error: "Server busy. Please try again in a moment." });
  }
  try {
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === "book") return ok(bookSlot(ss, body));
    if (body.action === "cancel") return ok(cancelBooking(ss, body.code));
    if (body.action === "syncCalendar") return ok(syncAllToCalendar(ss));
    return ok({ error: "Unknown action" });
  } catch (err) {
    return ok({ error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function ok(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== CONFIG ==========

function getConfig(ss) {
  var cs = ss.getSheetByName("Config");
  if (!cs) return { error: "Config sheet not found. Run setupSheets() first." };

  var eventTitle = cs.getRange("B1").getValue() || "PhD Visit Day";
  var eventDate  = cs.getRange("B2").getValue() || "";
  var slotMin    = cs.getRange("B3").getValue() || 30;

  var timeSlots = [];
  var td = cs.getRange("D2:D30").getValues();
  for (var i = 0; i < td.length; i++) {
    if (td[i][0] !== "") timeSlots.push(td[i][0].toString().trim());
  }

  var faculty = [];
  var fd = cs.getRange("F2:H60").getValues();
  for (var i = 0; i < fd.length; i++) {
    if (fd[i][0] === "") continue;
    var ua = fd[i][2] ? fd[i][2].toString().split(",").map(function(s){return s.trim();}).filter(Boolean) : [];
    faculty.push({ name: fd[i][0].toString().trim(), area: fd[i][1] ? fd[i][1].toString().trim() : "", unavailable: ua });
  }

  return { eventTitle: eventTitle, eventDate: eventDate, slotDuration: slotMin, timeSlots: timeSlots, faculty: faculty };
}

// ========== BOOKINGS ==========

function getAllBookings(ss) {
  var bs = ss.getSheetByName("Bookings");
  if (!bs || bs.getLastRow() < 2) return [];
  var data = bs.getRange(2, 1, bs.getLastRow() - 1, 8).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === "") continue;
    out.push({
      faculty: data[i][0], time: data[i][1], name: data[i][2], email: data[i][3],
      code: data[i][4], status: data[i][5] || "active", bookedAt: data[i][6] || "",
      calEventId: data[i][7] || "", row: i + 2
    });
  }
  return out;
}

// Public: returns slot status without student details
function getPublicBookings(ss) {
  var all = getAllBookings(ss);
  return all.filter(function(b){ return b.status === "active"; }).map(function(b){
    return { faculty: b.faculty, time: b.time, status: "booked" };
  });
}

function lookupBookings(ss, q) {
  if (!q) return [];
  var all = getAllBookings(ss);
  var upper = q.toUpperCase();
  var lower = q.toLowerCase();
  return all.filter(function(b){
    return b.status === "active" && (b.code === upper || b.email.toLowerCase() === lower);
  }).map(function(b){
    return { faculty: b.faculty, time: b.time, name: b.name, email: b.email, code: b.code };
  });
}

function bookSlot(ss, p) {
  var faculty = (p.faculty || "").trim();
  var time    = (p.time || "").trim();
  var name    = (p.name || "").trim();
  var email   = (p.email || "").trim();
  if (!faculty || !time || !name || !email) return { error: "Please fill in all fields." };

  var all = getAllBookings(ss);

  // Check slot not taken
  for (var i = 0; i < all.length; i++) {
    if (all[i].faculty === faculty && all[i].time === time && all[i].status === "active") {
      return { error: "This slot was just taken by another student. Please pick a different time." };
    }
  }

  // Check student not double-booked at same time
  var el = email.toLowerCase();
  for (var i = 0; i < all.length; i++) {
    if (all[i].email.toLowerCase() === el && all[i].time === time && all[i].status === "active") {
      return { error: "You already have a meeting at " + time + ". Cancel it first if you'd like to switch." };
    }
  }

  var code = makeCode();
  var bs = ss.getSheetByName("Bookings");
  bs.appendRow([faculty, time, name, email, code, "active", new Date().toISOString(), ""]);

  return { success: true, code: code, faculty: faculty, time: time };
}

function cancelBooking(ss, code) {
  if (!code) return { error: "Please enter a confirmation code." };
  var bs = ss.getSheetByName("Bookings");
  var all = getAllBookings(ss);
  for (var i = 0; i < all.length; i++) {
    if (all[i].code === code.toUpperCase().trim() && all[i].status === "active") {
      bs.getRange(all[i].row, 6).setValue("cancelled");
      // Try to delete calendar event if it exists
      if (all[i].calEventId) {
        try { CalendarApp.getDefaultCalendar().getEventById(all[i].calEventId).deleteEvent(); } catch(e) {}
      }
      return { success: true };
    }
  }
  return { error: "Booking not found or already cancelled." };
}

// ========== GOOGLE CALENDAR SYNC ==========

function syncAllToCalendar(ss) {
  var config = getConfig(ss);
  var all = getAllBookings(ss);
  var bs = ss.getSheetByName("Bookings");
  var active = all.filter(function(b){ return b.status === "active"; });
  var created = 0;
  var skipped = 0;
  var errors = [];

  // Parse event date
  var dateStr = config.eventDate;
  var eventDateObj = new Date(dateStr);
  if (isNaN(eventDateObj.getTime())) {
    return { error: "Could not parse event date: " + dateStr + ". Use a format like 'April 10, 2026'." };
  }

  // Build faculty email lookup from Config sheet column I
  var cs = ss.getSheetByName("Config");
  var emailData = cs.getRange("I2:I60").getValues();
  var facList = cs.getRange("F2:F60").getValues();
  var facultyEmails = {};
  for (var i = 0; i < facList.length; i++) {
    if (facList[i][0] && emailData[i][0]) {
      facultyEmails[facList[i][0].toString().trim()] = emailData[i][0].toString().trim();
    }
  }

  for (var i = 0; i < active.length; i++) {
    var b = active[i];
    if (b.calEventId) { skipped++; continue; } // Already synced

    try {
      var startDT = parseSlotTime(eventDateObj, b.time);
      var endDT = new Date(startDT.getTime() + config.slotDuration * 60000);
      var title = "Meeting: " + b.name + " ↔ " + b.faculty;
      var desc = "PhD Visit Day 1:1 Meeting\n\nStudent: " + b.name + " (" + b.email + ")\nFaculty: " + b.faculty + "\nTime: " + b.time + "\nConfirmation: " + b.code;

      var guests = b.email; // Always invite the student
      var facEmail = facultyEmails[b.faculty];
      if (facEmail) guests += "," + facEmail;

      var event = CalendarApp.getDefaultCalendar().createEvent(title, startDT, endDT, {
        description: desc,
        guests: guests,
        sendInvites: true
      });

      // Save event ID back to sheet
      bs.getRange(b.row, 8).setValue(event.getId());
      created++;
    } catch (err) {
      errors.push(b.faculty + " " + b.time + ": " + err.message);
    }
  }

  var msg = "Created " + created + " calendar event(s).";
  if (skipped > 0) msg += " Skipped " + skipped + " already synced.";
  if (errors.length > 0) msg += " Errors: " + errors.join("; ");
  return { success: true, message: msg };
}

// Run this manually from Apps Script to sync without the web UI
function syncCalendarManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = syncAllToCalendar(ss);
  SpreadsheetApp.getUi().alert(result.message || result.error || JSON.stringify(result));
}

function parseSlotTime(dateObj, timeStr) {
  // timeStr like "9:00 AM" or "1:30 PM"
  var parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!parts) throw new Error("Cannot parse time: " + timeStr);
  var h = parseInt(parts[1]);
  var m = parseInt(parts[2]);
  var ampm = parts[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  var dt = new Date(dateObj);
  dt.setHours(h, m, 0, 0);
  return dt;
}

// ========== HELPERS ==========

function makeCode() {
  var c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var o = "";
  for (var i = 0; i < 6; i++) o += c.charAt(Math.floor(Math.random() * c.length));
  return o;
}

// ========== INITIAL SETUP ==========
// Run this ONCE to create the sheets with correct headers.

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Config sheet ---
  var cs = ss.getSheetByName("Config") || ss.insertSheet("Config");
  cs.clear();
  cs.getRange("A1").setValue("Event Title");
  cs.getRange("B1").setValue("CS PhD Admitted Student Visit Day");
  cs.getRange("A2").setValue("Event Date");
  cs.getRange("B2").setValue("April 10, 2026");
  cs.getRange("A3").setValue("Slot Duration (min)");
  cs.getRange("B3").setValue(30);

  cs.getRange("D1").setValue("Time Slots");
  var slots = ["9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
               "1:00 PM","1:30 PM","2:00 PM","2:30 PM","3:00 PM","3:30 PM","4:00 PM"];
  for (var i = 0; i < slots.length; i++) cs.getRange("D" + (i+2)).setValue(slots[i]);

  cs.getRange("F1").setValue("Faculty Name");
  cs.getRange("G1").setValue("Research Area");
  cs.getRange("H1").setValue("Unavailable (comma-sep)");
  cs.getRange("I1").setValue("Email");

  var sample = [
    ["Prof. Alice Chen",   "Machine Learning",  "10:00 AM, 10:30 AM",  "achen@columbia.edu"],
    ["Prof. Bob Martinez", "Systems",            "9:00 AM, 9:30 AM",    "bmart@columbia.edu"],
    ["Prof. Carol Davis",  "NLP",                "2:00 PM, 2:30 PM",    "cdavis@columbia.edu"],
    ["Prof. David Kim",    "Computer Vision",    "",                     "dkim@columbia.edu"],
    ["Prof. Elena Volkov", "Theory",             "11:00 AM, 11:30 AM",  "evolkov@columbia.edu"],
    ["Prof. Frank Osei",   "Robotics",           "3:00 PM, 3:30 PM",    "fosei@columbia.edu"],
    ["Prof. Grace Liu",    "Security",           "1:00 PM",             "gliu@columbia.edu"],
    ["Prof. Henry Park",   "HCI",                "9:00 AM",             "hpark@columbia.edu"],
  ];
  for (var i = 0; i < sample.length; i++) {
    cs.getRange("F"+(i+2)).setValue(sample[i][0]);
    cs.getRange("G"+(i+2)).setValue(sample[i][1]);
    cs.getRange("H"+(i+2)).setValue(sample[i][2]);
    cs.getRange("I"+(i+2)).setValue(sample[i][3]);
  }
  cs.autoResizeColumns(1, 9);

  // --- Bookings sheet ---
  var bs = ss.getSheetByName("Bookings") || ss.insertSheet("Bookings");
  bs.clear();
  bs.getRange("A1:H1").setValues([["Faculty","Time","Student Name","Student Email","Code","Status","Booked At","Cal Event ID"]]);
  bs.getRange("A1:H1").setFontWeight("bold");
  bs.setFrozenRows(1);
  bs.autoResizeColumns(1, 8);

  SpreadsheetApp.getUi().alert("Setup complete! Edit the Config sheet with your real faculty and times, then deploy as a web app.");
}
