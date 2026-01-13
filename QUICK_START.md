# Quick Start Guide

Get your OptiFinance app running in 5 minutes!

## Prerequisites
- Node.js 18+ installed
- A Supabase account (sign up at supabase.com - it's free)

## Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait 2-3 minutes for setup
4. Go to Settings > API
5. Copy your **Project URL** and **anon key**

### 3. Configure Environment
Create `.env` file in the root directory:
```bash
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 4. Set Up Database
1. In Supabase dashboard, go to **SQL Editor**
2. Open `database/schema.sql` from this project
3. Copy all SQL content
4. Paste into SQL Editor
5. Click **Run**

### 5. Create Storage Bucket
1. Go to **Storage** in Supabase dashboard
2. Click **Create bucket**
3. Name: `files`
4. Make it **Public**
5. Click **Create**

### 6. Run the App
```bash
npm run dev
```

Visit `http://localhost:5173`

## Authentication

The app uses Supabase Auth. To create a user:
1. Go to **Authentication** > **Users** in Supabase dashboard
2. Click **Add user** > **Create new user**
3. Enter email and password

Or implement a login page (see SETUP.md for details).

## That's It! 🎉

Your app should now be running. If you see errors, check:
- Environment variables are set correctly
- Database schema was run successfully
- Storage bucket exists and is public

For detailed setup instructions, see **SETUP.md**
For migration notes, see **MIGRATION_NOTES.md**
