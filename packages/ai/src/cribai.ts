import { GoogleGenAI } from '@google/genai';
import type { PageIndexNode } from '@campusnest/types';
import { PageIndexTraverser } from './pageindex-traverser';

interface CribAIConfig {
  readonly geminiApiKey: string;
  readonly campusName: string;
}

interface ChatInput {
  readonly query: string;
  readonly tree: PageIndexNode;
  readonly conversationHistory?: readonly { role: 'user' | 'model'; content: string }[];
}

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
- Never make up listing details or prices
- Suggest next steps (e.g., "check the listings page for current options")`;

export class CribAI {
  private readonly ai: GoogleGenAI;
  private readonly traverser: PageIndexTraverser;
  private readonly campusName: string;

  constructor(config: CribAIConfig) {
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    this.traverser = new PageIndexTraverser({ geminiApiKey: config.geminiApiKey });
    this.campusName = config.campusName;
  }

  async *chat(input: ChatInput): AsyncGenerator<string> {
    const contextChunks = await this.traverser.traverse(input.tree, input.query);

    const contextBlock = contextChunks.length > 0
      ? `\n\nRelevant housing data for ${this.campusName}:\n${contextChunks.join('\n\n')}`
      : `\n\nNo specific listing data available yet for ${this.campusName}. Answer based on general knowledge.`;

    const contents = [
      ...(input.conversationHistory ?? []).map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: input.query }],
      },
    ];

    const response = await this.ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: SYSTEM_PROMPT + contextBlock,
      },
      contents,
    });

    for await (const chunk of response) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }
}
