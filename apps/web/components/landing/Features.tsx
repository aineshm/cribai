'use client';

import { motion } from 'framer-motion';
import { Sparkles, ShieldCheck, Headphones } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { staggerContainer, staggerItem } from '@/lib/animations';

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Search',
    description:
      'Tell CribAI what you need — budget, location, roommates — and get matched with apartments that actually fit your student life.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified Student Community',
    description:
      'Every user is verified with a .edu email. Browse listings from real students and landlords trusted by your campus.',
  },
  {
    icon: Headphones,
    title: 'End-to-End Support',
    description:
      'From lease term explanations to tour scheduling, CribAI handles the stressful parts so you can focus on what matters.',
  },
] as const;

export function Features() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={staggerItem}>
              <Card className="h-full border-none shadow-none ring-0 text-center">
                <CardContent className="pt-6">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-50)] text-[var(--primary-600)] group-hover/card:scale-110 transition-transform duration-300">
                    <feature.icon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 font-[family-name:var(--font-display)] text-lg text-[var(--surface-800)]">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--surface-500)] leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
