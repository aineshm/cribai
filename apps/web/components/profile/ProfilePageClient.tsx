'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { SavedListings } from '@/components/profile/SavedListings';
import { MyListings } from '@/components/profile/MyListings';
import { AccountSettings } from '@/components/profile/AccountSettings';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { pageTransition } from '@/lib/animations';
import { Heart, Settings, MessageSquare, Sparkles, Home } from 'lucide-react';

interface SavedListingItem {
  readonly id: string;
  readonly title: string;
  readonly address: string;
  readonly price: number;
  readonly imageUrl?: string;
}

interface MyListingItem {
  readonly id: string;
  readonly address: string;
  readonly price: number;
  readonly beds: number | null;
  readonly source: string;
  readonly availableDate: string | null;
  readonly photoUrl: string | null;
}

interface ProfilePageClientProps {
  readonly name: string;
  readonly email: string;
  readonly university: string;
  readonly graduationYear: string;
  readonly memberSince: string;
  readonly isVerified: boolean;
  readonly savedListings?: ReadonlyArray<SavedListingItem>;
  readonly myListings?: ReadonlyArray<MyListingItem>;
}

export function ProfilePageClient({
  name,
  email,
  university,
  graduationYear,
  memberSince,
  isVerified,
  savedListings,
  myListings,
}: ProfilePageClientProps) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs = ['saved', 'my-listings', 'chats', 'settings'] as const;
  const defaultTab = validTabs.includes(tabParam as typeof validTabs[number]) ? tabParam! : 'saved';

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
      className="mx-auto max-w-4xl px-4 py-8"
    >
      {/* Profile Header */}
      <ProfileHeader
        name={name}
        email={email}
        university={university}
        graduationYear={graduationYear}
        isVerified={isVerified}
        memberSince={memberSince}
      />

      {/* Tabbed Content */}
      <div className="mt-8">
        <Tabs defaultValue={defaultTab}>
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value="saved" className="gap-1.5">
              <Heart className="size-4" />
              Saved
            </TabsTrigger>
            <TabsTrigger value="my-listings" className="gap-1.5">
              <Home className="size-4" />
              My Listings
            </TabsTrigger>
            <TabsTrigger value="chats" className="gap-1.5">
              <MessageSquare className="size-4" />
              Chat History
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="size-4" />
              Account Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saved">
            <SavedListings listings={savedListings} />
          </TabsContent>

          <TabsContent value="my-listings">
            <MyListings listings={myListings} />
          </TabsContent>

          <TabsContent value="chats">
            <ChatHistoryTab />
          </TabsContent>

          <TabsContent value="settings">
            <AccountSettings />
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}

interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly lastMessagePreview: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function ChatHistoryTab() {
  const router = useRouter();
  const [conversations, setConversations] = useState<readonly Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = (await res.json()) as { conversations: Conversation[] };
        setConversations(data.conversations);
      }
    } catch {
      // Silently fail — empty state is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-800 border-t-transparent" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 mb-4">
          <Sparkles className="size-7 text-red-600" />
        </div>
        <p className="font-[family-name:var(--font-display)] text-lg font-bold text-gray-900">
          No conversations yet
        </p>
        <p className="mt-2 text-sm text-gray-500 max-w-xs">
          Start chatting on Discover to find apartments and your conversations will appear here.
        </p>
        <a
          href="/explore"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-900 transition-colors"
        >
          Open Discover
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          type="button"
          onClick={() => router.push(`/chat?conversation=${conv.id}`)}
          className="w-full text-left p-4 rounded-2xl border border-gray-100 bg-white hover:border-red-200 hover:bg-red-50/30 transition-all"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <MessageSquare className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{conv.title}</p>
              {conv.lastMessagePreview && (
                <p className="mt-1 text-xs text-gray-500 line-clamp-1">{conv.lastMessagePreview}</p>
              )}
              <p className="mt-1.5 text-xs text-gray-400">
                {new Date(conv.updatedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
