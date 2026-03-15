import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatProvider, useChatContext } from '../ChatProvider';
import { fireEvent } from '@testing-library/react';

// Mock the Supabase browser client (used for auth token retrieval)
vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}));

/**
 * Test consumer that exposes ChatProvider state for assertions.
 * ChatProvider now only manages open/close, campusSlug, and mission state.
 */
function TestConsumer() {
  const { open, campusSlug, pendingProposal, missionError, setOpen, dismissProposal } = useChatContext();
  return (
    <div>
      <div data-testid="open">{open ? 'true' : 'false'}</div>
      <div data-testid="campus-slug">{campusSlug}</div>
      <div data-testid="pending-proposal">{pendingProposal ? pendingProposal.intent : 'none'}</div>
      <div data-testid="mission-error">{missionError ?? 'none'}</div>
      <button onClick={() => setOpen(true)}>Open</button>
      <button onClick={() => setOpen(false)}>Close</button>
      <button onClick={dismissProposal}>Dismiss</button>
    </div>
  );
}

describe('ChatProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('provides initial state: closed, no proposal, no error', () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );
    expect(screen.getByTestId('open').textContent).toBe('false');
    expect(screen.getByTestId('pending-proposal').textContent).toBe('none');
    expect(screen.getByTestId('mission-error').textContent).toBe('none');
  });

  it('provides campusSlug from prop', () => {
    render(
      <ChatProvider campusSlug="test-campus">
        <TestConsumer />
      </ChatProvider>
    );
    expect(screen.getByTestId('campus-slug').textContent).toBe('test-campus');
  });

  it('defaults campusSlug to empty string', () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );
    expect(screen.getByTestId('campus-slug').textContent).toBe('');
  });

  it('setOpen toggles open state', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    expect(screen.getByTestId('open').textContent).toBe('false');

    await act(async () => {
      fireEvent.click(screen.getByText('Open'));
    });
    expect(screen.getByTestId('open').textContent).toBe('true');

    await act(async () => {
      fireEvent.click(screen.getByText('Close'));
    });
    expect(screen.getByTestId('open').textContent).toBe('false');
  });

  it('innermost ChatProvider campusSlug wins over outer empty-slug provider', () => {
    render(
      <ChatProvider>
        <ChatProvider campusSlug="uw-madison">
          <TestConsumer />
        </ChatProvider>
      </ChatProvider>
    );

    expect(screen.getByTestId('campus-slug').textContent).toBe('uw-madison');
  });

  it('throws when useChatContext is used outside ChatProvider', () => {
    // Suppress React error boundary console output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      'useChatContext must be used within a ChatProvider'
    );

    consoleSpy.mockRestore();
  });

  it('dismissProposal clears proposal and error', async () => {
    // We test this via the provider API — setPendingProposal is exposed
    function ProposalConsumer() {
      const { pendingProposal, missionError, setPendingProposal, dismissProposal } = useChatContext();
      return (
        <div>
          <div data-testid="proposal">{pendingProposal ? pendingProposal.intent : 'none'}</div>
          <div data-testid="error">{missionError ?? 'none'}</div>
          <button onClick={() => setPendingProposal({ intent: 'housing_search', confidence: 0.9, extractedFields: {} })}>
            Set Proposal
          </button>
          <button onClick={dismissProposal}>Dismiss</button>
        </div>
      );
    }

    render(
      <ChatProvider>
        <ProposalConsumer />
      </ChatProvider>
    );

    expect(screen.getByTestId('proposal').textContent).toBe('none');

    await act(async () => {
      fireEvent.click(screen.getByText('Set Proposal'));
    });
    expect(screen.getByTestId('proposal').textContent).toBe('housing_search');

    await act(async () => {
      fireEvent.click(screen.getByText('Dismiss'));
    });
    expect(screen.getByTestId('proposal').textContent).toBe('none');
  });
});
