// Local dev utility: generate a sign-in link for any account WITHOUT sending
// an email (bypasses the email rate limit). Uses the Supabase admin API, so it
// requires your Supabase SECRET key — pass it via an environment variable; it is
// never stored or printed.
//
// Usage (PowerShell):
//   $env:SUPABASE_SECRET_KEY="sb_secret_..."; node scripts/login-link.mjs you@example.com
// Optional 2nd arg = app origin (defaults to http://localhost:3000):
//   node scripts/login-link.mjs you@example.com https://bydd2.vercel.app
//
// It prints a URL — paste it into your browser to sign in. Works in any browser.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://vraiayzvnxclcuzzvuqd.supabase.co";
const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2];
const appOrigin = process.argv[3] || "http://localhost:3000";

if (!SECRET_KEY) {
  console.error(
    "Missing key. Run:\n  $env:SUPABASE_SECRET_KEY=\"sb_secret_...\"; node scripts/login-link.mjs you@example.com",
  );
  process.exit(1);
}
if (!email) {
  console.error("Usage: node scripts/login-link.mjs <email> [appOrigin]");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Create the user if it doesn't exist yet (passwordless, pre-confirmed).
// Ignore the "already registered" error for existing accounts.
const { error: createErr } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (createErr && !/already|registered|exists/i.test(createErr.message)) {
  console.error("createUser error:", createErr.message);
}

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (error) {
  console.error("generateLink error:", error.message);
  process.exit(1);
}

const { hashed_token, verification_type } = data.properties;
const url = `${appOrigin}/auth/callback?token_hash=${hashed_token}&type=${verification_type}`;

console.log(`\n✅ Sign-in link for ${email} (paste into any browser):\n`);
console.log(url + "\n");
