'use client';

import { motion } from 'framer-motion';
import { Star, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { staggerItem } from '@/lib/animations';
import type { LandlordInfo } from '@/lib/mock-listing-detail';

interface LandlordCardProps {
  readonly landlord: LandlordInfo;
}

export function LandlordCard({ landlord }: LandlordCardProps) {
  const initials = landlord.name
    .split(' ')
    .map((n) => n[0])
    .join('');

  return (
    <motion.div variants={staggerItem}>
      <Card>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="size-12">
              <AvatarFallback className="bg-[var(--primary-100)] text-[var(--primary-700)] font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{landlord.name}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-0.5">
                  <Star className="size-3.5 fill-[var(--secondary-500)] text-[var(--secondary-500)]" />
                  <span>{landlord.rating}</span>
                </div>
                <span className="text-border">|</span>
                <span>{landlord.responseRate} response rate</span>
              </div>
            </div>

            <Button variant="outline" size="sm">
              <MessageCircle className="size-4" />
              Contact
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
