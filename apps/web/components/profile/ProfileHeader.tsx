'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle2, GraduationCap, CalendarDays } from 'lucide-react';

interface ProfileHeaderProps {
  readonly name: string;
  readonly email: string;
  readonly university: string;
  readonly graduationYear: string;
  readonly avatarUrl?: string;
  readonly isVerified: boolean;
  readonly memberSince: string;
}

export function ProfileHeader({
  name,
  email,
  university,
  graduationYear,
  avatarUrl,
  isVerified,
  memberSince,
}: ProfileHeaderProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <Avatar className="size-24 shrink-0 bg-red-800 text-3xl font-bold">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={`${name}'s profile photo`} />
          ) : null}
          <AvatarFallback className="bg-red-800 text-2xl font-bold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-gray-900">
              {name}
            </h1>
            {isVerified && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
                <CheckCircle2 className="size-3.5" />
                Verified Student
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-gray-500">{email}</p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500 sm:justify-start">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="size-4 text-red-700" />
              {university} &middot; Class of {graduationYear}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-red-700" />
              Member since {memberSince}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
