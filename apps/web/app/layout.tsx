import type { Metadata } from 'next';
import { DM_Serif_Display, Inter } from 'next/font/google';
import './globals.css';

const dmSerif = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-dm-serif',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CampusNest — Student Housing Intelligence',
  description:
    'Find fair-priced student housing with True Cost Calculator, Price Fairness Scores, and AI-powered advice.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-[var(--surface-50)] text-[var(--surface-900)] antialiased">
        {children}
      </body>
    </html>
  );
}
