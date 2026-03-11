import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
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
