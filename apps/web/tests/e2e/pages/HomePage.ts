import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the CampusNest homepage (/).
 *
 * DOM notes (from apps/web/app/page.tsx):
 *   - <h1> with text "CampusNest"
 *   - <p> subtitle with "Student housing intelligence"
 *   - Campus cards are <a> links rendered from DB: href="/{slug}/listings"
 *     with inner text = university_name ?? name
 *   - "No campuses available yet." shown when DB returns empty
 *   - "Sign in" link at bottom: href="/login"
 */
export class HomePage {
  readonly page: Page;

  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly signInLink: Locator;
  readonly noCampusesMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'CampusNest', level: 1 });
    this.subtitle = page.getByText('Student housing intelligence');
    this.signInLink = page.getByRole('link', { name: 'Sign in' });
    this.noCampusesMessage = page.getByText('No campuses available yet.');
  }

  async goto() {
    await this.page.goto('/');
  }

  /**
   * Returns all campus card links rendered on the page.
   * Cards are anchor elements whose href ends with "/listings".
   */
  campusCards(): Locator {
    return this.page.locator('a[href$="/listings"]');
  }

  /**
   * Returns the campus card link for a given campus slug.
   * e.g. campusCard('uw-madison') → locator for href="/uw-madison/listings"
   */
  campusCard(slug: string): Locator {
    return this.page.locator(`a[href="/${slug}/listings"]`);
  }

  async assertLoaded() {
    await expect(this.heading).toBeVisible();
    await expect(this.subtitle).toBeVisible();
  }

  async assertCampusCardsVisible(expectedSlugs: string[]) {
    for (const slug of expectedSlugs) {
      await expect(this.campusCard(slug)).toBeVisible();
    }
  }

  async clickCampusCard(slug: string) {
    await this.campusCard(slug).click();
  }

  async clickSignIn() {
    await this.signInLink.click();
  }
}
