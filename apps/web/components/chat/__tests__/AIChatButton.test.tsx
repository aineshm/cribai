import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AIChatButton } from '../AIChatButton';

// We need to mock ChatProvider's useChatContext to provide controlled values
const mockSetOpen = vi.fn();

vi.mock('../ChatProvider', () => ({
  useChatContext: () => ({
    open: false,
    campusSlug: '',
    pendingProposal: null,
    missionError: null,
    setOpen: mockSetOpen,
    confirmMission: vi.fn(),
    dismissProposal: vi.fn(),
    setPendingProposal: vi.fn(),
  }),
}));

describe('AIChatButton', () => {
  it('renders a button with accessible name', () => {
    render(<AIChatButton />);
    const button = screen.getByRole('button', { name: /open ai chat/i });
    expect(button).toBeInTheDocument();
  });

  it('has aria-label containing "chat" or "ai"', () => {
    render(<AIChatButton />);
    const button = screen.getByLabelText(/open ai chat/i);
    expect(button).toBeInTheDocument();
  });

  it('calls setOpen(true) when clicked', () => {
    mockSetOpen.mockClear();
    render(<AIChatButton />);
    const button = screen.getByRole('button', { name: /open ai chat/i });
    fireEvent.click(button);
    expect(mockSetOpen).toHaveBeenCalledWith(true);
    expect(mockSetOpen).toHaveBeenCalledOnce();
  });

  it('is renderable in isolation with mocked context', () => {
    expect(() => render(<AIChatButton />)).not.toThrow();
  });
});
