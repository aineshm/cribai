import { z } from 'zod';

export const priceChangePayloadSchema = z.object({
  old_price: z.number(),
  new_price: z.number(),
  listing_address: z.string(),
});

export const notificationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: z.enum(['price_change', 'listing_inactive']),
  listing_id: z.string().uuid().nullable(),
  payload: z.record(z.unknown()),
  is_read: z.boolean(),
  created_at: z.string().datetime(),
});

export type Notification = z.infer<typeof notificationSchema>;
export type PriceChangePayload = z.infer<typeof priceChangePayloadSchema>;
