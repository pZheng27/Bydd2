import Link from "next/link";

export const metadata = { title: "Privacy Policy — Bydd" };

// Starter privacy policy so Google's OAuth consent screen has a valid link.
// Plain, accurate description of what Bydd collects and why. Review/customize
// (and have counsel look it over) before a real public launch.

const UPDATED = "September 28, 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Last updated {UPDATED}
      </p>

      <Section title="Who we are">
        <p>
          Bydd is a platform for coin collectors to catalog their collections,
          prepare listing photos, and (where enabled) trade with dealers. This
          policy explains what we collect and how we use it.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <strong>Account information.</strong> When you sign in with Google or
          an email magic link, we receive your email address and, for Google
          sign-in, your basic profile (name). We use this to create and identify
          your account.
        </p>
        <p>
          <strong>Content you add.</strong> The coins, sets, descriptions, and
          photos you upload to your collection, plus any listings, offers, or
          messages you create when marketplace features are enabled.
        </p>
        <p>
          <strong>Usage data.</strong> Basic technical information (such as log
          and device data) needed to operate and secure the service.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          To provide the service — store your collection, generate and format
          photos, show your public sets when you choose to make them public, and
          power marketplace features where enabled. We do not sell your personal
          information.
        </p>
      </Section>

      <Section title="What is public">
        <p>
          A set is private until you mark it public. When you make a set public,
          its coins, their photos, grades, and descriptions become visible to
          anyone via your public collection page. Your email address and any
          private fields (what you paid, certificate numbers, personal notes not
          used as a description) are never shown publicly.
        </p>
      </Section>

      <Section title="Service providers">
        <p>
          We rely on trusted providers to run Bydd: Supabase (authentication,
          database, and photo storage), Vercel (hosting), Google (Google
          sign-in), and email and image-processing services used to send sign-in
          links and prepare your photos. Your data is processed by these
          providers only to operate the service.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use cookies only to keep you signed in. We do not use advertising
          or third-party tracking cookies.
        </p>
      </Section>

      <Section title="Data retention and your choices">
        <p>
          We keep your data for as long as your account is active. You can edit
          or delete your coins and sets at any time, and you can request deletion
          of your account and associated data by contacting us.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data? Contact us at{" "}
          <span className="font-medium text-foreground">
            [your support email]
          </span>
          .
        </p>
      </Section>

      <div className="mt-10 border-t pt-6 text-sm">
        <Link href="/terms" className="text-muted-foreground hover:underline">
          Terms of Service
        </Link>
      </div>
    </div>
  );
}
