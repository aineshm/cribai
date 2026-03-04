import type { PageIndexNode } from '@campusnest/types';

export class PageIndexTraverser {
  // Phase 5 implementation — navigates tree to find relevant content
  async traverse(_tree: PageIndexNode, _query: string): Promise<string[]> {
    // TODO: Implement with Sonnet for navigation decisions
    return [];
  }
}
