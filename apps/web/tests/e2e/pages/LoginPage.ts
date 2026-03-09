import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the login page (/login).
 *
 * DOM notes (from apps/web/app/(auth)/login/page.tsx):
 *
 * Initial state (magic link form):
 *   - "← Back" link: href="/"
 *   - <h1> "Sign in to CampusNest"
 *   - <p> description text about magic link / .edu email
 *   - <input type="email" placeholder="you@university.edu">
 *   - <button type="submit"> text "Send magic link" (or "Sending link..." while loading)
 *   - Error div (conditional): data-testid="error-message" with error text
 *
 * Success state (after form submit):
 *   - "✉️" emoji
 *   - <h1> "Check your email"
 *   - <p> containing the submitted email address
 *   - "Use a different email" button (resets to form)
 *
 * The form submits via Supabase auth.signInWithOtp — no real network call in E2E.
 */
export class LoginPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly description: Locator;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly backLink: Locator;
  readonly errorMessage: Locator;
  readonly successHeading: Locator;
  readonly useDifferentEmailButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Sign in to CampusNest', level: 1 });
    this.description = page.getByText("we'll send you a magic link");
    this.emailInput = page.getByPlaceholder('you@university.edu');
    this.submitButton = page.getByRole('button', { name: /Send magic link|Sending link/i });
    this.backLink = page.getByRole('link', { name: /Back/i });
    this.errorMessage = page.locator('[data-testid="error-message"]');
    this.successHeading = page.getByRole('heading', { name: 'Check your email', level: 1 });
    this.useDifferentEmailButton = page.getByRole('button', { name: 'Use a different email' });
  }

  async goto(searchParams?: Record<string, string>) {
    if (searchParams && Object.keys(searchParams).length > 0) {
      const qs = new URLSearchParams(searchParams).toString();
      await this.page.goto(`/login?${qs}`);
    } else {
      await this.page.goto('/login');
    }
  }

  async assertFormVisible() {
    await expect(this.heading).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async assertSuccessStateVisible(email: string) {
    await expect(this.successHeading).toBeVisible();
    await expect(this.page.getByText(email)).toBeVisible();
    await expect(this.useDifferentEmailButton).toBeVisible();
  }

  async assertErrorVisible() {
    await expect(this.errorMessage).toBeVisible();
  }

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async clickSubmit() {
    await this.submitButton.click();
  }

  async submitEmail(email: string) {
    await this.fillEmail(email);
    await this.clickSubmit();
  }

  async clickBack() {
    await this.backLink.click();
  }

  async clickUseDifferentEmail() {
    await this.useDifferentEmailButton.click();
  }
}
