import Link from "next/link";

export const metadata = { title: "Terms of Service — Bydd" };

// Starter terms of service so Google's OAuth consent screen has a valid link.
// Review/customize (and have counsel look it over) before a real public launch.

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

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Last updated {UPDATED}
      </p>

      <Section title="Acceptance">
        <p>
          By creating an account or using Bydd, you agree to these terms. If you
          do not agree, please do not use the service.
        </p>
      </Section>

      <Section title="What Bydd is">
        <p>
          Bydd lets collectors catalog coins, prepare and format listing photos,
          and share public collections. Marketplace features (listings, offers,
          orders) may be enabled over time. Any checkout in the current version
          is <strong>simulated</strong> — no real payment is processed and no
          funds move.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You are responsible for your account and for keeping your sign-in
          secure. Provide accurate information and don&apos;t use someone
          else&apos;s account without permission.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          You keep ownership of the photos, descriptions, and collection data
          you add. You grant Bydd permission to store, process, and display that
          content to operate the service — including showing sets you choose to
          make public. Don&apos;t upload content you don&apos;t have the right to
          use, and represent your coins honestly.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Don&apos;t misuse the service: no unlawful activity, no infringing or
          fraudulent content, no attempts to disrupt or gain unauthorized access
          to the platform or other users&apos; data.
        </p>
      </Section>

      <Section title="Disclaimer">
        <p>
          Bydd is provided &quot;as is&quot; and is under active development.
          Photo formatting only changes presentation (background and staging),
          not the coin itself; you are responsible for representing your coins
          accurately. We don&apos;t guarantee the service will be
          uninterrupted or error-free.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the extent permitted by law, Bydd is not liable for indirect or
          consequential damages arising from your use of the service.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms as the service evolves. Continued use after
          an update means you accept the revised terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions? Contact us at{" "}
          <a
            href="mailto:zhengpeter26@gmail.com"
            className="font-medium text-foreground hover:underline"
          >
            zhengpeter26@gmail.com
          </a>
          .
        </p>
      </Section>

      <div className="mt-10 border-t pt-6 text-sm">
        <Link href="/privacy" className="text-muted-foreground hover:underline">
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
