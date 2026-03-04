import { z } from 'zod';

export const pageIndexNodeSchema: z.ZodType<PageIndexNode> = z.lazy(() =>
  z.object({
    label: z.string(),
    summary: z.string(),
    contentRef: z.string().nullable(),
    children: z.array(pageIndexNodeSchema).default([]),
  })
) as z.ZodType<PageIndexNode>;

export interface PageIndexNode {
  readonly label: string;
  readonly summary: string;
  readonly contentRef: string | null;
  readonly children: readonly PageIndexNode[];
}

export const pageindexTreeSchema = z.object({
  id: z.string().uuid(),
  campusId: z.string().uuid(),
  entityType: z.string(),
  tree: pageIndexNodeSchema,
  leafCount: z.number().default(0),
  builtAt: z.string().datetime().optional(),
});

export type PageIndexTree = z.infer<typeof pageindexTreeSchema>;
