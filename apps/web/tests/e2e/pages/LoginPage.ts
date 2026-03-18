import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the login page (/login) — current implementation.
 *
 * Layout: AuthSplitLayout — branded left panel (hidden lg:flex, bg-teal-900) + form right panel.
 *
 * Left panel content (desktop only, hidden on mobile):
 *   - "CampusNest" brand text
 *   - h1 "Find your perfect college apartment"
 *   - Features: "Verified .edu student network", "AI-matched listings & fair pricing",
 *     "Direct tour booking & lease analysis"
 *
 * Email step:
 *   - <h2> "Sign in to CampusNest"
 *   - <p> "Enter your .edu email and we'll send you a verification code."
 *   - <input type="email" aria-label="Email address" placeholder="you@university.edu">
 *   - <button type="submit"> "Continue" (or "Sending code..." while loading)
 *
 * OTP step:
 *   - "Back" button (returns to email step)
 *   - <h2> "Enter your code"
 *   - <p> containing submitted email
 *   - 8 individual digit inputs (aria-label="Digit 1" through "Digit 8")
 *   - <button type="submit"> "Verify Code" (or spinner "Verifying...")
 *   - "Resend code" button (30s cooldown)
 */
export class LoginPage {
  readonly page: Page;

  // Split layout — branded left panel (visible only on lg+ viewports)
  readonly brandPanel: Locator;
  readonly brandHeading: Locator;

  // Email step
  readonly heading: Locator;
  readonly description: Locator;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  // OTP step
  readonly otpHeading: Locator;
  readonly otpDigitInputs: Locator;
  readonly verifyButton: Locator;
  readonly resendButton: Locator;
  readonly otpBackButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Split layout — branded left panel (bg-teal-900, hidden lg:flex)
    // Target by its distinctive background class and teal-900 color
    this.brandPanel = page.locator('.bg-teal-900').first();
    this.brandHeading = page.locator('.bg-teal-900').getByText('CampusNest').first();

    // Email step locators
    this.heading = page.getByRole('heading', { name: 'Sign in to CampusNest' });
    this.description = page.getByText("we'll send you a verification code");
    this.emailInput = page.getByLabel('Email address');
    this.submitButton = page.getByRole('button', { name: /Continue|Sending code/i });
    this.errorMessage = page.getByTestId('auth-error');

    // OTP step locators
    this.otpHeading = page.getByRole('heading', { name: 'Enter your code' });
    this.otpDigitInputs = page.locator('input[aria-label^="Digit"]');
    this.verifyButton = page.getByRole('button', { name: /Verify Code|Verifying/i });
    this.resendButton = page.getByRole('button', { name: /Resend code/i });
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

  async assertSplitLayoutVisible() {
    await expect(this.brandPanel).toBeVisible();
    await expect(this.brandHeading).toBeVisible();
  }

  async assertOtpStepVisible(email: string) {
    await expect(this.otpHeading).toBeVisible();
    await expect(this.otpDigitInputs.first()).toBeVisible();
    await expect(this.page.getByText(email)).toBeVisible();
    await expect(this.verifyButton).toBeVisible();
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

  async fillOtpDigits(code: string) {
    const codeArr = code.split('');
    for (let i = 0; i < codeArr.length; i++) {
      await this.otpDigitInputs.nth(i).fill(codeArr[i]);
    }
  }

  async clickVerify() {
    await this.verifyButton.click();
  }

  async clickOtpBack() {
    await this.otpBackButton.click();
  }

  async clickResend() {
    await this.resendButton.click();
  }
}
