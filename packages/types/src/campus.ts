import { z } from 'zod';

export const campusConfigSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  universityName: z.string().min(1),
  eduDomains: z.array(z.string()),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().default('America/Chicago'),
  scrapeCron: z.string().default('0 2 * * *'),
  scrapeRadiusKm: z.number().default(5),
  config: z.object({
    avgUtilities: z.number().optional(),
    avgParking: z.number().optional(),
    commuteHubs: z.array(z.object({
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
    })).optional(),
  }).passthrough().default({}),
  isPublic: z.boolean().default(false),
  createdAt: z.string().datetime().optional(),
});

export type CampusConfig = z.infer<typeof campusConfigSchema>;
