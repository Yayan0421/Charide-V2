// Supabase Configuration
const SUPABASE_URL = 'https://cvfjpigbkbzjvvfzvjzr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZmpwaWdia2J6anZ2Znp2anpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1Mzg5MzcsImV4cCI6MjA4NjExNDkzN30.HyJvY8UI_7MtO8t34iNPorp6ICtIpzl2XeeyqkfT7iQ';

// Initialize Supabase client (avoid redeclaring global `supabase`)
if (window.supabase && typeof window.supabase.createClient === 'function') {
  // overwrite the global `supabase` with the client instance
  window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // also provide a stable alias
  window.supabaseClient = window.supabase;

  // Ensure RLS-aware requests include a valid session when tokens exist.
  async function ensureSupabaseSession() {
    const accessToken = localStorage.getItem('charide_token');
    const refreshToken = localStorage.getItem('charide_refresh_token');
    if (!accessToken || !refreshToken) return false;

    const { error } = await window.supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    if (error) {
      console.warn('Supabase session bootstrap failed:', error.message || error);
      return false;
    }
    return true;
  }

  window.ensureSupabaseSession = ensureSupabaseSession;
  // Fire and forget session bootstrap on load.
  ensureSupabaseSession();
} else {
  console.error('Supabase SDK not loaded. Include the CDN script before supabase-config.js');
}
