import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { cn } from '@/lib/utils';
import { displayFont, bodyFont } from '@/lib/fonts';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

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
    <html
      lang="en"
      className={cn(
        displayFont.variable,
        bodyFont.variable,
        geist.variable,
        'font-sans'
      )}
    >
      <body className="min-h-screen bg-[var(--surface-50)] text-[var(--surface-900)] antialiased">
        {children}
        <Toaster position="top-center" richColors duration={2000} />
      </body>
    </html>
  );
}
