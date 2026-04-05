# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome extension (Manifest V3) that auto-fills job application details from any job posting page and logs them to a Google Sheet with one click.

## Loading / Reloading the Extension

There is no build step. The extension is loaded directly as unpacked source:

1. Go to `chrome://extensions`, enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder
3. After any code change, click the **reload icon** on the extension card

To regenerate icons (only needed once or if icons change):
```bash
pip install Pillow
python extension/generate_icons.py
```

## Architecture

All logic lives in two files — there is no bundler, transpiler, or node_modules.

### `extension/popup.js` — three distinct responsibilities

1. **Page extraction** (`extractJobDataFromPage`): A self-contained function injected into the active tab via `chrome.scripting.executeScript`. It runs in page context (not extension context), so it cannot reference any variables from `popup.js`. Extraction priority:
   - JSON-LD `JobPosting` schema (`<script type="application/ld+json">`) — covers Indeed, Greenhouse, Lever, Workday, Recruitee
   - Site-specific CSS selectors — LinkedIn, Indeed, Glassdoor, Lever, Greenhouse, Workday, Ashby
   - OG meta tags + page title parsing as final fallback

2. **Sheets API** (`sheetsRequest`, `appendRow`, `getNextRowNumber`): Direct REST calls to `https://sheets.googleapis.com/v4/spreadsheets` using a Bearer token from `chrome.identity.getAuthToken`. The "Days Since App" column (col K) is always written as the formula `=TODAY()-C{row}` so it auto-updates.

3. **UI / init** (`DOMContentLoaded`): Disables the Log button while extraction runs ("Reading page…"), then populates all form fields. Settings (spreadsheetId, sheetName) are persisted in `chrome.storage.sync`.

### `extension/manifest.json` — key config

- `oauth2.client_id` — must be a **Chrome Extension** type OAuth client from Google Cloud Console. The extension ID from `chrome://extensions` must be registered in that client's "Application ID" field.
- Permissions: `identity` (OAuth), `activeTab` + `scripting` (DOM injection), `storage` (settings).

## Google Sheet Column Order

The row written by `appendRow` maps exactly to these columns (A→K):

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Company | Role | Date Applied | Link | Status | Location | Salary | Contact Info | Notes | Resume Version | Days Since App |

If columns are reordered in the sheet, the array in `appendRow` must be updated to match.

## OAuth Setup (when client ID changes)

1. Update `oauth2.client_id` in `manifest.json`
2. Reload the extension — the new Extension ID may differ if loaded fresh
3. Register the new Extension ID in the Google Cloud OAuth client's "Application ID" field
4. If token is stale: `background.js` clears all cached tokens on extension update automatically
