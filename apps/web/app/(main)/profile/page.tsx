'use client';

import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { SavedListings } from '@/components/profile/SavedListings';
import { AccountSettings } from '@/components/profile/AccountSettings';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { pageTransition } from '@/lib/animations';
import { Heart, Settings } from 'lucide-react';

export default function ProfilePage() {
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
        name="Alex Johnson"
        email="alex.johnson@university.edu"
        university="State University"
        graduationYear="2027"
        isVerified={true}
        memberSince="Jan 2026"
      />

      {/* Tabbed Content */}
      <div className="mt-8">
        <Tabs defaultValue="saved">
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value="saved" className="gap-1.5">
              <Heart className="size-4" />
              Saved Listings
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="size-4" />
              Account Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saved">
            <SavedListings />
          </TabsContent>

          <TabsContent value="settings">
            <AccountSettings />
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
