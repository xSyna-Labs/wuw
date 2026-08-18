import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://evwfeauffghrvllxizja.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2d2ZlYXVmZmdocnZsbHhpemphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3ODQ4NDUsImV4cCI6MjA5OTM2MDg0NX0.NU2u1KI6qPvSKza5Xb7eJAiH0qPzvHrcY6_mIZQrecs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: { 'X-Client-Info': 'xsyna-web/1.0' },
  },
});

// Diagnostic: test connectivity
window.__XSYNA_DIAG = async function () {
  const r = {};
  try {
    const s = performance.now();
    const res = await fetch(SUPABASE_URL + '/auth/v1/health', { method: 'GET' });
    r.health = { ok: res.ok, status: res.status, ms: Math.round(performance.now() - s) };
  } catch (e) {
    r.health = { ok: false, error: e.message };
  }
  return r;
};

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}
