'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsNav, type SettingsSection } from './SettingsNav';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { fadeIn } from '@/lib/animations';
import { createClient } from '@campusnest/supabase/client';

interface PersonalInfo {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
}

interface NotificationPrefs {
  readonly newListings: boolean;
  readonly priceDrops: boolean;
  readonly messages: boolean;
  readonly tourReminders: boolean;
}

export function AccountSettings() {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>('personal');
  const router = useRouter();

  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    fullName: '',
    email: '',
    phone: '',
  });

  function getSupabaseClient() {
    try {
      return createClient();
    } catch {
      return null;
    }
  }

  useEffect(() => {
    async function loadUser() {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setPersonalInfo({
          fullName: user.user_metadata?.full_name || user.user_metadata?.display_name || '',
          email: user.email || '',
          phone: user.user_metadata?.phone || user.phone || '',
        });
      }
    }
    loadUser();
  }, []);

  const [notifications, setNotifications] = useState<NotificationPrefs>({
    newListings: true,
    priceDrops: true,
    messages: true,
    tourReminders: false,
  });

  const updatePersonalInfo = (updates: Partial<PersonalInfo>) => {
    setPersonalInfo((prev) => ({ ...prev, ...updates }));
  };

  const updateNotification = (key: keyof NotificationPrefs, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error('Profile settings are temporarily unavailable.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { full_name: personalInfo.fullName, phone: personalInfo.phone },
    });

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    // Also update profiles table
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({
        display_name: personalInfo.fullName,
      }).eq('id', user.id);
    }

    toast.success('Profile updated');
  };

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error('Logout is temporarily unavailable.');
      return;
    }

    await supabase.auth.signOut();
    toast.info('Logged out successfully.');
    router.push('/');
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {/* Settings nav */}
      <div className="w-full md:w-56 shrink-0">
        <SettingsNav
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
      </div>

      {/* Settings content */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          {activeSection === 'personal' && (
            <motion.div
              key="personal"
              variants={fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Card>
                <CardContent className="space-y-4 pt-4">
                  <h3 className="text-base font-semibold text-foreground">
                    Personal Information
                  </h3>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="fullName" className="text-sm font-medium text-foreground">
                        Full Name
                      </label>
                      <Input
                        id="fullName"
                        value={personalInfo.fullName}
                        onChange={(e) =>
                          updatePersonalInfo({ fullName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="email" className="text-sm font-medium text-foreground">
                        Email
                      </label>
                      <Input
                        id="email"
                        type="email"
                        value={personalInfo.email}
                        disabled
                        className="opacity-60"
                      />
                      <p className="text-xs text-muted-foreground">
                        Email cannot be changed after verification.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="phone" className="text-sm font-medium text-foreground">
                        Phone
                      </label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={personalInfo.phone}
                        onChange={(e) =>
                          updatePersonalInfo({ phone: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <Button size="lg" onClick={handleSave} className="mt-2">
                    Save Changes
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeSection === 'notifications' && (
            <motion.div
              key="notifications"
              variants={fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Card>
                <CardContent className="space-y-4 pt-4">
                  <h3 className="text-base font-semibold text-foreground">
                    Notification Preferences
                  </h3>
                  <div className="space-y-4">
                    {(
                      [
                        {
                          key: 'newListings' as const,
                          label: 'New Listings',
                          desc: 'Get notified when new subleases match your criteria.',
                        },
                        {
                          key: 'priceDrops' as const,
                          label: 'Price Drops',
                          desc: 'Alerts when saved listings lower their price.',
                        },
                        {
                          key: 'messages' as const,
                          label: 'Messages',
                          desc: 'Notifications for new messages from landlords.',
                        },
                        {
                          key: 'tourReminders' as const,
                          label: 'Tour Reminders',
                          desc: 'Reminders before scheduled tours.',
                        },
                      ] as const
                    ).map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-4"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {item.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.desc}
                          </p>
                        </div>
                        <Switch
                          checked={notifications[item.key]}
                          onCheckedChange={(checked: boolean) =>
                            updateNotification(item.key, checked)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeSection === 'logout' && (
            <motion.div
              key="logout"
              variants={fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Card>
                <CardContent className="space-y-4 pt-4 text-center">
                  <h3 className="text-base font-semibold text-foreground">
                    Log Out
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to log out of CampusNest?
                  </p>
                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={handleLogout}
                    className="mt-2"
                  >
                    Log Out
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
