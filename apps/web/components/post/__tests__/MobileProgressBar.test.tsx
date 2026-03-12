import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileProgressBar } from '../MobileProgressBar';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      animate,
      style,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children?: React.ReactNode;
      animate?: Record<string, unknown>;
      initial?: unknown;
      transition?: unknown;
    }) => {
      // Expose the animated width as an inline style so tests can assert on it
      const inlineStyle = animate && typeof animate === 'object' && 'width' in animate
        ? { width: animate.width as string }
        : style;
      return <div {...props} style={inlineStyle}>{children}</div>;
    },
  },
}));

describe('MobileProgressBar', () => {
  it('displays "Step 1 of 6" when currentStep is 0 out of 6', () => {
    render(<MobileProgressBar currentStep={0} totalSteps={6} />);
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
  });

  it('displays "Step 3 of 6" when currentStep is 2 out of 6', () => {
    render(<MobileProgressBar currentStep={2} totalSteps={6} />);
    expect(screen.getByText('Step 3 of 6')).toBeInTheDocument();
  });

  it('displays "Step 6 of 6" when on the last step', () => {
    render(<MobileProgressBar currentStep={5} totalSteps={6} />);
    expect(screen.getByText('Step 6 of 6')).toBeInTheDocument();
  });

  it('shows 17% completion on step 1 of 6 (step index 0)', () => {
    // percentage = Math.round(((0 + 1) / 6) * 100) = Math.round(16.67) = 17
    render(<MobileProgressBar currentStep={0} totalSteps={6} />);
    expect(screen.getByText('17%')).toBeInTheDocument();
  });

  it('shows 50% completion on step 3 of 6 (step index 2)', () => {
    // percentage = Math.round(((2 + 1) / 6) * 100) = Math.round(50) = 50
    render(<MobileProgressBar currentStep={2} totalSteps={6} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows 100% completion on step 6 of 6 (step index 5)', () => {
    // percentage = Math.round(((5 + 1) / 6) * 100) = 100
    render(<MobileProgressBar currentStep={5} totalSteps={6} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('progress bar width matches the calculated percentage', () => {
    // percentage for step index 2 of 6 = 50%
    const { container } = render(<MobileProgressBar currentStep={2} totalSteps={6} />);
    // The animated bar is the div with style.width set by the mock
    const bar = container.querySelector('[style*="width: 50%"]');
    expect(bar).not.toBeNull();
  });
});
