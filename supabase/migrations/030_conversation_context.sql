-- Migration 030: Add conversation context + message metadata
-- Supports server-side assistant persistence and cross-message listing context

-- Conversation-level context (e.g., active listing_id for "Ask AI about listing" flows)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}';

-- Per-message metadata (e.g., listing_id, tool inputs, context version)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
