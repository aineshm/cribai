import { GoogleGenAI } from '@google/genai';
import type { Content, FunctionCall, Part } from '@google/genai';
import type { ChatBlock, PageIndexNode } from '@campusnest/types';
import { PageIndexTraverser } from './pageindex-traverser';
import { CRIBAI_TOOLS } from './tools/schemas';
import { executeTool } from './tools/executor';
import type { ToolContext } from './tools/types';

export interface CribAIConfig {
  readonly geminiApiKey: string;
  readonly campusName: string;
  readonly toolContext?: ToolContext;
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
  | { readonly type: 'done' };

const MAX_TOOL_CALLS = 5;
const TOTAL_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are CribAI, a knowledgeable student housing advisor. You help college students find affordable, fair-priced housing near campus.

Your strengths:
- You understand rental markets near universities
- You can explain fairness scores (1-10 scale, higher = better value)
- You know about true cost calculations (rent + utilities + parking + fees)
- You give practical, actionable advice

Guidelines:
- Be concise and friendly — students are busy
- Always mention specific data when available (prices, scores, counts)
- If you don't have enough data, say so honestly
- Never make up listing details or prices — always call search_listings or get_listing_detail
- When the user asks about specific listings, prices, or availability, USE YOUR TOOLS
- For lease/legal questions, use explain_lease_term and always include the disclaimer
- To schedule tours, collect name + email + dates first, then call schedule_tour
- Suggest next steps (e.g., "Would you like me to search for options?" or "Want to compare these?")`;

export class CribAI {
  private readonly ai: GoogleGenAI;
  private readonly traverser: PageIndexTraverser;
  private readonly campusName: string;
  private readonly toolContext: ToolContext | undefined;

  constructor(config: CribAIConfig) {
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    this.traverser = new PageIndexTraverser({ geminiApiKey: config.geminiApiKey });
    this.campusName = config.campusName;
    this.toolContext = config.toolContext;
  }

  async *chat(input: ChatInput): AsyncGenerator<ChatEvent> {
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
      ? [{ functionDeclarations: [...CRIBAI_TOOLS] }]
      : undefined;

    let toolCallCount = 0;

    // Agentic loop: Gemini may call tools, requiring re-invocation
    while (toolCallCount < MAX_TOOL_CALLS) {
      const remainingMs = TOTAL_TIMEOUT_MS - (Date.now() - startTime);
      if (remainingMs <= 0) {
        yield { type: 'text', content: '\n\n(Response timed out. Please try a simpler question.)' };
        break;
      }

      const response = await this.ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: SYSTEM_PROMPT + contextBlock,
          tools: toolsConfig,
        },
        contents,
      });

      let hasToolCalls = false;
      const functionCalls: FunctionCall[] = [];

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
      }

      // If no tool calls, we're done
      if (!hasToolCalls || !this.toolContext) {
        break;
      }

      // Process tool calls
      const functionResponseParts: Part[] = [];

      let budgetExhausted = false;
      for (const fc of functionCalls) {
        if (toolCallCount >= MAX_TOOL_CALLS) {
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
