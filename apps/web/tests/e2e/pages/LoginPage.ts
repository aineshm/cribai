import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the login page (/login).
 *
 * DOM notes (from apps/web/app/(auth)/login/page.tsx):
 *
 * Email step:
 *   - "← Back" link: href="/"
 *   - <h1> "Sign in to CampusNest"
 *   - <p> description text about .edu email + verification code
 *   - <input type="email" aria-label="Email address" placeholder="you@university.edu">
 *   - <button type="submit"> text "Send verification code" (or "Sending code..." while loading)
 *   - Error div (conditional): data-testid="error-message"
 *
 * OTP step (after email submit):
 *   - "← Back" button (returns to email step)
 *   - "🔑" emoji
 *   - <h1> "Enter your code"
 *   - <p> containing the submitted email address
 *   - <input aria-label="8-digit verification code" inputMode="numeric">
 *   - <button type="submit"> "Verify code" (or "Verifying..." while loading)
 *   - "Resend code" button (30s cooldown)
 */
export class LoginPage {
  readonly page: Page;

  // Email step
  readonly heading: Locator;
  readonly description: Locator;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly backLink: Locator;
  readonly errorMessage: Locator;

  // OTP step
  readonly otpHeading: Locator;
  readonly otpInput: Locator;
  readonly verifyButton: Locator;
  readonly resendButton: Locator;
  readonly otpBackButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Email step locators
    this.heading = page.getByRole('heading', { name: 'Sign in to CampusNest', level: 1 });
    this.description = page.getByText("we'll send you a verification code");
    this.emailInput = page.getByLabel('Email address');
    this.submitButton = page.getByRole('button', { name: /Send verification code|Sending code/i });
    this.backLink = page.getByRole('link', { name: /Back/i });
    this.errorMessage = page.locator('[data-testid="error-message"]');

    // OTP step locators
    this.otpHeading = page.getByRole('heading', { name: 'Enter your code', level: 1 });
    this.otpInput = page.getByLabel('8-digit verification code');
    this.verifyButton = page.getByRole('button', { name: /Verify code|Verifying/i });
    this.resendButton = page.getByRole('button', { name: /Resend code|Code sent/i });
    this.otpBackButton = page.getByRole('button', { name: /Back/i });
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

  async assertOtpStepVisible(email: string) {
    await expect(this.otpHeading).toBeVisible();
    await expect(this.otpInput).toBeVisible();
    await expect(this.page.getByText(email)).toBeVisible();
    await expect(this.verifyButton).toBeVisible();
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

  async fillOtp(code: string) {
    await this.otpInput.fill(code);
  }

  async clickVerify() {
    await this.verifyButton.click();
  }

  async clickBack() {
    await this.backLink.click();
  }

  async clickOtpBack() {
    await this.otpBackButton.click();
  }

  async clickResend() {
    await this.resendButton.click();
  }
}
