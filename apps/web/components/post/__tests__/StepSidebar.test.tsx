import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepSidebar } from '../StepSidebar';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: () => <svg data-testid="check-icon" />,
}));

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'details', label: 'Details' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'photos', label: 'Photos' },
  { id: 'description', label: 'Description' },
  { id: 'review', label: 'Review' },
] as const;

describe('StepSidebar desktop navigation', () => {
  it('renders all 6 step labels', () => {
    render(
      <StepSidebar
        steps={STEPS}
        currentStep={0}
        completedSteps={[]}
        onStepClick={vi.fn()}
      />
    );
    STEPS.forEach(({ label }) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('highlights the current step with primary styling', () => {
    render(
      <StepSidebar
        steps={STEPS}
        currentStep={1}
        completedSteps={[]}
        onStepClick={vi.fn()}
      />
    );
    // The label button for the current step (Details) has text-primary class
    const detailsButtons = screen.getAllByText('Details');
    const hasActiveClass = detailsButtons.some((el) =>
      el.className.includes('text-primary')
    );
    expect(hasActiveClass).toBe(true);
  });

  it('shows checkmark icons for completed steps', () => {
    render(
      <StepSidebar
        steps={STEPS}
        currentStep={2}
        completedSteps={[0, 1]}
        onStepClick={vi.fn()}
      />
    );
    // Two steps are completed, each renders a Check icon
    const checkIcons = screen.getAllByTestId('check-icon');
    expect(checkIcons).toHaveLength(2);
  });

  it('does not show checkmark for non-completed steps', () => {
    render(
      <StepSidebar
        steps={STEPS}
        currentStep={0}
        completedSteps={[]}
        onStepClick={vi.fn()}
      />
    );
    expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
  });

  it('calls onStepClick with the correct index when a step label is clicked', () => {
    const onStepClick = vi.fn();
    render(
      <StepSidebar
        steps={STEPS}
        currentStep={0}
        completedSteps={[]}
        onStepClick={onStepClick}
      />
    );
    // Click the "Photos" label (index 3)
    fireEvent.click(screen.getByText('Photos'));
    expect(onStepClick).toHaveBeenCalledWith(3);
  });
});
