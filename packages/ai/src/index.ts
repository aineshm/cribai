export { PageIndexBuilder } from './pageindex-builder';
export { PageIndexTraverser } from './pageindex-traverser';
export { CribAI } from './cribai';
export type { CribAIConfig, ChatInput, ChatEvent } from './cribai';
export type { PageIndexNode } from '@campusnest/types';
export { CRIBAI_TOOLS, getToolDeclarations, executeTool } from './tools';
export type { ToolContext, ToolResult, ToolName } from './tools';
export { persistWebListing } from './tools/handlers/web-search';
export { synthesizeListingText, generateEmbedding, generateQueryEmbedding, embedChangedListings } from './embeddings';
export type { SynthesizeInput, EmbedMetrics } from './embeddings';
export { logTokenUsage } from './cost-logger';
export type { TokenUsage } from './cost-logger';
export { executeMission, runMissionQueueOnce, registerMission, getMissionDefinition, getRegisteredTypes } from './missions';
export type { MissionStep, StepContext, StepResult, MissionDefinition, ExecuteOptions } from './missions';
export { classifyIntent, shouldClassify } from './intent-classifier';
export type { IntentResult } from './intent-classifier';
export { extractListing, ExtractionError } from './extraction';
export type {
  ExtractedListing,
  ExtractListingOptions,
  ExtractionErrorCode,
} from './extraction';
export { createRequestMetricsRecorder, resolveRequestId } from './runtime/metrics';
export type {
  RequestMetricsRecorder,
  RequestMetricsIdentity,
  RequestMetricsSnapshot,
  RuntimeKind,
  MetricsClient,
  FinishOptions,
} from './runtime/metrics';

// PDR-004 Track A Days 3-4 (AIN-8) — LLM-first turn handler + supporting bits.
export { runLlmTurn } from './runtime/llm-turn';
export type { RunLlmTurnInput } from './runtime/llm-turn';
export { selectRuntime, LLM_FIRST_FLAG } from './runtime/runtime-select';
export type { SelectRuntimeInput } from './runtime/runtime-select';
export { createAiSdkModel, AI_SDK_MODEL_ID, GEMINI_FLASH_MODEL_ID } from './runtime/ai-sdk-provider';
export type { CreateAiSdkModelOptions } from './runtime/ai-sdk-provider';
export {
  buildSystemPrompt,
  composeSystemPrompt,
  getUserProfileSnippet,
  EMPTY_PROFILE_SNIPPET,
} from './runtime/system-prompt';
export type {
  SystemPromptParts,
  UserProfileSnippet,
  UserProfileFields,
  BuildSystemPromptOptions,
} from './runtime/system-prompt';
export { buildToolRegistry, TOOL_SPECS, HITL_TOOLS } from './runtime/tool-registry';
export type { ToolRegistry, ToolResultSink, ToolSpec } from './runtime/tool-registry';
export {
  ExplicitCacheMemo,
  deriveCacheKey,
} from './runtime/prompt-cache';
export type {
  ExplicitCacheHandle,
  ExplicitCacheCreator,
} from './runtime/prompt-cache';

// PDR-004 Track A Days 5-6 (AIN-9) — Langfuse observability + turn cost.
export {
  initLangfuse,
  flushLangfuse,
  isLangfuseConfigured,
} from './runtime/observability';
export type {
  LangfuseEnv,
  FlushableSpanProcessor,
  InitLangfuseOptions,
} from './runtime/observability';
export {
  projectTurnCost,
  isOverCap,
  resolveTurnCostCapUsd,
  TURN_COST_CAP_USD_DEFAULT,
} from './runtime/turn-cost';
export type { TurnUsage, TurnCost } from './runtime/turn-cost';
