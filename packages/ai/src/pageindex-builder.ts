import type { GoogleGenAI } from '@google/genai';
import type { PageIndexNode } from '@campusnest/types';
import { createGeminiClient } from './gemini-client';

interface ListingRow {
  readonly id: string;
  readonly address: string;
  readonly rent_monthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
  readonly fairness_score: number | null;
}

interface BuildConfig {
  readonly geminiApiKey?: string;
}

export class PageIndexBuilder {
  private readonly ai: GoogleGenAI;

  constructor(config: BuildConfig) {
    this.ai = createGeminiClient(config.geminiApiKey);
  }

  async build(_campusId: string, listings: readonly ListingRow[]): Promise<PageIndexNode> {
    if (listings.length === 0) {
      return {
        label: 'root',
        summary: 'No active listings available.',
        contentRef: null,
        children: [],
      };
    }

    const grouped = this.groupByBedrooms(listings);
    const children: PageIndexNode[] = [];

    for (const [bedLabel, group] of Object.entries(grouped)) {
      const sectionSummary = await this.summarizeSection(bedLabel, group);
      const leafNodes = this.buildLeafNodes(group);

      children.push({
        label: bedLabel,
        summary: sectionSummary,
        contentRef: null,
        children: leafNodes,
      });
    }

    const rootSummary = await this.summarizeRoot(listings, children);

    return {
      label: 'root',
      summary: rootSummary,
      contentRef: null,
      children,
    };
  }

  private groupByBedrooms(listings: readonly ListingRow[]): Record<string, readonly ListingRow[]> {
    const groups: Record<string, ListingRow[]> = {};

    for (const listing of listings) {
      const key = listing.bedrooms === null
        ? 'Unknown'
        : listing.bedrooms === 0
          ? 'Studios'
          : `${listing.bedrooms}-Bedroom`;

      const group = groups[key] ?? [];
      group.push(listing);
      groups[key] = group;
    }

    return groups;
  }

  private buildLeafNodes(listings: readonly ListingRow[]): PageIndexNode[] {
    const sorted = [...listings].sort((a, b) => a.rent_monthly - b.rent_monthly);
    const third = Math.ceil(sorted.length / 3);

    const tiers = [
      { label: 'Budget', items: sorted.slice(0, third) },
      { label: 'Mid-range', items: sorted.slice(third, third * 2) },
      { label: 'Premium', items: sorted.slice(third * 2) },
    ].filter(t => t.items.length > 0);

    return tiers.map(tier => {
      const rents = tier.items.map(l => l.rent_monthly);
      const minRent = Math.min(...rents);
      const maxRent = Math.max(...rents);
      const avgRent = Math.round(rents.reduce((s, r) => s + r, 0) / rents.length);

      const addresses = tier.items.slice(0, 5).map(l => l.address);
      const contentData = JSON.stringify({
        listingIds: tier.items.map(l => l.id),
        priceRange: { min: minRent, max: maxRent },
        sampleAddresses: addresses,
      });

      return {
        label: tier.label,
        summary: `${tier.items.length} listings, $${minRent}-$${maxRent}/mo (avg $${avgRent})`,
        contentRef: contentData,
        children: [],
      };
    });
  }

  private async summarizeSection(
    bedLabel: string,
    listings: readonly ListingRow[],
  ): Promise<string> {
    const rents = listings.map(l => l.rent_monthly);
    const avgRent = Math.round(rents.reduce((s, r) => s + r, 0) / rents.length);
    const minRent = Math.min(...rents);
    const maxRent = Math.max(...rents);
    const avgSqft = this.avgNonNull(listings.map(l => l.sqft));
    const fairScores = listings.map(l => l.fairness_score).filter((s): s is number => s !== null);
    const avgFairness = fairScores.length > 0
      ? (fairScores.reduce((s, f) => s + f, 0) / fairScores.length).toFixed(1)
      : 'N/A';

    const prompt = `Summarize this apartment category in 2 sentences for a student:
Category: ${bedLabel}
Count: ${listings.length}
Rent range: $${minRent} - $${maxRent}/mo (avg $${avgRent})
Avg sqft: ${avgSqft ? Math.round(avgSqft) : 'unknown'}
Avg fairness score: ${avgFairness}/10
Top amenities: ${this.topAmenities(listings).join(', ')}

Be concise and helpful. Focus on value and what students should know.`;

    return this.callFlash(prompt);
  }

  private async summarizeRoot(
    listings: readonly ListingRow[],
    children: readonly PageIndexNode[],
  ): Promise<string> {
    const rents = listings.map(l => l.rent_monthly);
    const avgRent = Math.round(rents.reduce((s, r) => s + r, 0) / rents.length);

    const prompt = `Write a 2-sentence overview of this campus housing market for students:
Total listings: ${listings.length}
Average rent: $${avgRent}/mo
Categories: ${children.map(c => `${c.label} (${c.summary})`).join('; ')}

Be concise. Mention the range of options and overall market conditions.`;

    return this.callFlash(prompt);
  }

  private async callFlash(prompt: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return response.text ?? 'Summary unavailable.';
    } catch {
      return 'Summary generation temporarily unavailable.';
    }
  }

  private topAmenities(listings: readonly ListingRow[]): string[] {
    const counts: Record<string, number> = {};
    for (const l of listings) {
      for (const a of l.amenities) {
        counts[a] = (counts[a] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
  }

  private avgNonNull(values: readonly (number | null)[]): number | null {
    const nums = values.filter((v): v is number => v !== null);
    if (nums.length === 0) return null;
    return nums.reduce((s, n) => s + n, 0) / nums.length;
  }
}
