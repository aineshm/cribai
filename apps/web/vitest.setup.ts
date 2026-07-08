import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  // Isolate localStorage across tests (e.g. the AIN-104.2 first-run intro
  // flag) so one test's writes never leak into the next test's assertions.
  try {
    window.localStorage.clear();
  } catch {
    // localStorage unavailable in this environment — nothing to clear.
  }
});

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    motion: new Proxy({}, {
      get: (_: unknown, prop: string) =>
        React.forwardRef((props: any, ref: any) =>
          React.createElement(prop, { ...props, ref }, props.children)
        ),
    }),
    AnimatePresence: ({ children }: any) => children,
    LayoutGroup: ({ children }: any) => children,
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
  };
});

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => {
    const React = require('react');
    return React.createElement('a', { href, ...props }, children);
  },
}));
