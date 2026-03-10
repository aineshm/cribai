'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { slideInFromBottom } from '@/lib/animations';

export function SteeringBar() {
  const [message, setMessage] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim()) return;
      toast.success('Instruction sent to agent');
      setMessage('');
    },
    [message]
  );

  return (
    <motion.div
      variants={slideInFromBottom}
      initial="initial"
      animate="animate"
      className="border-t border-border bg-background px-4 py-3"
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell the agent what to do next..."
          className="flex-1 text-sm"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!message.trim()}
          className="flex-shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </motion.div>
  );
}
