/**
 * Popup script — controls the extension popup UI.
 *
 * All chrome.runtime.sendMessage calls go to the service worker; the popup
 * itself holds NO Supabase session state. Session is owned by the SW.
 *
 * Views (mutually exclusive):
 *   loading → (check auth) → email (sign-in) → otp (verify) → save (main CTA)
 *                                              → (after save) → success
 */

import type { PopupToSwMessage, SwResponse } from '../lib/messages';

// ---------------------------------------------------------------------------
// DOM refs — assert non-null since popup.html guarantees these exist
// ---------------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing DOM element: #${id}`);
  return node as T;
}

const views = {
  loading: el('view-loading'),
  email: el('view-email'),
  otp: el('view-otp'),
  save: el('view-save'),
  success: el('view-success'),
} as const;

type ViewName = keyof typeof views;

const inputEmail = el<HTMLInputElement>('input-email');
const inputOtp = el<HTMLInputElement>('input-otp');
const emailError = el('email-error');
const otpError = el('otp-error');
const saveError = el('save-error');
const saveWarning = el('save-warning');
const authEmailDisplay = el('auth-email-display');
const deepLink = el<HTMLAnchorElement>('deep-link');

// ---------------------------------------------------------------------------
// View management
// ---------------------------------------------------------------------------

function showView(name: ViewName): void {
  for (const [key, el] of Object.entries(views)) {
    if (key === name) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }
}

function clearErrors(): void {
  emailError.textContent = '';
  otpError.textContent = '';
  saveError.textContent = '';
  saveWarning.textContent = '';
}

// ---------------------------------------------------------------------------
// Messaging helper
// ---------------------------------------------------------------------------

function sendToSw(message: PopupToSwMessage): Promise<SwResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: SwResponse | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from service worker'));
        return;
      }
      resolve(response);
    });
  });
}

// ---------------------------------------------------------------------------
// Loading state helpers for buttons
// ---------------------------------------------------------------------------

function setButtonLoading(btn: HTMLButtonElement, loading: boolean, defaultText: string): void {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';
  } else {
    btn.disabled = false;
    btn.textContent = defaultText;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentEmail = '';

// ---------------------------------------------------------------------------
// Initialisation: check auth on open
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  showView('loading');
  clearErrors();

  try {
    const response = await sendToSw({ type: 'GET_AUTH_STATE' });

    if (response.type === 'AUTH_STATE') {
      if (response.state.status === 'signed_in') {
        authEmailDisplay.textContent = response.state.email;
        showView('save');
      } else {
        showView('email');
        inputEmail.focus();
      }
    } else {
      showView('email');
      inputEmail.focus();
    }
  } catch {
    showView('email');
    inputEmail.focus();
  }
}

// ---------------------------------------------------------------------------
// Sign in: email → OTP flow
// ---------------------------------------------------------------------------

const btnSendOtp = el<HTMLButtonElement>('btn-send-otp');
btnSendOtp.addEventListener('click', handleSendOtp);
inputEmail.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSendOtp();
});

async function handleSendOtp(): Promise<void> {
  clearErrors();
  const email = inputEmail.value.trim();

  if (!email) {
    emailError.textContent = 'Please enter your email address.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailError.textContent = 'Please enter a valid email address.';
    return;
  }

  setButtonLoading(btnSendOtp, true, 'Send code');

  try {
    const response = await sendToSw({ type: 'SIGN_IN', email });

    if (response.type === 'OTP_SENT') {
      currentEmail = email;
      showView('otp');
      inputOtp.focus();
    } else if (response.type === 'ERROR') {
      emailError.textContent = response.message;
    }
  } catch (err) {
    emailError.textContent = 'Could not connect to CribAI. Please try again.';
  } finally {
    setButtonLoading(btnSendOtp, false, 'Send code');
  }
}

// ---------------------------------------------------------------------------
// OTP verification
// ---------------------------------------------------------------------------

const btnBackToEmail = el<HTMLButtonElement>('btn-back-to-email');
btnBackToEmail.addEventListener('click', () => {
  clearErrors();
  inputOtp.value = '';
  showView('email');
});

const btnVerifyOtp = el<HTMLButtonElement>('btn-verify-otp');
btnVerifyOtp.addEventListener('click', handleVerifyOtp);
inputOtp.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleVerifyOtp();
});

// Auto-submit when 8 digits entered
inputOtp.addEventListener('input', () => {
  if (inputOtp.value.length === 8) {
    handleVerifyOtp();
  }
});

async function handleVerifyOtp(): Promise<void> {
  clearErrors();
  const token = inputOtp.value.trim();

  if (token.length < 6) {
    otpError.textContent = 'Please enter the full code from your email.';
    return;
  }

  setButtonLoading(btnVerifyOtp, true, 'Verify');

  try {
    const response = await sendToSw({
      type: 'VERIFY_OTP',
      email: currentEmail,
      token,
    });

    if (response.type === 'SIGN_IN_OK') {
      authEmailDisplay.textContent = response.email;
      inputOtp.value = '';
      showView('save');
    } else if (response.type === 'ERROR') {
      otpError.textContent = response.message;
    }
  } catch {
    otpError.textContent = 'Could not verify code. Please try again.';
  } finally {
    setButtonLoading(btnVerifyOtp, false, 'Verify');
  }
}

// Resend
const btnResendOtp = el<HTMLButtonElement>('btn-resend-otp');
btnResendOtp.addEventListener('click', async () => {
  clearErrors();
  btnResendOtp.disabled = true;
  btnResendOtp.textContent = 'Sending...';

  try {
    const response = await sendToSw({ type: 'SIGN_IN', email: currentEmail });
    if (response.type === 'OTP_SENT') {
      btnResendOtp.textContent = 'Sent!';
      setTimeout(() => {
        btnResendOtp.textContent = 'Resend code';
        btnResendOtp.disabled = false;
      }, 3000);
    } else if (response.type === 'ERROR') {
      otpError.textContent = response.message;
      btnResendOtp.textContent = 'Resend code';
      btnResendOtp.disabled = false;
    }
  } catch {
    otpError.textContent = 'Could not resend code.';
    btnResendOtp.textContent = 'Resend code';
    btnResendOtp.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

const btnSignOut = el<HTMLButtonElement>('btn-sign-out');
btnSignOut.addEventListener('click', async () => {
  try {
    await sendToSw({ type: 'SIGN_OUT' });
  } catch {
    // ignore — still show sign-in form
  }
  currentEmail = '';
  clearErrors();
  inputEmail.value = '';
  showView('email');
  inputEmail.focus();
});

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

const btnSave = el<HTMLButtonElement>('btn-save');
btnSave.addEventListener('click', handleSave);

async function handleSave(): Promise<void> {
  clearErrors();
  setButtonLoading(btnSave, true, 'Save to CribAI');

  try {
    const response = await sendToSw({ type: 'SAVE_LISTING' });

    if (response.type === 'SAVE_OK') {
      deepLink.href = response.deepLinkUrl;
      showView('success');
    } else if (response.type === 'ERROR') {
      if (response.code === 'auth') {
        // Session expired — show sign-in
        clearErrors();
        showView('email');
        emailError.textContent = response.message;
        inputEmail.focus();
      } else if (response.code === 'rate_limited') {
        saveWarning.textContent = response.message;
      } else {
        saveError.textContent = response.message;
      }
    }
  } catch {
    saveError.textContent = 'Could not connect to CribAI. Please try again.';
  } finally {
    setButtonLoading(btnSave, false, 'Save to CribAI');
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init().catch(console.error);
