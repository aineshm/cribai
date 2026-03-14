'use client';

import Link from 'next/link';
import { Github, Twitter, Instagram } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'CribAI', href: '/login' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
  ],
  Legal: [
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Cookie Policy', href: '/privacy#cookies' },
  ],
} as const;

const socialLinks = [
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Github, href: '#', label: 'GitHub' },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-[var(--surface-200)] bg-white py-12">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <span className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
              CampusNest
            </span>
            <p className="mt-2 text-sm text-[var(--surface-500)] leading-relaxed">
              Student housing, finally transparent. Powered by AI that
              understands what students actually need.
            </p>
            <div className="mt-4 flex gap-3">
              {socialLinks.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--surface-400)] hover:bg-[var(--surface-100)] hover:text-[var(--surface-600)] transition-colors"
                >
                  <social.icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-[var(--surface-800)]">
                {category}
              </h4>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--surface-500)] hover:text-[var(--primary-600)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        <p className="text-center text-xs text-[var(--surface-400)]">
          &copy; {new Date().getFullYear()} CampusNest. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
