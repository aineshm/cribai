'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Building2, Send } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useCrmChat, type ChatMessage } from './useCrmChat';
import { CrmCanvas } from './CrmCanvas';
import { CanvasSheet } from './CanvasSheet';
import { SavedUnitCard } from './SavedUnitCard';
import { FirstSaveAnalysisCard } from './FirstSaveAnalysisCard';
import { RankCompareTable } from './RankCompareTable';

/**
 * The chat-first "My Apartments" shell (ported from workspace-closed.html +
 * workspace-canvas-open.html).
 *
 *  - Closed: full-width chat thread + a pinned composer.
 *  - Open:   a ~40/60 split — chat narrows, CrmCanvas slides in on the right.
 *
 * The "My Apartments" toggle in the app bar mounts/unmounts the canvas. The
 * canvas is CONDITIONALLY MOUNTED (not CSS-hidden): when closed it is absent
 * from the DOM, so its data (list name, units) isn't queryable until opened.
 *
 * Chat messages are rendered by mapping each `ChatMessage.kind` to its card:
 *  saved-unit → SavedUnitCard, analysis → FirstSaveAnalysisCard,
 *  rank → RankCompareTable, text/steering → bubbles.
 */
const PLACEHOLDER = 'Paste a listing link, or ask…';

export function CrmWorkspace() {
  const { messages, send } = useCrmChat();
  const [draft, setDraft] = useState('');
  const [canvasOpen, setCanvasOpen] = useState(false);
  const isMobile = useIsMobile();

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    send(text);
    setDraft('');
  };

  return (
    // The global CribAI app bar/nav is owned by app/(main)/layout.tsx; this
    // shell sits directly beneath it — no duplicate brand chrome. Height fills
    // the viewport minus the persistent mobile bottom nav (0px on desktop).
    <div className="flex h-[calc(100dvh-var(--mobile-nav-height,0px))] flex-col">
      {/* Slim workspace toolbar — only the canvas toggle (no second brand bar) */}
      <div
        className="flex h-14 flex-shrink-0 items-center gap-3 border-b px-6"
        style={{ borderColor: 'var(--surface-200)' }}
      >
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setCanvasOpen((o) => !o)}
          aria-pressed={canvasOpen}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold',
          )}
          style={{
            borderColor: canvasOpen ? 'var(--primary-200)' : 'var(--surface-200)',
            background: canvasOpen ? 'var(--primary-50)' : '#fff',
            color: canvasOpen ? 'var(--primary-800)' : 'var(--surface-800)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <Building2 aria-hidden="true" className="h-4 w-4" />
          My Apartments
        </button>
      </div>

      {/* Split workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chat pane — full width when closed; on desktop it narrows to ~40%
            when the canvas opens. On mobile the canvas is an overlay sheet, so
            the chat pane keeps full width regardless. */}
        <section
          className={cn(
            'flex min-w-0 flex-col transition-[flex-basis] duration-300',
            canvasOpen && !isMobile
              ? 'flex-[0_0_40%] border-r max-[980px]:hidden'
              : 'flex-[0_0_100%]',
          )}
          style={{ borderColor: 'var(--surface-200)' }}
        >
          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-7">
            <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
              <Greeting />
              {messages.map((m) => (
                <MessageView key={m.id} message={m} />
              ))}
            </div>
          </div>

          {/* Composer */}
          <div className="flex-shrink-0 px-6 pb-5 pt-4" style={{ background: 'var(--surface-50)' }}>
            <form
              className="mx-auto flex max-w-[720px] items-center gap-2.5 rounded-[18px] border bg-white px-4 py-2.5"
              style={{ borderColor: 'var(--surface-200)', boxShadow: 'var(--shadow-soft)' }}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                id="crm-composer"
                name="crm-composer"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={PLACEHOLDER}
                aria-label="Message CribAI"
                className="min-w-0 flex-1 border-0 bg-transparent text-[0.9375rem] outline-none"
                style={{ color: 'var(--surface-900)' }}
              />
              <button
                type="submit"
                aria-label="Send"
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white"
                style={{
                  background: 'linear-gradient(135deg, var(--primary-700), var(--primary-900))',
                  boxShadow: '0 4px 12px rgba(127,29,29,0.28)',
                }}
              >
                <Send aria-hidden="true" className="h-[18px] w-[18px]" />
              </button>
            </form>
          </div>
        </section>

        {/* Desktop canvas pane — conditionally MOUNTED (absent from DOM when
            closed). Only one canvas instance ever mounts: the desktop pane OR
            the mobile sheet, never both. */}
        {canvasOpen && !isMobile ? (
          <section className="flex min-w-0 flex-[0_0_60%] flex-col">
            <CrmCanvas onClose={() => setCanvasOpen(false)} />
          </section>
        ) : null}
      </div>

      {/* Mobile canvas — a full-screen bottom sheet overlaying the chat. */}
      {isMobile ? (
        <CanvasSheet open={canvasOpen} onClose={() => setCanvasOpen(false)} />
      ) : null}
    </div>
  );
}

function Greeting() {
  return (
    <div className="flex flex-col gap-1">
      <p
        className="m-0 text-xl font-extrabold"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)', letterSpacing: '-0.02em' }}
      >
        Welcome back, <span style={{ color: 'var(--primary-800)' }}>Badger</span>.
      </p>
      <p className="m-0 text-[0.9375rem] leading-relaxed" style={{ color: 'var(--surface-600)' }}>
        Paste a link to add an apartment, or ask me to rank your saved places. Open{' '}
        <b style={{ color: 'var(--surface-900)' }}>My Apartments</b> to see your full list.
      </p>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  switch (message.kind) {
    case 'saved-unit':
      return <SavedUnitCard unit={message.unit} />;
    case 'analysis':
      return <FirstSaveAnalysisCard analysis={message.analysis} />;
    case 'rank':
      return <RankCompareTable result={message.result} />;
    case 'text':
    case 'steering':
      return <Bubble role={message.role} text={message.text} />;
  }
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className="max-w-[90%] rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed"
        style={
          isUser
            ? { background: 'var(--primary-800)', color: '#fff' }
            : { background: '#fff', color: 'var(--surface-700)', boxShadow: 'var(--shadow-card)' }
        }
      >
        {text}
      </div>
    </div>
  );
}
