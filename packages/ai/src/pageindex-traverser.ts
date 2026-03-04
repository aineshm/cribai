import { GoogleGenAI } from '@google/genai';
import type { PageIndexNode } from '@campusnest/types';

interface TraverseConfig {
  readonly geminiApiKey: string;
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
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
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

  private async selectBranches(node: PageIndexNode, query: string): Promise<readonly number[]> {
    const childDescriptions = node.children.map((child, i) =>
      `[${i}] ${child.label}: ${child.summary}`
    ).join('\n');

    const prompt = `You are navigating a housing data index to answer a student's question.

Current node: ${node.label} — ${node.summary}

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
