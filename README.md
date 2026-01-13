# OptiFinance App

A comprehensive finance management application for clinics, migrated from Base44 to Supabase.

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to be set up (takes a few minutes)
3. Note your project URL and anon key from Settings > API

### 2. Set Up Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your Supabase credentials to `.env`:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### 3. Set Up the Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `database/schema.sql`
4. Run the SQL script to create all tables, policies, and functions

### 4. Set Up Storage Bucket

1. Go to Storage in your Supabase dashboard
2. Create a new bucket named `files`
3. Make it public (or configure policies as needed)
4. This bucket is used for file uploads (receipts, invoices, etc.)

### 5. Install Dependencies

```bash
npm install
```

### 6. Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port Vite assigns).

## Authentication

The app uses Supabase Authentication. Users need to sign up/sign in through Supabase Auth.

### Setting Up Authentication

1. Go to Authentication > Providers in your Supabase dashboard
2. Enable Email provider (enabled by default)
3. Configure any other providers you want (Google, GitHub, etc.)

### First-Time User Setup

After a user signs up, you may need to create a profile entry. The app will handle this automatically through the `updateMe` function, but you can also set up a database trigger to create a profile automatically.

## Features

- **Dashboard**: Financial overview with charts and statistics
- **Quick Add**: Fast entry for treatments and expenses (with AI voice input)
- **Records**: View and manage all treatment entries and expenses
- **Invoices**: Generate and manage invoices
- **Pricing**: Manage treatment pricing and competitor analysis
- **Reports**: Export financial reports
- **Compliance**: Tax settings and compliance tracking
- **Consultant**: AI-powered business consultant
- **Catalogue**: Manage patients, practitioners, and treatment catalog

## Backend Architecture

The app uses Supabase as the backend:
- **PostgreSQL Database**: All data stored in Supabase
- **Authentication**: Supabase Auth for user management
- **Storage**: Supabase Storage for file uploads
- **Row Level Security**: Data isolation per user

## Custom Functions

The following functions are placeholders and need to be implemented:

- **sendInvoiceSMS**: Send SMS notifications for invoices
- **consultantChat**: AI consultant chat functionality
- **verifySubscription**: Subscription verification
- **createGoCardlessPayment**: Payment processing

These can be implemented as:
- Supabase Edge Functions
- External API endpoints
- Serverless functions (Vercel, Netlify, etc.)

## Integrations

The following integrations are placeholders and need to be configured:

- **InvokeLLM**: LLM integration (OpenAI, Anthropic, etc.)
- **SendEmail**: Email service (Resend, SendGrid, etc.)
- **GenerateImage**: Image generation (DALL-E, Midjourney API, etc.)

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory, ready to deploy to any static hosting service (Vercel, Netlify, etc.).

## Deployment and Subscriptions

For detailed instructions on deploying the app and setting up Stripe subscriptions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

Quick overview:
1. Deploy frontend to Vercel
2. Set up production Supabase project
3. Configure Stripe account and products
4. Deploy Supabase Edge Functions
5. Set environment variables
6. Test and go live

## Migration Notes

This app was migrated from Base44 to Supabase. The UI remains completely unchanged - only the backend has been replaced. All Base44 SDK calls have been replaced with Supabase equivalents while maintaining the same interface, so no changes were needed to the React components.
