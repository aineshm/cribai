-- Migration 032: durable conversation_state for state-centric chat orchestration

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS conversation_state JSONB NOT NULL DEFAULT '{
    "version": 1,
    "mode": "browse",
    "selectedListingId": null,
    "comparedListingIds": [],
    "lastSearch": {
      "args": {},
      "resultListingIds": [],
      "generatedAt": null,
      "source": null
    },
    "activeFilters": {},
    "pendingAction": {
      "kind": null,
      "payload": null
    }
  }'::jsonb;

UPDATE conversations
SET conversation_state = jsonb_set(
  jsonb_set(
    conversation_state,
    '{mode}',
    '"listing_detail"'::jsonb,
    true
  ),
  '{selectedListingId}',
  to_jsonb(context ->> 'listing_id'),
  true
)
WHERE context ? 'listing_id'
  AND COALESCE(context ->> 'listing_id', '') <> '';
