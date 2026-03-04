import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CampusNest — Student Housing Intelligence',
  description: 'Find fair-priced student housing with True Cost Calculator, Price Fairness Scores, and AI-powered advice.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
