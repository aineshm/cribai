import { redirect } from 'next/navigation';

/**
 * Old campus-scoped listings route — redirects to the new AI-native explore page.
 * Kept as a redirect (not deleted) to handle existing links and bookmarks.
 */
export default function ListingsPage() {
  redirect('/explore');
}
