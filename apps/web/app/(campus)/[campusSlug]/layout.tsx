import Link from 'next/link';

export default async function CampusLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;

  return (
    <div className="min-h-screen">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            CampusNest
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href={`/${campusSlug}/listings`}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Listings
            </Link>
            <Link
              href={`/${campusSlug}/cribai`}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              CribAI
            </Link>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
