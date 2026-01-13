# Setup Guide

This guide will help you set up the OptiFinance app with Supabase backend.

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works fine)
- npm or yarn package manager

## Step-by-Step Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - Name: `optifinance` (or your preferred name)
   - Database Password: Choose a strong password (save it!)
   - Region: Choose closest to you
5. Click "Create new project"
6. Wait 2-3 minutes for the project to initialize

### 2. Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** > **API**
2. Copy these values:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon/public key** (a long JWT token)

### 3. Set Up Environment Variables

1. In the project root, create a `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and add your credentials:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

### 4. Set Up the Database

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Open the file `database/schema.sql` from this project
4. Copy ALL the SQL content
5. Paste it into the SQL Editor
6. Click "Run" (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned"

This creates:
- All database tables
- Row Level Security policies
- Triggers for automatic user_id setting
- Timestamp updates

### 5. Set Up File Storage

1. In Supabase dashboard, go to **Storage**
2. Click "Create a new bucket"
3. Name: `files`
4. Make it **Public** (toggle on)
5. Click "Create bucket"
6. Optional: Go to **Policies** and ensure users can upload files

### 6. Configure Authentication (Optional but Recommended)

The app uses Supabase Auth. You can:

**Option A: Use Supabase Auth UI (Easiest)**
1. Go to **Authentication** > **URL Configuration**
2. Add your app URL to "Site URL" (e.g., `http://localhost:5173`)
3. Add redirect URLs for production

**Option B: Build Custom Auth (Advanced)**
- Create login/signup pages
- Use Supabase auth methods: `supabase.auth.signUp()`, `supabase.auth.signInWithPassword()`

### 7. Install Dependencies

```bash
npm install
```

This will install:
- React and related libraries
- Supabase JavaScript client
- UI components (Radix UI, Tailwind)
- Other dependencies

### 8. Run the Development Server

```bash
npm run dev
```

The app should start on `http://localhost:5173`

### 9. Create Your First User

Since there's no login UI yet, you can create a user via Supabase:

1. Go to **Authentication** > **Users** in Supabase dashboard
2. Click "Add user" > "Create new user"
3. Enter email and password
4. Or use SQL Editor:
   ```sql
   -- This creates a test user (you'll need to set password via email or dashboard)
   INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
   VALUES ('test@example.com', crypt('yourpassword', gen_salt('bf')), NOW());
   ```

### 10. Test the App

1. Open the app in your browser
2. You should see the OptiFinance interface
3. Try accessing different pages
4. If you see errors, check:
   - Browser console for errors
   - Supabase dashboard > Logs for database errors
   - Environment variables are set correctly

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure `.env` file exists in the root directory
- Check that variable names start with `VITE_`
- Restart the dev server after changing `.env`

### "Row Level Security policy violation"
- Make sure you're logged in
- Check that RLS policies were created (run schema.sql again)
- Verify user_id is being set correctly

### "Table does not exist"
- Run the schema.sql file in Supabase SQL Editor
- Check that all tables were created (Storage > Tables)

### Authentication issues
- Check Supabase Auth settings
- Verify email provider is enabled
- Check browser console for auth errors

### File upload errors
- Ensure `files` bucket exists and is public
- Check Storage policies allow uploads
- Verify file size limits

## Next Steps

1. **Set up authentication UI** (if you need user signup/login)
2. **Configure integrations**:
   - LLM service (OpenAI, Anthropic) for AI features
   - Email service (Resend, SendGrid) for email sending
   - SMS service for invoice notifications
3. **Customize the app** to your needs
4. **Deploy** to production (Vercel, Netlify, etc.)

## Production Deployment

When deploying:

1. Set environment variables in your hosting platform
2. Update Supabase Auth URL configuration with production URL
3. Update CORS settings if needed
4. Run `npm run build` to create production build
5. Deploy the `dist` folder

For detailed deployment instructions, see the main README.md
