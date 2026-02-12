
# HanziMaster 🍎

An AI-powered Chinese handwriting practice application for schools.

## Features

- **Teacher Dashboard**: Create assignments, manage class roster, and view progress reports.
- **Student Dashboard**: Practice writing, pinyin, and sentence building.
- **AI Feedback**: Real-time handwriting grading using Gemini Vision.
- **Sticker Store**: Gamified reward system with AI-generated stickers.
- **Google Sheets Backend**: Easy database management via Google Apps Script.

## Setup (Local)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory (same folder as `package.json`). Add the following keys:
   ```env
   # 1. Your Google Gemini API Key
   API_KEY=AIzaSy...

   # 2. Your Google Apps Script Web App URL (Optional - Pre-configures the app)
   # Must end with /exec
   REACT_APP_BACKEND_URL=https://script.google.com/macros/s/AKfycbx.../exec
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Deployment (Netlify)

1. **Push to GitHub**: Ensure your code is pushed to a GitHub repository.
2. **Import to Netlify**:
   - Log in to Netlify.
   - Click "Add new site" -> "Import an existing project".
   - Select your GitHub repository.
3. **Configure Build**:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Environment Variables (Important!)**:
   - In Netlify, go to **Site configuration > Environment variables**.
   - Add `API_KEY`: Your Google Gemini API Key.
   - Add `REACT_APP_BACKEND_URL`: Your Google Apps Script Web App URL.
   *Note: Adding the Backend URL here means you won't need to manually setup the connection in the app settings.*
5. **Deploy**: Click "Deploy site".

## Switching GitHub Repositories

If you want to save this code to a **different** GitHub repository than the one currently configured:

1. **Create the new repository** on GitHub.com (do not initialize with README/License).
2. **Open your Terminal** in this project folder.
3. **Run these commands**:

   ```bash
   # 1. Remove the link to the old repository
   git remote remove origin

   # 2. Add the link to your NEW repository
   git remote add origin https://github.com/YOUR_USERNAME/NEW_REPO_NAME.git

   # 3. Rename branch to main (if not already)
   git branch -M main

   # 4. Push the code
   git push -u origin main
   ```

## How to Get the "Backend URL" (Google Apps Script)

1. Open a new Google Sheet.
2. Go to **Extensions** > **Apps Script**.
3. Copy the code from `Code.gs` (in this repo) and paste it into the script editor.
4. **Save** the project.
5. Click the blue **Deploy** button > **New Deployment**.
6. **Select type**: Click the gear icon and select **Web App**.
7. **Fill in the details** (Crucial Step):
   - **Description**: `v1` (or any text)
   - **Execute as**: `Me` (your email)
   - **Who has access**: `Anyone` (Must be 'Anyone', or the app cannot connect!)
8. Click **Deploy**.
9. Copy the **Web App URL** (it ends with `/exec`). This is your `REACT_APP_BACKEND_URL`.

## Connecting the Backend (Manual Method)

If you didn't set the `REACT_APP_BACKEND_URL` environment variable:
1. Open your deployed website.
2. Click the **Gear Icon (⚙️)** in the top right corner.
3. Enter `4465` as the PIN.
4. Paste your **Web App URL** (ending in `/exec`).
5. Click **Test Connection** then **Save Config**.
