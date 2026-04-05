# Job Tracker Chrome Extension — Setup Guide

## Step 1 — Google Cloud: Enable Sheets API + Create OAuth Client

1. Go to https://console.cloud.google.com
2. Create a new project (or reuse one)
3. **APIs & Services → Enable APIs** → search "Google Sheets API" → Enable
4. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Chrome Extension**
   - Name: "Job Tracker"
   - For "Application ID": leave blank for now (fill in after loading the extension)
5. Copy the **Client ID** (looks like `123456789-abc.apps.googleusercontent.com`)

## Step 2 — Put the Client ID in manifest.json

Open `manifest.json` and replace the placeholder:
```json
"oauth2": {
  "client_id": "YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  ...
}
```

## Step 3 — Generate Icons

```bash
pip install Pillow
python generate_icons.py
```
This creates `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`.

## Step 4 — Load the Extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Copy the **Extension ID** shown on the card (e.g. `abcdefghijklmnopqrstuvwxyz123456`)

## Step 5 — Add Extension ID to OAuth Client

1. Back in Google Cloud Console → your OAuth Client ID → Edit
2. In **Application ID** paste the Extension ID from Step 4
3. Save

## Step 6 — Configure the Extension

1. Click the extension icon in Chrome toolbar
2. Click the **gear icon** (top right of popup)
3. Paste your **Spreadsheet ID** (from the Sheet URL: `.../spreadsheets/d/YOUR_ID/edit`)
4. Enter the **Sheet tab name** (e.g. `Sheet1`)
5. Click **Save Settings**

## Usage

Open any job posting → click the extension icon → fill in details → **Log Application**.

The extension auto-fills:
- **URL** from the current tab
- **Company / Role** parsed from the page title
- **Date** set to today
- **Days Since App** written as a live formula that updates daily
