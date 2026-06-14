/**
 * AIN-74: drawer-wiring tests for CrmWorkspace.
 *
 * Isolated from CrmWorkspace.test.tsx because useCrmChat transitively
 * imports @campusnest/supabase/client, which cannot be resolved in the
 * vitest/vite environment. This file mocks useCrmChat so the module graph
 * stays vite-resolvable.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UNITS } from '@/lib/crm/fixtures';
import type { ChatMessage } from '@/lib/crm/chat-messages';

// --- mock useCrmChat before importing CrmWorkspace ---
const mockSend = vi.fn();
let mockMessages: ChatMessage[] = [];

vi.mock('../useCrmChat', () => ({
  useCrmChat: () => ({
    messages: mockMessages,
    send: mockSend,
    pending: false,
  }),
}));

// Must be imported AFTER the mock is registered.
const { CrmWorkspace } = await import('../CrmWorkspace');

// Build a saved-unit message from the hero fixture.
const savedUnitMessage: ChatMessage = {
  id: 'msg-1',
  kind: 'saved-unit',
  role: 'assistant',
  unit: UNITS[0]!,
};

describe('CrmWorkspace – drawer wiring (AIN-74)', () => {
  beforeEach(() => {
    mockMessages = [];
    mockSend.mockClear();
  });

  it('saved-unit card in the chat thread is interactive (role=button)', async () => {
    mockMessages = [savedUnitMessage];
    render(<CrmWorkspace />);
    // SavedUnitCard renders with role=button when onOpen is passed
    const card = screen.getByRole('button', { name: /chapter at madison/i });
    expect(card).toBeInTheDocument();
  });

  it('clicking a saved-unit card opens the detail drawer', async () => {
    mockMessages = [savedUnitMessage];
    render(<CrmWorkspace />);
    const card = screen.getByRole('button', { name: /chapter at madison/i });
    fireEvent.click(card);
    await waitFor(() =>
      expect(screen.getByRole('complementary', { name: /unit detail/i })).toBeInTheDocument()
    );
  });

  it('clicking the close-panel button closes the detail drawer', async () => {
    mockMessages = [savedUnitMessage];
    render(<CrmWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: /chapter at madison/i }));
    await waitFor(() =>
      expect(screen.getByRole('complementary', { name: /unit detail/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: /unit detail/i })
      ).not.toBeInTheDocument()
    );
  });

  it('drawer shows the source link when unit has source_url', async () => {
    mockMessages = [savedUnitMessage];
    render(<CrmWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: /chapter at madison/i }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /view original/i })).toBeInTheDocument()
    );
    const link = screen.getByRole('link', { name: /view original/i });
    expect(link).toHaveAttribute('href', UNITS[0]!.source_url);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('drawer shows full description text', async () => {
    mockMessages = [savedUnitMessage];
    render(<CrmWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: /chapter at madison/i }));
    await waitFor(() =>
      expect(screen.getByText(/murphy-style bed nook/i)).toBeInTheDocument()
    );
  });
});
