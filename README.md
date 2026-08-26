# Orbit AI

Orbit AI is a personal timetable dashboard for students. It turns a weekly school schedule into a quick, glanceable view of the current class, remaining time, next class, teacher, and classroom. The interface is designed for use during the school day on both desktop and mobile.

Everything runs in the browser. Your timetable and preferences are stored locally on the device, so no account or hosted database is required.

## What it does

- Shows the current day, current class, teacher, room, and live class or break timer.
- Displays the next class and supports alternating odd/even week schedules.
- Shows configurable exam or event countdowns on the dashboard.
- Lets you edit subjects, teachers, rooms, class times, breaks, and weekly assignments.
- Includes a time simulator for checking the dashboard at another day and time.
- Provides light, dark, and visual style controls with custom colors and presets.
- Exports and imports a compact timetable backup for moving settings between browsers.
- Imports a timetable image with Gemini AI and presents the detected data for review before saving.

## Getting started

1. Open `index.html` in a modern browser, or publish this folder with GitHub Pages.
2. Open the edit tool from the dashboard.
3. Add or update your subjects and teachers, then assign them to the weekly timetable.
4. Configure class times, breaks, rooms, and countdown events as needed.
5. Save the settings. Orbit AI will use them automatically on future visits from that browser.

For image import, add your Gemini API key when prompted. The key is stored only in that browser's local storage and is sent to Google's Gemini API only when you request timetable recognition. Review the detected schedule before confirming the import.

## Data and backups

Orbit AI stores timetable data in the browser's `localStorage`. Clearing browser site data, using a different browser or device, or opening the app in a different site origin creates a separate set of settings. Use **Import / Export** in the editor to create a backup before changing devices or clearing site data.

This release intentionally uses a new storage schema. On its first launch, it resets previously stored Orbit settings in that browser so the updated data model starts cleanly. Existing exported backups from an older schema may need to be recreated.

## Publish with GitHub Pages

1. Create a repository, for example `orbit-ai`.
2. Upload `index.html` and `README.md` to the repository root.
3. Open **Settings → Pages** on GitHub.
4. Choose **Deploy from a branch**, select `main` and `/(root)`, then save.
5. Open the published URL in Safari or another modern browser.

The URL will be `https://YOUR-GITHUB-NAME.github.io/orbit-ai/`.

## Run locally

Because Orbit AI is a self-contained HTML app, you can open `index.html` directly. A local web server is recommended when testing browser permissions or API integrations.
