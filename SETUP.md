# PhD Visit Day Scheduler — Setup Guide

A lightweight faculty meeting scheduler for admitted student visit days.  
**Students** get a clean booking page. **You** manage everything in a Google Sheet.  
**Faculty** get Google Calendar invites — no accounts or onboarding needed.

---

## Architecture

```
Students visit:  yourname.github.io/phd-visit
        ↕ (API calls)
Google Apps Script  ←→  Google Sheet (your database)
        ↓
Google Calendar (sends invites to faculty + students)
```

---

## Step 1: Set up the Google Sheet + Apps Script

1. **Create a new Google Sheet** in your Columbia LionMail account.
   Name it something like "PhD Visit Scheduler".

2. Go to **Extensions → Apps Script**. This opens the script editor.

3. **Delete** any default code in `Code.gs`.

4. **Copy-paste** the entire contents of `code.gs` from this repo into the editor.

5. **Save** (Ctrl+S / Cmd+S).

6. In the toolbar, select the function **`setupSheets`** from the dropdown, then click **Run** (▶).
   - You'll be prompted to authorize the script. Click through the permissions.
   - This creates two sheets: **Config** and **Bookings** with sample data.

7. **Edit the Config sheet** with your real data:
   - **B1**: Your event title (e.g., "CS PhD Admitted Student Visit Day")
   - **B2**: Event date (e.g., "April 10, 2026")
   - **B3**: Slot duration in minutes (e.g., 30)
   - **Column D**: List all time slots (one per row, e.g., "9:00 AM", "9:30 AM", ...)
   - **Column F**: Faculty names
   - **Column G**: Research areas
   - **Column H**: Unavailable time slots, comma-separated (e.g., "10:00 AM, 10:30 AM")
   - **Column I**: Faculty email addresses (used for calendar invites)

8. **Deploy as a web app**:
   - Click **Deploy → New deployment**
   - Click the gear icon → select **Web app**
   - Set "Execute as" → **Me**
   - Set "Who has access" → **Anyone**
   - Click **Deploy**
   - **Copy the deployment URL** (looks like `https://script.google.com/macros/s/.../exec`)

> **Important**: Every time you edit `code.gs`, you must create a **new deployment**  
> (Deploy → Manage deployments → Edit → New version → Deploy).  
> For Config sheet edits (faculty, times), no redeployment is needed.

---

## Step 2: Set up GitHub Pages

1. **Create a new GitHub repository** (e.g., `phd-visit`). Public is fine.

2. **Upload `index.html`** to the repo (or push via git).

3. **Edit `index.html`** — near the top, find these two lines:
   ```js
   var API_URL = "YOUR_APPS_SCRIPT_URL_HERE";
   var API_CONFIGURED = false;
   ```
   Replace with your actual deployment URL and set to true:
   ```js
   var API_URL = "https://script.google.com/macros/s/YOUR_ID_HERE/exec";
   var API_CONFIGURED = true;
   ```

4. **Enable GitHub Pages**:
   - Go to repo **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)**
   - Save

5. After a minute or two, your site is live at:  
   `https://yourname.github.io/phd-visit/`

---

## Step 3: Managing the schedule

### Adding / editing faculty
Edit the **Config** sheet directly. Add rows in columns F–I. Changes take effect immediately (no redeployment needed).

### Adding / removing time slots
Edit column D in the **Config** sheet.

### Viewing all bookings
Open the **Bookings** sheet. Every booking is a row with: Faculty, Time, Student Name, Student Email, Confirmation Code, Status, Booked At, Calendar Event ID.

### Manually adding a booking (e.g., for Great Firewall students)
Add a row directly to the Bookings sheet:
- Faculty name (must match Config exactly)
- Time slot (must match Config exactly)  
- Student name and email
- Generate any 6-character code (or leave blank)
- Set status to "active"

### Cancelling a booking
Either: change the Status cell to "cancelled" in the Bookings sheet, or the student can cancel via their confirmation code on the website.

---

## Step 4: Sync to Google Calendar (send faculty invites)

Once bookings are finalized:

1. Open your Apps Script editor (Extensions → Apps Script from the Sheet).

2. Select **`syncCalendarManual`** from the function dropdown.

3. Click **Run** (▶).

4. The script will:
   - Create a Google Calendar event for each active booking
   - Set the event title to "Meeting: [Student] ↔ [Faculty]"
   - **Send email invites** to both the student and the faculty member
   - Store the Calendar event ID in the Bookings sheet (column H) so it won't duplicate on re-run

> **Note**: Calendar invites come from your Google account (the sheet owner).  
> Faculty will see it as a normal calendar invite they can accept/decline.  
> Run this only when you're ready — you can run it multiple times safely (it skips already-synced bookings).

### Important: Calendar API permissions
The first time you run `syncCalendarManual`, Google will ask for Calendar permissions. Click through to approve.

---

## Step 5: Share with students

Send admitted students the GitHub Pages URL. That's it.

For students behind the Great Firewall who can't access the site:
- Ask them to email you their top faculty preferences
- Book on their behalf by adding rows to the Bookings sheet

---

## Exporting the schedule

### Quick per-faculty summary
Filter the Bookings sheet by the Faculty column, or create a pivot table:
- Rows: Faculty
- Columns: Time
- Values: Student Name

### CSV export
Download the Bookings sheet as CSV: File → Download → Comma Separated Values

---

## Troubleshooting

**"Error loading schedule"**: Check that API_URL is correct and the Apps Script is deployed with "Anyone" access.

**CORS errors**: Apps Script handles CORS automatically when deployed as a web app. If you see CORS issues, make sure you deployed (not just saved) and that the URL ends in `/exec` (not `/dev`).

**Slots not updating in real time**: The page fetches fresh data on load and after each booking. If two students book simultaneously, the server-side lock prevents double-booking — one will get an error message asking them to pick another slot.

**Calendar sync not working**: Make sure faculty emails are filled in column I of the Config sheet. The script uses CalendarApp, which requires the Calendar service to be enabled (it should be by default).

**Redeploying after code changes**: You must create a new deployment version. Go to Deploy → Manage deployments → click the pencil icon → set Version to "New version" → Deploy.
