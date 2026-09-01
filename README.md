# Orbit AI

**Orbit AI** is a lightweight timetable dashboard for students. It turns a
weekly school schedule into a glanceable view of today's classes, remaining
time, the next class, teacher, classroom, and upcoming events.

## Open the app

[**Launch Orbit AI**](https://jaypengx-collab.github.io/Orbit/)

The app runs entirely in the browser and is optimized for both desktop and
iPhone-sized screens.

## Features

- Current class, teacher, classroom, and live class or break timer
- Next-class preview with long-title wrapping and classroom details
- Odd/even week timetable support
- Exam and event countdowns
- Editable subjects, teachers, classrooms, periods, breaks, and assignments
- Drag-and-drop ordering plus numeric quick ordering
- Visual timetable assignment panel with staged changes and conflict warnings
- Time simulator for testing another day and time
- Dark/light appearance and custom color presets
- Timetable backup import and export
- Optional timetable image import with Gemini AI recognition

## Privacy and storage

Orbit AI has no account system or hosted database. Timetable data, preferences,
and saved style presets are stored in the browser's local storage.

Changing browsers, devices, or site origins creates a separate local dataset.
Use **Import / Export** in the editor before moving devices or clearing browser
data.

If Gemini image recognition is used, the API key is kept in that browser and is
sent to Google's Gemini API only when recognition is requested. Always review
the detected timetable before applying it.

## Run locally

Open [`index.html`](./index.html) in a modern browser. A local web server is
recommended when testing browser permissions or API integrations.

## Publish with GitHub Pages

1. Upload `index.html`, `README.md`, and `.nojekyll` to a repository.
2. In GitHub, open **Settings → Pages**.
3. Select **Deploy from a branch**, choose `main` and `/(root)`, then save.
4. Open the generated GitHub Pages URL.

The published app is available at:

```text
https://jaypengx-collab.github.io/Orbit/
```
