import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the CampusNest landing page (/).
 *
 * DOM notes (from apps/web/app/page.tsx — Phase 11 redesign, updated Phase 21):
 *   - Nav with "CampusNest" brand text
 *   - Unauthenticated: "Sign In" link → /login
 *   - Authenticated: "Dashboard" link → /explore
 *   - Hero section with h1 "Find Your Perfect College Apartment"
 *   - Unauthenticated: "Get Started Free" CTA link → /login
 *   - Authenticated: "Go to Dashboard" CTA link → /explore
 *   - SocialProof section: "Trusted by students at 50+ universities"
 *   - Features section: 3 cards (AI-Powered Search, Verified Student Community, End-to-End Support)
 *   - HowItWorks section: h2 "How It Works", 3 steps
 *   - FooterCTA section: h2 "Ready to find your nest?"
 *   - MobileStickyBar: fixed bottom bar with "Get Started Free" (sm:hidden, appears after hero CTA scrolls out)
 */
export class HomePage {
  readonly page: Page;

  // Nav — unauthenticated state
  readonly brandText: Locator;
  readonly signInLink: Locator;

  // Nav — authenticated state
  readonly dashboardLink: Locator;

  // Hero — unauthenticated state
  readonly heroHeading: Locator;
  readonly heroSubtitle: Locator;
  readonly getStartedCta: Locator;
  readonly seeHowItWorksLink: Locator;

  // Hero — authenticated state
  readonly dashboardCta: Locator;

  // Social proof
  readonly socialProofText: Locator;

  // Features
  readonly featureCards: {
    aiSearch: Locator;
    verifiedCommunity: Locator;
    support: Locator;
  };

  // How It Works
  readonly howItWorksHeading: Locator;
  readonly howItWorksSteps: Locator;

  // Footer CTA
  readonly footerCtaHeading: Locator;
  readonly footerCtaButton: Locator;

  // Mobile sticky bar
  readonly mobileStickyBar: Locator;

  constructor(page: Page) {
    this.page = page;

    // Nav — unauthenticated state
    this.brandText = page.locator('nav').getByText('CampusNest');
    this.signInLink = page.locator('nav').getByRole('link', { name: 'Sign In' });

    // Nav — authenticated state
    this.dashboardLink = page.locator('nav').getByRole('link', { name: /Dashboard/i });

    // Hero
    this.heroHeading = page.getByRole('heading', {
      name: /Find Your Perfect College Apartment/i,
      level: 1,
    });
    this.heroSubtitle = page.getByText('True Cost Calculator, Price Fairness Scores');
    this.getStartedCta = page.locator('#hero-cta').getByRole('link', { name: 'Get Started Free' });
    this.seeHowItWorksLink = page.getByRole('link', { name: 'See How It Works' });

    // Hero — authenticated state
    this.dashboardCta = page.locator('#hero-cta').getByRole('link', { name: 'Go to Dashboard' });

    // Social proof
    this.socialProofText = page.getByText('Trusted by students at 50+ universities');

    // Features
    this.featureCards = {
      aiSearch: page.getByRole('heading', { name: 'AI-Powered Search' }),
      verifiedCommunity: page.getByRole('heading', { name: 'Verified Student Community' }),
      support: page.getByRole('heading', { name: 'End-to-End Support' }),
    };

    // How It Works
    this.howItWorksHeading = page.getByRole('heading', { name: 'How It Works' });
    this.howItWorksSteps = page.getByTestId('how-it-works-step');

    // Footer CTA
    this.footerCtaHeading = page.getByRole('heading', { name: 'Ready to find your nest?' });
    this.footerCtaButton = page.locator('section').filter({ hasText: 'Ready to find your nest?' }).getByRole('link', { name: 'Get Started Free' });

    // Mobile sticky bar — the AnimatePresence wrapper renders a div with role-less link
    // Use a robust locator: fixed-position element containing "Get Started Free" that isn't in the hero
    this.mobileStickyBar = page.getByTestId('mobile-sticky-bar');
  }

  async goto() {
    await this.page.goto('/');
  }

  async assertLoaded() {
    await expect(this.heroHeading).toBeVisible();
    await expect(this.heroSubtitle).toBeVisible();
  }

  async assertAllSections() {
    await expect(this.socialProofText).toBeVisible();
    await expect(this.featureCards.aiSearch).toBeVisible();
    await expect(this.featureCards.verifiedCommunity).toBeVisible();
    await expect(this.featureCards.support).toBeVisible();
    await expect(this.howItWorksHeading).toBeVisible();
    await expect(this.footerCtaHeading).toBeVisible();
  }

  async clickGetStarted() {
    await this.getStartedCta.click();
  }

  async clickSignIn() {
    await this.signInLink.click();
  }
}
