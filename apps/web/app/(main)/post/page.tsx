import { getCurrentUser } from '@/lib/get-current-user';
import { PostWizard } from '@/components/post/PostWizard';

export const metadata = {
  title: 'Post Sublease | CampusNest',
  description: 'List your sublease on CampusNest.',
};

export default async function PostPage() {
  const { user } = await getCurrentUser();
  return <PostWizard userEmail={user?.email} />;
}
