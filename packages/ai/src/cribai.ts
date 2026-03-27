import type { GoogleGenAI, Content, FunctionCall, Part } from '@google/genai';
import type { ChatBlock, PageIndexNode } from '@campusnest/types';
import { streamText, stepCountIs } from 'ai';
import { createGeminiClient } from './gemini-client';
import { createAiSdkProvider } from './ai-sdk-provider';
import { logTokenUsage } from './cost-logger';
import { PageIndexTraverser } from './pageindex-traverser';
import { getToolDeclarations } from './tools/schemas';
import { executeTool } from './tools/executor';
import { buildAiSdkTools } from './tools/ai-sdk-tools';
import type { ToolContext, ToolName } from './tools/types';

export interface CribAIConfig {
  readonly geminiApiKey?: string;
  readonly campusName: string;
  readonly toolContext?: ToolContext;
  readonly allowedTools?: readonly ToolName[];
  readonly maxToolCalls?: number;
  /** When true, use Vercel AI SDK with maxSteps multi-tool chaining instead of manual Gemini loop */
  readonly useAiSdk?: boolean;
}

export interface ChatInput {
  readonly query: string;
  readonly tree: PageIndexNode;
  readonly conversationHistory?: readonly { role: 'user' | 'model'; content: string }[];
}

export type ChatEvent =
  | { readonly type: 'text'; readonly content: string }
  | { readonly type: 'tool_call'; readonly name: string; readonly args: Record<string, unknown> }
  | { readonly type: 'tool_result'; readonly name: string; readonly block: ChatBlock }
  | { readonly type: 'mission_proposal'; readonly intent: string; readonly confidence: number; readonly extractedFields: Record<string, unknown> }
  | { readonly type: 'mission_request'; readonly missionType: string; readonly input: Readonly<Record<string, unknown>> }
  | { readonly type: 'mission_created'; readonly missionId: string }
  | { readonly type: 'done' };

const DEFAULT_MAX_TOOL_CALLS = 5;
const TOTAL_TIMEOUT_MS = 30_000;

const TOOL_SUMMARIES: Record<ToolName, string> = {
  search_listings:
    'search_listings — discover apartments by filters or semantic query (e.g., "quiet place with natural light")',
  get_listing_detail:
    'get_listing_detail — full details, true cost breakdown, and fairness analysis for a specific listing',
  compare_listings:
    'compare_listings — side-by-side comparison of 2-4 listings',
  schedule_tour:
    'schedule_tour — book a tour after collecting name, email, and preferred dates',
  explain_lease_term:
    'explain_lease_term — explain lease clauses and tenant rights (always include a legal disclaimer)',
  get_landlord_info:
    'get_landlord_info — landlord information and review summary for a property',
  get_saved_listings:
    'get_saved_listings — retrieve the user\'s favorited listings',
  web_search:
    'web_search — search the web when local DB results are insufficient',
  get_reviews:
    'get_reviews — community feedback and ratings for a property or landlord',
  contact_pm:
    'contact_pm — help draft an inquiry to a property manager',
  get_neighborhood_info:
    'get_neighborhood_info — walkability, safety, commute times, and local vibe for an area',
  create_sublease:
    'create_sublease — post a sublease listing through conversation (two-phase: preview then publish)',
  propose_mission:
    'propose_mission — suggest a background mission when the student needs comprehensive, multi-step help',
};

function buildSystemPrompt(
  allowedTools: readonly ToolName[],
  isGuest: boolean,
): string {
  const toolList = allowedTools.map((toolName) => `- ${TOOL_SUMMARIES[toolName]}`).join('\n');
  const guestGuardrail = isGuest
    ? `

Guest access limits:
- This user may be browsing without signing in
- Do NOT offer or imply account-only actions such as scheduling tours, saved listings, contacting property managers, or web-wide browsing
- Do NOT propose missions to guests
- If the user wants to take an action beyond browsing and comparing listings, tell them to sign in first`
    : '';

  return `You are CribAI, an AI housing agent for a .edu-verified student housing platform at UW-Madison. You have real data and tools — use them.

RULE #1 — SEARCH FIRST, ASK LATER:
When a user asks about listings, subleases, apartments, prices, or neighborhoods: CALL search_listings IMMEDIATELY. Never ask clarifying questions before searching. Examples:
- "show me subleases" → search_listings(semantic_query="sublease")
- "summer housing" → search_listings(semantic_query="sublease summer May June July August")
- "cheap 2BR" → search_listings(bedrooms=2, max_rent=1200, sort=price_asc)
- "near State Street" → search_listings(address="State Street")
After results, offer to refine.

RULE #2 — CHAIN TOOLS TO FULLY ANSWER:
You MUST call multiple tools when the question requires it. Do NOT stop after search_listings if the user asked about value, price fairness, neighborhoods, or details of specific listings.

STOP ONLY when you have all data needed for a complete answer. Decision tree:
- Got search results + user asked about a specific listing's value → call get_listing_detail
- Got search results + user asked to compare → call compare_listings
- Got listing detail + user asked about neighborhood → call get_neighborhood_info
- Got listing detail + user asked about reviews → call get_reviews
- Got search results + user just wants to browse → respond with text (no more tools needed)

Context:
- 2,500+ Zillow listings + student subleases, all searchable via search_listings
- Subleases are .edu-verified, posted by students. Treat equally with Zillow listings.
- Fairness scores (1-10) factor rent + utilities + parking + fees into true cost
- FAIRNESS & PRICING GUIDE:
  When asked "what's fair rent", "is this a good deal", or any pricing question:
  1. Use search_listings with sort='fairness' (and min_fairness filter if appropriate) to find best-value listings
  2. ALWAYS cite fairness scores from results: e.g. "This 2BR at $1,200/mo scores 7.5/10 — better value than most similar units"
  3. For deep analysis on a specific listing: call get_listing_detail which returns predicted fair rent, comparable count, and price delta
  4. Interpret the scale: 8-10 = great deal, 6-8 = fair price, 4-6 = overpriced, 1-4 = significantly overpriced
  5. Never say fairness data is unavailable — most Zillow listings have scores. Search with sort='fairness' to surface them.
- Seasons: summer=May-Aug, fall=Aug-Dec, spring=Jan-May
- Post subleases via create_sublease (conversational two-phase: preview then publish)
- For complex multi-step needs, call propose_mission. Skip for single-tool questions.

Tools (only these are available):
${toolList}

Guidelines:
- Concise and student-friendly. Cite specific data (prices, scores, counts).
- Never fabricate details. If listing is already identified, use action tools directly.
- Lease questions: use explain_lease_term + legal disclaimer.${guestGuardrail}`;
}

export class CribAI {
  private readonly ai: GoogleGenAI;
  private readonly traverser: PageIndexTraverser;
  private readonly campusName: string;
  private readonly toolContext: ToolContext | undefined;
  private readonly allowedTools: readonly ToolName[];
  private readonly maxToolCalls: number;
  private readonly geminiApiKey: string | undefined;
  private readonly useAiSdk: boolean;

  constructor(config: CribAIConfig) {
    this.ai = createGeminiClient(config.geminiApiKey);
    this.traverser = new PageIndexTraverser({ geminiApiKey: config.geminiApiKey });
    this.campusName = config.campusName;
    this.toolContext = config.toolContext;
    this.geminiApiKey = config.geminiApiKey;
    this.useAiSdk = config.useAiSdk ?? false;
    this.allowedTools =
      config.allowedTools ??
      config.toolContext?.allowedToolNames ??
      (Object.keys(TOOL_SUMMARIES) as ToolName[]);
    this.maxToolCalls =
      config.maxToolCalls ??
      (
        !config.toolContext?.userId && config.toolContext?.allowedToolNames
          ? 3
          : DEFAULT_MAX_TOOL_CALLS
      );
  }

  async *chat(input: ChatInput): AsyncGenerator<ChatEvent> {
    if (this.useAiSdk) {
      yield* this.chatAiSdk(input);
      return;
    }
    yield* this.chatLegacy(input);
  }

  /**
   * AI SDK engine: uses Vercel AI SDK streamText with maxSteps for automatic multi-tool chaining.
   * Gemini handles the tool loop internally — no manual re-invocation needed.
   */
  private async *chatAiSdk(input: ChatInput): AsyncGenerator<ChatEvent> {
    const contextChunks = await this.traverser.traverse(input.tree, input.query);

    const contextBlock = contextChunks.length > 0
      ? `\n\nRelevant housing data for ${this.campusName}:\n${contextChunks.join('\n\n')}`
      : `\n\nNo specific listing data available yet for ${this.campusName}. Answer based on general knowledge.`;

    const eventQueue: ChatEvent[] = [];
    const tools = this.toolContext
      ? buildAiSdkTools(this.toolContext, this.allowedTools, (evt) => eventQueue.push(evt))
      : {};

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...(input.conversationHistory ?? []).map(msg => ({
        role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: input.query },
    ];

    const systemPrompt = buildSystemPrompt(
      this.allowedTools,
      !this.toolContext?.userId,
    );

    const provider = createAiSdkProvider(this.geminiApiKey);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), TOTAL_TIMEOUT_MS);

    try {
      const result = streamText({
        model: provider('gemini-2.5-flash'),
        system: systemPrompt + contextBlock,
        messages,
        tools,
        stopWhen: stepCountIs(this.maxToolCalls),
        abortSignal: abortController.signal,
      });

      for await (const chunk of result.fullStream) {
        // Drain queued tool events before yielding stream chunks
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        }

        if (chunk.type === 'text-delta') {
          yield { type: 'text', content: chunk.text };
        } else if (chunk.type === 'finish-step') {
          logTokenUsage('gemini-2.5-flash', {
            promptTokenCount: chunk.usage.inputTokens,
            candidatesTokenCount: chunk.usage.outputTokens,
          });
        }
      }

      // Drain any remaining queued events
      while (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      }
    } catch (_err) {
      if (abortController.signal.aborted) {
        yield { type: 'text', content: '\n\n(Response timed out. Please try a simpler question.)' };
      } else {
        throw _err;
      }
    } finally {
      clearTimeout(timeout);
    }

    yield { type: 'done' };
  }

  /** Legacy engine: manual Gemini streaming loop with sequential tool execution. */
  private async *chatLegacy(input: ChatInput): AsyncGenerator<ChatEvent> {
    const startTime = Date.now();
    const contextChunks = await this.traverser.traverse(input.tree, input.query);

    const contextBlock = contextChunks.length > 0
      ? `\n\nRelevant housing data for ${this.campusName}:\n${contextChunks.join('\n\n')}`
      : `\n\nNo specific listing data available yet for ${this.campusName}. Answer based on general knowledge.`;

    const contents: Content[] = [
      ...(input.conversationHistory ?? []).map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }] as Part[],
      })),
      {
        role: 'user' as const,
        parts: [{ text: input.query }] as Part[],
      },
    ];

    const toolsConfig = this.toolContext
      ? [{ functionDeclarations: [...getToolDeclarations(this.allowedTools)] }]
      : undefined;

    let toolCallCount = 0;
    const systemPrompt = buildSystemPrompt(
      this.allowedTools,
      !this.toolContext?.userId,
    );

    // Agentic loop: Gemini may call tools, requiring re-invocation
    while (toolCallCount < this.maxToolCalls) {
      const remainingMs = TOTAL_TIMEOUT_MS - (Date.now() - startTime);
      if (remainingMs <= 0) {
        yield { type: 'text', content: '\n\n(Response timed out. Please try a simpler question.)' };
        break;
      }

      const response = await this.ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: systemPrompt + contextBlock,
          tools: toolsConfig,
        },
        contents,
      });

      let hasToolCalls = false;
      const functionCalls: FunctionCall[] = [];
      let lastUsageMetadata: Record<string, unknown> | undefined;

      for await (const chunk of response) {
        // Yield text parts
        if (chunk.text) {
          yield { type: 'text', content: chunk.text };
        }

        // Collect function calls from this chunk
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.functionCall) {
              hasToolCalls = true;
              functionCalls.push(part.functionCall);
            }
          }
        }

        // Track usage metadata (final chunk contains totals)
        if (chunk.usageMetadata) {
          lastUsageMetadata = chunk.usageMetadata as Record<string, unknown>;
        }
      }

      // Log token usage for cost monitoring
      logTokenUsage('gemini-2.5-flash', lastUsageMetadata as {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        cachedContentTokenCount?: number;
      } | undefined);

      // If no tool calls, we're done
      if (!hasToolCalls || !this.toolContext) {
        break;
      }

      // Process tool calls
      const functionResponseParts: Part[] = [];

      let budgetExhausted = false;
      for (const fc of functionCalls) {
        if (toolCallCount >= this.maxToolCalls) {
          yield { type: 'text', content: '\n\n(Reached maximum tool calls. Wrapping up.)' };
          budgetExhausted = true;
          break;
        }

        toolCallCount++;
        const toolName = fc.name ?? 'unknown';
        const toolArgs = (fc.args ?? {}) as Record<string, unknown>;

        // Check timeout before executing tool
        const toolRemainingMs = TOTAL_TIMEOUT_MS - (Date.now() - startTime);
        if (toolRemainingMs <= 0) {
          yield { type: 'text', content: '\n\n(Response timed out. Please try a simpler question.)' };
          budgetExhausted = true;
          break;
        }

        yield { type: 'tool_call', name: toolName, args: toolArgs };

        try {
          const result = await executeTool(toolName, toolArgs, this.toolContext);
          yield { type: 'tool_result', name: toolName, block: result.clientBlock };

          // Emit optional map block as a separate event (e.g., for semantic search results)
          if (result.mapBlock) {
            yield { type: 'tool_result', name: `${toolName}_map`, block: result.mapBlock };
          }

          // Emit mission_request if the tool wants to create a background mission
          if (result.missionRequest) {
            yield { type: 'mission_request', missionType: result.missionRequest.type, input: result.missionRequest.input };
          }

          functionResponseParts.push({
            functionResponse: {
              name: toolName,
              response: { result: result.modelContext },
            },
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Tool execution failed';
          yield {
            type: 'tool_result',
            name: toolName,
            block: { type: 'text', content: `Error: ${errorMessage}` } as ChatBlock,
          };
          functionResponseParts.push({
            functionResponse: {
              name: toolName,
              response: { error: errorMessage },
            },
          });
        }
      }

      // Append the model's function call turn + our function response turn to contents
      contents.push({
        role: 'model',
        parts: functionCalls.map(fc => ({ functionCall: fc })) as Part[],
      });

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      // If budget exhausted inside the inner loop, break the outer loop too
      if (budgetExhausted) break;

      // Loop back to get Gemini's response incorporating tool results
    }

    yield { type: 'done' };
  }
}
