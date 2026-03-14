import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — CampusNest',
  description:
    'Privacy Policy for CampusNest. Learn how we collect, use, and protect your data.',
  openGraph: {
    title: 'Privacy Policy — CampusNest',
    description:
      'Privacy Policy for CampusNest. Learn how we collect, use, and protect your data.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy — CampusNest',
    description:
      'Privacy Policy for CampusNest. Learn how we collect, use, and protect your data.',
  },
};

const LAST_UPDATED = 'March 13, 2026';

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <nav className="sticky top-0 z-50 glass border-b border-white/20 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]"
          >
            CampusNest
          </Link>
        </div>
      </nav>

      <main className="flex-1 py-12">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--surface-900)]">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-[var(--surface-500)]">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="mt-8 space-y-8 text-[var(--surface-700)] leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                1. What We Collect
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Account information</strong> — your .edu email address
                  and any profile details you provide.
                </li>
                <li>
                  <strong>Listing data</strong> — content you post such as
                  sublease descriptions, photos, pricing, and location.
                </li>
                <li>
                  <strong>Usage data</strong> — pages visited, searches made,
                  features used, and time spent on the platform.
                </li>
                <li>
                  <strong>Analytics events</strong> — anonymized interaction
                  data to help us understand how the platform is used.
                </li>
                <li>
                  <strong>Device information</strong> — browser type, operating
                  system, and screen size for optimizing the experience.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                2. How We Use Your Data
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Operating and maintaining the CampusNest platform.</li>
                <li>Displaying listings to other users.</li>
                <li>Improving search results and AI-powered recommendations.</li>
                <li>Sending transactional emails (account verification, listing updates).</li>
                <li>Analyzing usage patterns to improve the product.</li>
                <li>Enforcing our Terms of Service.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                3. Data Processing and Storage
              </h2>
              <p className="mt-2">
                We use{' '}
                <a
                  href="https://supabase.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--primary-600)] hover:underline"
                >
                  Supabase
                </a>{' '}
                as our data processor for authentication, database storage, and
                file storage. Your data is stored securely and access is
                restricted to authorized personnel only.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                4. We Do Not Sell Your Data
              </h2>
              <p className="mt-2">
                We will never sell, rent, or trade your personal information to
                third parties. We only share data with service providers
                necessary to operate the platform (e.g., hosting, email
                delivery).
              </p>
            </section>

            <section id="cookies">
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                5. Cookies
              </h2>
              <p className="mt-2">
                CampusNest uses cookies for authentication (keeping you signed
                in) and basic analytics. We do not use third-party advertising
                cookies. You can manage cookie preferences in your browser
                settings, though disabling cookies may affect platform
                functionality.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                6. Email Verification
              </h2>
              <p className="mt-2">
                We require a valid .edu email address to verify your student
                status. Your email is used for account authentication and
                platform communications. We do not share your email with other
                users unless you choose to include it in a listing.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                7. Your Rights
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Access</strong> — you can view all data associated
                  with your account in your profile settings.
                </li>
                <li>
                  <strong>Deletion</strong> — you can delete your account and
                  all associated data at any time.
                </li>
                <li>
                  <strong>Export</strong> — you can request a copy of your data
                  by contacting us.
                </li>
                <li>
                  <strong>Correction</strong> — you can update your information
                  through your account settings.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                8. Changes to This Policy
              </h2>
              <p className="mt-2">
                We may update this privacy policy as our platform evolves.
                Significant changes will be communicated via email or an
                in-app notification. Continued use of CampusNest after changes
                constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                9. Contact
              </h2>
              <p className="mt-2">
                Questions about your privacy? Reach us at{' '}
                <a
                  href="mailto:hello@campusnest.com"
                  className="text-[var(--primary-600)] hover:underline"
                >
                  hello@campusnest.com
                </a>
                . Also see our{' '}
                <Link
                  href="/terms"
                  className="text-[var(--primary-600)] hover:underline"
                >
                  Terms of Service
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
