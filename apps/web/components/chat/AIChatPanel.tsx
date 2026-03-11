'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { staggerContainer, staggerItem, springConfig } from '@/lib/animations';

interface AIChatPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const suggestedPrompts = [
  'Find me a 2BR under $1,500',
  'Which apartments are pet friendly?',
  'Compare listings near State St',
  'What should I look for in a lease?',
] as const;

interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

const DEFAULT_RESPONSE =
  "I'd be happy to help you find the perfect apartment near campus! Try asking me about specific requirements like budget, number of bedrooms, or preferred amenities.";

export function AIChatPanel({ open, onOpenChange }: AIChatPanelProps) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');

  const handleSend = useCallback(
    (text?: string) => {
      const messageText = text ?? inputValue;
      if (!messageText.trim()) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: messageText.trim(),
      };

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: DEFAULT_RESPONSE,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInputValue('');
    },
    [inputValue]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const hasMessages = messages.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-md flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="border-b px-4 py-3 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-[var(--primary-700)] flex items-center justify-center">
              <Sparkles className="size-4 text-white" />
            </div>
            <SheetTitle className="text-base font-semibold">
              CribAI
            </SheetTitle>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close chat panel"
            onClick={() => onOpenChange(false)}
            aria-label="Close chat"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasMessages ? (
            /* Empty state */
            <motion.div
              className="flex flex-col items-center justify-center h-full text-center space-y-6"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              <motion.div variants={staggerItem} className="space-y-2">
                <div className="size-16 rounded-2xl bg-[var(--primary-50)] flex items-center justify-center mx-auto">
                  <Sparkles className="size-8 text-[var(--primary-700)]" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  Hey there!
                </h3>
                <p className="text-sm text-muted-foreground max-w-[260px]">
                  I can help you find apartments, compare listings, and
                  understand lease terms.
                </p>
              </motion.div>

              <motion.div
                variants={staggerItem}
                className="flex flex-wrap justify-center gap-2"
              >
                {suggestedPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs"
                    onClick={() => handleSend(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            /* Messages */
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springConfig.gentle}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      message.role === 'user'
                        ? 'bg-[var(--primary-700)] text-white rounded-br-md'
                        : 'bg-[var(--surface-100)] text-foreground rounded-bl-md'
                    }`}
                  >
                    {message.content}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t p-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Ask CribAI anything..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 rounded-full px-4"
            />
            <Button
              size="icon"
              aria-label="Send message"
              className="shrink-0 rounded-full bg-[var(--primary-700)] hover:bg-[var(--primary-800)]"
              onClick={() => handleSend()}
              disabled={!inputValue.trim()}
              aria-label="Send message"
            >
              <Send className="size-4 text-white" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
