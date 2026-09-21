/**
 * Best-effort transactional email via Resend. Returns false (a no-op) when
 * RESEND_API_KEY isn't set, so the app runs fine on the in-app inbox alone until
 * the founder adds a key. Never throws.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM || "Bydd <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, text: opts.text }),
    });
    if (!r.ok) console.error("resend send failed", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("resend send error", e);
    return false;
  }
}
