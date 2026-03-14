import type { GoogleGenAI } from '@google/genai';
import type { PageIndexNode } from '@campusnest/types';
import { createGeminiClient } from './gemini-client';

interface TraverseConfig {
  readonly geminiApiKey?: string;
  readonly maxDepth?: number;
  readonly maxBranches?: number;
  readonly timeoutMs?: number;
}

export class PageIndexTraverser {
  private readonly ai: GoogleGenAI;
  private readonly maxDepth: number;
  private readonly maxBranches: number;
  private readonly timeoutMs: number;

  constructor(config: TraverseConfig) {
    this.ai = createGeminiClient(config.geminiApiKey);
    this.maxDepth = config.maxDepth ?? 3;
    this.maxBranches = config.maxBranches ?? 3;
    this.timeoutMs = config.timeoutMs ?? 8000;
  }

  async traverse(tree: PageIndexNode, query: string): Promise<readonly string[]> {
    const startTime = Date.now();
    const collectedContent: string[] = [];

    await this.descend(tree, query, 0, startTime, collectedContent);

    return collectedContent;
  }

  private async descend(
    node: PageIndexNode,
    query: string,
    depth: number,
    startTime: number,
    collected: string[],
  ): Promise<void> {
    if (Date.now() - startTime > this.timeoutMs) return;
    if (depth >= this.maxDepth) {
      if (node.contentRef) collected.push(node.contentRef);
      return;
    }

    if (node.children.length === 0) {
      if (node.contentRef) collected.push(node.contentRef);
      return;
    }

    const selectedIndices = await this.selectBranches(node, query);

    for (const idx of selectedIndices) {
      const child = node.children[idx];
      if (idx >= 0 && idx < node.children.length && child) {
        await this.descend(child, query, depth + 1, startTime, collected);
      }
    }
  }

  /**
   * Strips instruction-like patterns from node labels/summaries to prevent
   * prompt injection via crafted PageIndex data. These values are system-generated
   * (from rebuild-pageindex edge function) so risk is low, but defense-in-depth.
   */
  private sanitizeNodeText(text: string): string {
    return text
      .replace(/^(SYSTEM|IGNORE|INSTRUCTION|OVERRIDE|ADMIN|PROMPT|EXECUTE|RUN|COMMAND):.*/gim, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim();
  }

  private async selectBranches(node: PageIndexNode, query: string): Promise<readonly number[]> {
    const childDescriptions = node.children.map((child, i) =>
      `[${i}] ${this.sanitizeNodeText(child.label)}: ${this.sanitizeNodeText(child.summary)}`
    ).join('\n');

    const sanitizedLabel = this.sanitizeNodeText(node.label);
    const sanitizedSummary = this.sanitizeNodeText(node.summary);

    const prompt = `You are navigating a housing data index to answer a student's question.

Current node: ${sanitizedLabel} — ${sanitizedSummary}

Available sections:
${childDescriptions}

Student's question: "${query}"

Which sections (by index number) are most relevant? Return ONLY comma-separated numbers, nothing else. Pick up to ${this.maxBranches}.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text ?? '';
      const indices = text
        .split(',')
        .map((s: string) => parseInt(s.trim(), 10))
        .filter((n: number) => !isNaN(n));

      return indices.length > 0 ? indices.slice(0, this.maxBranches) : [0];
    } catch {
      return [0];
    }
  }
}
