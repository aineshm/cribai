'use client';

import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, GraduationCap, CalendarDays } from 'lucide-react';

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
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:items-start">
        <Avatar className="size-20">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={`${name}'s profile photo`} />
          ) : null}
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-foreground">
              {name}
            </h1>
            {isVerified && (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="size-3" />
                Verified Student
              </Badge>
            )}
          </div>

          <p className="mt-0.5 text-sm text-muted-foreground">{email}</p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground sm:justify-start">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="size-4" />
              {university} &middot; Class of {graduationYear}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              Member since {memberSince}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
