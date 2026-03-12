import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AIChatButton } from '../AIChatButton';

// We need to mock ChatProvider's useChatContext to provide controlled values
const mockSetOpen = vi.fn();

vi.mock('../ChatProvider', () => ({
  useChatContext: () => ({
    open: false,
    messages: [],
    loading: false,
    setOpen: mockSetOpen,
    sendMessage: vi.fn(),
  }),
}));

describe('AIChatButton', () => {
  it('renders a button with accessible name', () => {
    render(<AIChatButton />);
    const button = screen.getByRole('button', { name: /open cribai chat/i });
    expect(button).toBeInTheDocument();
  });

  it('has aria-label containing "chat" or "crib"', () => {
    render(<AIChatButton />);
    const button = screen.getByLabelText(/open cribai chat/i);
    expect(button).toBeInTheDocument();
  });

  it('calls setOpen(true) when clicked', () => {
    mockSetOpen.mockClear();
    render(<AIChatButton />);
    const button = screen.getByRole('button', { name: /open cribai chat/i });
    fireEvent.click(button);
    expect(mockSetOpen).toHaveBeenCalledWith(true);
    expect(mockSetOpen).toHaveBeenCalledOnce();
  });

  it('is renderable in isolation with mocked context', () => {
    expect(() => render(<AIChatButton />)).not.toThrow();
  });
});
