---
created: 2026-03-09T16:28:22.588Z
title: Evaluate supermemory.ai for chat memory and context
area: ai
files:
  - packages/ai/src/cribai.ts
  - apps/web/components/cribai-chat.tsx
  - supabase/migrations/010_chat_conversations.sql
---

## Problem

CribAI currently stores chat history in a simple conversations/messages table (Phase 6). There's no semantic memory layer — the agent can't recall user preferences across sessions (e.g., "I prefer places with parking" from 3 conversations ago), build a user profile over time, or use past context to improve recommendations.

supermemory.ai (https://supermemory.ai) offers a memory layer for AI apps that could provide:
- Persistent user preference memory across chat sessions
- Listing context retrieval (semantic search over previously discussed listings)
- User profile building from conversation history
- Potentially replacing or augmenting the PageIndex RAG approach

## Solution

1. Review supermemory.ai docs and pricing — check if it fits the $49/month GCP budget constraint
2. Evaluate whether it can replace the current conversations table or layer on top
3. Prototype: store user preferences from CribAI conversations, retrieve in future sessions
4. Compare against building a simple preference extraction pipeline with Gemini + Supabase pgvector
