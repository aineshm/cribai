import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostedByBadge } from '../PostedByBadge';

describe('PostedByBadge', () => {
  it('shows display name when available', () => {
    render(<PostedByBadge source="sublease" creatorName="Jane D." />);
    expect(screen.getByText(/Posted by Jane D\./)).toBeInTheDocument();
  });

  it('shows "verified student" when no name', () => {
    render(<PostedByBadge source="sublease" creatorName={null} />);
    expect(screen.getByText(/Posted by a verified student/)).toBeInTheDocument();
  });

  it('renders nothing for non-sublease listings', () => {
    const { container } = render(
      <PostedByBadge source="zillow" creatorName={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
