import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">CampusNest</h1>
      <p className="mt-4 text-lg text-gray-600">
        Student housing intelligence — fair prices, honest reviews, zero scams.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/uw-madison/listings"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700"
        >
          UW-Madison
        </Link>
        <Link
          href="/ut-austin/listings"
          className="rounded-lg bg-orange-600 px-6 py-3 text-white font-medium hover:bg-orange-700"
        >
          UT Austin
        </Link>
      </div>
    </main>
  );
}
