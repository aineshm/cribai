import type { PageIndexNode } from '@campusnest/types';

export class PageIndexBuilder {
  // Phase 5 implementation — builds hierarchical summary trees from listings
  async build(_campusId: string): Promise<PageIndexNode> {
    // TODO: Implement with Haiku for node summaries
    return {
      label: 'root',
      summary: 'Campus overview placeholder',
      contentRef: null,
      children: [],
    };
  }
}
