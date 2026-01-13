import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if we're using placeholder values
const isPlaceholder = !supabaseUrl || !supabaseAnonKey || 
                      supabaseUrl.includes('your_project_url') || 
                      supabaseAnonKey.includes('your_anon_key');

if (isPlaceholder) {
  console.warn('⚠️  Supabase credentials are not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
  console.warn('📖 See QUICK_START.md for setup instructions.');
}

// Use valid URL format even for placeholders (prevents Supabase client initialization error)
// The app will show errors when trying to use the API, but the UI will still render
const url = isPlaceholder ? 'https://placeholder.supabase.co' : supabaseUrl;
const key = isPlaceholder ? 'placeholder-key' : supabaseAnonKey;

export const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: !isPlaceholder,
    persistSession: !isPlaceholder,
    detectSessionInUrl: !isPlaceholder
  }
});
