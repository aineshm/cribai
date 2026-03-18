'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PostRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/chat');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Redirecting to chat...</p>
    </div>
  );
}
