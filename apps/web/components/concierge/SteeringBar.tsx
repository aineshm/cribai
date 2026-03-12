'use client';

/**
 * SteeringBar — input bar for submitting natural-language corrections to a
 * running mission. POSTs to POST /api/missions/[id]/steer.
 */

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { slideInFromBottom } from '@/lib/animations';

interface SteeringBarProps {
  readonly missionId: string;
}

export function SteeringBar({ missionId }: SteeringBarProps) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim() || submitting) return;

      setSubmitting(true);
      try {
        const res = await fetch(`/api/missions/${missionId}/steer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: message.trim() }),
        });

        if (res.ok) {
          toast.success('Instruction sent to agent');
          setMessage('');
        } else {
          const data = await res.json().catch(() => ({})) as { error?: string };
          toast.error(data.error ?? 'Failed to send instruction. Please try again.');
        }
      } catch (err) {
        console.error('[SteeringBar] steer request failed:', err);
        toast.error('Failed to send instruction. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [message, missionId, submitting],
  );

  return (
    <motion.div
      variants={slideInFromBottom}
      initial="initial"
      animate="animate"
      className="border-t border-border bg-background px-4 py-3"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex items-center gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell the agent what to do next..."
          className="flex-1 text-sm"
          disabled={submitting}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!message.trim() || submitting}
          className="flex-shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </motion.div>
  );
}
