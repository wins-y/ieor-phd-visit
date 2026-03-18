# PhD Visit Day Scheduler

A lightweight web app for scheduling 1:1 faculty meetings during admitted PhD student visit days.

**No accounts needed** — students book via a simple web page, you manage everything in a Google Sheet, and faculty receive Google Calendar invites.

## How it works

- **Students** visit a single URL, select a faculty member from a dropdown, and book open 30-minute slots
- **You** manage faculty, time slots, and availability in a Google Sheet
- **Faculty** do nothing — they get calendar invites once you finalize the schedule
- Slots show three clear states: **open**, **booked**, or **not available**
- Students get a confirmation code to look up or cancel their bookings

## Tech stack

- `index.html` — Single-file frontend (vanilla HTML/CSS/JS, no build step)
- `code.gs` — Google Apps Script backend (reads/writes to a Google Sheet)
- Google Sheets — Your database and admin interface
- Google Calendar API — Sends meeting invites to faculty and students
- GitHub Pages — Free static hosting

## Quick start

1. Create a Google Sheet and add the Apps Script (`code.gs`)
2. Run `setupSheets()` to initialize
3. Edit the Config sheet with your faculty and schedule
4. Deploy the Apps Script as a web app
5. Put `index.html` in a GitHub repo with your script URL
6. Enable GitHub Pages
7. Share the link with students

See **[SETUP.md](SETUP.md)** for detailed step-by-step instructions.

## Features

- Dropdown faculty selector (no cluttered grid of 20 names)
- Real-time slot status: open / booked / unavailable
- Conflict detection (students can't double-book a time slot)
- Confirmation codes for self-service booking management
- Local memory remembers your name/email and highlights your bookings
- Google Calendar sync with faculty email invites
- Works behind the Great Firewall (GitHub Pages is generally accessible)
- Mobile-friendly responsive design
- No frameworks, no build tools, no dependencies
