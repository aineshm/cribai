import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CribAIChat } from '../cribai-chat';

vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  }),
}));

vi.mock('../chat/chat-block-renderer', () => ({
  ChatBlockRenderer: () => null,
}));

describe('CribAIChat input seeding', () => {
  it('prefills the composer from inputSeed and clears the seed after applying it', () => {
    const onInputSeedConsumed = vi.fn();

    render(
      <CribAIChat
        campusSlug="uw-madison"
        inputSeed="Tell me about this listing."
        onInputSeedConsumed={onInputSeedConsumed}
      />,
    );

    expect(screen.getByLabelText(/^Chat message input/i)).toHaveValue('Tell me about this listing.');
    expect(onInputSeedConsumed).toHaveBeenCalledTimes(1);
  });

  it('replaces an existing draft when a new inputSeed arrives from a CTA', async () => {
    const user = userEvent.setup();
    const onInputSeedConsumed = vi.fn();
    const { rerender } = render(
      <CribAIChat
        campusSlug="uw-madison"
        inputSeed="First listing prompt"
        onInputSeedConsumed={onInputSeedConsumed}
      />,
    );

    const input = screen.getByLabelText(/^Chat message input/i);
    await user.clear(input);
    await user.type(input, 'typed draft that should be replaced');
    expect(input).toHaveValue('typed draft that should be replaced');

    rerender(
      <CribAIChat
        campusSlug="uw-madison"
        inputSeed="Second listing prompt"
        onInputSeedConsumed={onInputSeedConsumed}
      />,
    );

    expect(screen.getByLabelText(/^Chat message input/i)).toHaveValue('Second listing prompt');
    expect(onInputSeedConsumed).toHaveBeenCalledTimes(2);
  });
});
