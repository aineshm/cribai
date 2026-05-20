import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the CribAI landing page (/).
 *
 * DOM notes (from apps/web/app/page.tsx — current implementation):
 *   - Nav with "CribAI" brand text
 *   - Unauthenticated nav: "Browse" link → /explore, "Agent" link, "Get Started" button → /login
 *   - Authenticated nav: "Dashboard" button → /explore
 *   - Hero h1: "Find your perfect college apartment with AI that actually understands."
 *   - Unauthenticated hero CTA: "Get Started (it's free)" → /login
 *   - Authenticated hero CTA: "Go to Explore" → /explore
 *   - "See how it works" secondary CTA → /explore
 *   - Campus section: "Starting at UW-Madison"
 *   - Features section: h2 "Apartment hunting, rebuilt for students."
 *     3 cards: "AI-powered search", "Verified student network", "End-to-end support"
 *   - How It Works section: h2 "How CribAI works", 3 steps (01, 02, 03)
 *   - Footer CTA section: h2 "Ready to find your nest?", "Create free account" button
 *   - NO mobile sticky bar (removed in current implementation)
 */
export class HomePage {
  readonly page: Page;

  // Nav — unauthenticated state
  readonly brandText: Locator;
  readonly browseLink: Locator;
  readonly getStartedNavButton: Locator;

  // Nav — authenticated state
  readonly dashboardLink: Locator;

  // Hero
  readonly heroHeading: Locator;
  readonly heroSubtitle: Locator;
  readonly getStartedCta: Locator;
  readonly seeHowItWorksLink: Locator;

  // Hero — authenticated state
  readonly goToExploreCtaHero: Locator;

  // Campus section
  readonly uwMadisonBadge: Locator;

  // Features
  readonly featuresHeading: Locator;
  readonly featureCards: {
    aiSearch: Locator;
    verifiedCommunity: Locator;
    support: Locator;
  };

  // How It Works
  readonly howItWorksHeading: Locator;

  // Footer CTA
  readonly footerCtaHeading: Locator;
  readonly footerCtaButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Nav
    this.brandText = page.locator('nav').getByText('CribAI');
    this.browseLink = page.locator('nav').getByRole('link', { name: 'Browse' });
    this.getStartedNavButton = page.locator('nav').getByRole('link', { name: 'Get Started' });

    // Nav — authenticated state
    this.dashboardLink = page.locator('nav').getByRole('link', { name: /Dashboard/i });

    // Hero
    this.heroHeading = page.getByRole('heading', {
      name: /Find your perfect college apartment/i,
      level: 1,
    });
    this.heroSubtitle = page.getByText(/Skip the endless scrolling/i);
    this.getStartedCta = page.getByRole('link', { name: /Get Started \(it's free\)/i });
    this.seeHowItWorksLink = page.getByRole('link', { name: 'See how it works' });

    // Hero — authenticated state
    this.goToExploreCtaHero = page.getByRole('link', { name: 'Go to Explore' });

    // Campus section — use exact text match on the span
    this.uwMadisonBadge = page.locator('span', { hasText: /^UW-Madison$/ });

    // Features
    this.featuresHeading = page.getByRole('heading', { name: 'Apartment hunting, rebuilt for students.' });
    this.featureCards = {
      aiSearch: page.getByRole('heading', { name: 'AI-powered search' }),
      verifiedCommunity: page.getByRole('heading', { name: 'Verified student network' }),
      support: page.getByRole('heading', { name: 'End-to-end support' }),
    };

    // How It Works
    this.howItWorksHeading = page.getByRole('heading', { name: 'How CribAI works' });

    // Footer CTA
    this.footerCtaHeading = page.getByRole('heading', { name: 'Ready to find your nest?' });
    // Unauthenticated: "Create free account"; authenticated: "Open Explore"
    this.footerCtaButton = page
      .locator('footer')
      .getByRole('link', { name: /Create free account|Open Explore/i });
  }

  async goto() {
    await this.page.goto('/');
  }

  async assertLoaded() {
    await expect(this.heroHeading).toBeVisible();
    await expect(this.heroSubtitle).toBeVisible();
  }

  async assertAllSections() {
    await expect(this.featuresHeading).toBeVisible();
    await expect(this.featureCards.aiSearch).toBeVisible();
    await expect(this.featureCards.verifiedCommunity).toBeVisible();
    await expect(this.featureCards.support).toBeVisible();
    await expect(this.howItWorksHeading).toBeVisible();
    await expect(this.footerCtaHeading).toBeVisible();
  }

  async clickGetStarted() {
    await this.getStartedCta.click();
  }
}
