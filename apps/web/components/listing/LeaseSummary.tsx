'use client';

import { motion } from 'framer-motion';
import { Sparkles, Check, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { staggerItem } from '@/lib/animations';
import type { LeaseSummary as LeaseSummaryType } from '@/lib/mock-listing-detail';

interface LeaseSummaryProps {
  readonly leaseSummary: LeaseSummaryType;
  readonly aiSummary?: string;
}

export function LeaseSummary({ leaseSummary, aiSummary }: LeaseSummaryProps) {
  return (
    <motion.div variants={staggerItem}>
      <Card className="border-[var(--primary-200)] bg-[var(--primary-50)]/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[var(--primary-700)]">
            <Sparkles className="size-5" />
            AI Lease Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiSummary && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {aiSummary}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <DetailItem label="Lease Length" value={leaseSummary.length} />
            <DetailItem
              label="Security Deposit"
              value={`$${leaseSummary.deposit.toLocaleString()}`}
            />
            <DetailItem
              label="Pet Deposit"
              value={`$${leaseSummary.petDeposit.toLocaleString()}`}
            />
            <DetailItem
              label="Move-In Date"
              value={leaseSummary.moveInDate}
            />
          </div>

          {/* Utilities */}
          <div className="space-y-2 pt-2 border-t border-[var(--primary-200)]/50">
            <p className="text-sm font-medium text-foreground">Utilities</p>

            <div className="space-y-1.5">
              {leaseSummary.utilitiesIncluded.map((util) => (
                <div key={util} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-[var(--fair-good)] shrink-0" />
                  <span className="text-foreground">{util}</span>
                  <span className="text-muted-foreground text-xs">
                    (included)
                  </span>
                </div>
              ))}
              {leaseSummary.utilitiesTenantPaid.map((util) => (
                <div key={util} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4 text-[var(--secondary-500)] shrink-0" />
                  <span className="text-foreground">{util}</span>
                  <span className="text-muted-foreground text-xs">
                    (tenant paid)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function DetailItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
