"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Status = "idle" | "sending" | "sent" | "error";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser is redirected to Google; we only get here on error.
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8">
        <h1 className="text-xl font-semibold">Sign In to Bydd</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Continue with Google, or get a magic link by email.
        </p>

        {status === "sent" ? (
          <div className="mt-6 rounded-lg bg-muted p-4 text-sm">
            Check <span className="font-medium">{email}</span> for a sign-in
            link. You can close this tab once you&apos;ve clicked it.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-2.5 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              <GoogleMark />
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="submit"
                className="w-full"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send Magic Link"}
              </Button>
            </form>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}
