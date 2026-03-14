import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — CampusNest',
  description:
    'Terms of Service for CampusNest, the student housing marketplace at UW-Madison.',
  openGraph: {
    title: 'Terms of Service — CampusNest',
    description:
      'Terms of Service for CampusNest, the student housing marketplace at UW-Madison.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Terms of Service — CampusNest',
    description:
      'Terms of Service for CampusNest, the student housing marketplace at UW-Madison.',
  },
};

const LAST_UPDATED = 'March 13, 2026';

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-[var(--surface-500)]">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="mt-8 space-y-8 text-[var(--surface-700)] leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                1. What CampusNest Is
              </h2>
              <p className="mt-2">
                CampusNest is a student housing marketplace that helps
                UW-Madison students find and list housing, including summer
                subleases. We are <strong>not</strong> a landlord, property
                manager, or real estate broker. We provide the platform;
                housing arrangements are between users.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                2. Eligibility
              </h2>
              <p className="mt-2">
                You must have a valid <strong>.edu email address</strong> to
                create an account. By signing up you confirm you are a current
                or incoming student at a recognized institution. We reserve the
                right to verify your student status at any time.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                3. User-Generated Content
              </h2>
              <p className="mt-2">
                Sublease listings, photos, descriptions, and other content you
                post are your responsibility. By posting content you grant
                CampusNest a non-exclusive, royalty-free license to display it
                on the platform. You agree not to post content that is
                misleading, discriminatory, or violates any law.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                4. No Guarantees on Listings
              </h2>
              <p className="mt-2">
                We do not verify the accuracy of listing information such as
                price, availability, amenities, or photos. CampusNest is not
                liable for any disputes, damages, or losses arising from
                transactions between users. Always visit a property in person
                and review lease terms carefully before committing.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                5. Your Responsibilities
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>You are responsible for negotiating and signing your own lease agreements.</li>
                <li>You must comply with all applicable local, state, and federal laws.</li>
                <li>You will not use the platform for spam, fraud, or harassment.</li>
                <li>You will keep your account credentials secure.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                6. Data Usage
              </h2>
              <p className="mt-2">
                We collect and use data as described in our{' '}
                <Link
                  href="/privacy"
                  className="text-[var(--primary-600)] hover:underline"
                >
                  Privacy Policy
                </Link>
                . This includes listing data, analytics events, and usage
                information to operate and improve the platform.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                7. Termination
              </h2>
              <p className="mt-2">
                We may suspend or terminate your account at any time if you
                violate these terms, misuse the platform, or for any other
                reason at our discretion. You may delete your account at any
                time through your account settings.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                8. Limitation of Liability
              </h2>
              <p className="mt-2">
                CampusNest is provided &ldquo;as is&rdquo; without warranties
                of any kind. To the fullest extent permitted by law, CampusNest
                shall not be liable for indirect, incidental, or consequential
                damages arising from your use of the platform.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                9. Changes to These Terms
              </h2>
              <p className="mt-2">
                We may update these terms from time to time. Continued use of
                CampusNest after changes are posted constitutes acceptance of
                the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-[var(--surface-900)]">
                10. Contact
              </h2>
              <p className="mt-2">
                Questions about these terms? Reach us at{' '}
                <a
                  href="mailto:hello@campusnest.com"
                  className="text-[var(--primary-600)] hover:underline"
                >
                  hello@campusnest.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
