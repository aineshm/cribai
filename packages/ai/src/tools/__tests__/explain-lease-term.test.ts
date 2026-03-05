import { describe, it, expect } from 'vitest';
import { explainLeaseTerm } from '../handlers/explain-lease-term';
import { LEGAL_DISCLAIMER } from '../../knowledge/lease-terms';

describe('explainLeaseTerm', () => {
  it('returns explanation for known term', async () => {
    const result = await explainLeaseTerm({ term: 'security deposit' });

    expect(result.clientBlock.type).toBe('legal_disclaimer');
    if (result.clientBlock.type === 'legal_disclaimer') {
      expect(result.clientBlock.term).toBe('Security Deposit');
      expect(result.clientBlock.explanation).toContain('refundable');
      expect(result.clientBlock.disclaimer).toBe(LEGAL_DISCLAIMER);
    }
    expect(result.modelContext).toContain('Security Deposit');
    expect(result.modelContext).toContain(LEGAL_DISCLAIMER);
  });

  it('returns fallback for unknown term', async () => {
    const result = await explainLeaseTerm({ term: 'quantum entanglement' });

    expect(result.clientBlock.type).toBe('legal_disclaimer');
    if (result.clientBlock.type === 'legal_disclaimer') {
      expect(result.clientBlock.disclaimer).toBe(LEGAL_DISCLAIMER);
    }
    expect(result.modelContext).toContain('No specific knowledge base entry');
  });

  it('matches partial term', async () => {
    const result = await explainLeaseTerm({ term: 'joint and several liability' });

    expect(result.clientBlock.type).toBe('legal_disclaimer');
    if (result.clientBlock.type === 'legal_disclaimer') {
      expect(result.clientBlock.term).toBe('Joint and Several Liability');
    }
  });

  it('always includes disclaimer in model context', async () => {
    const result = await explainLeaseTerm({ term: 'quiet enjoyment' });
    expect(result.modelContext).toContain(LEGAL_DISCLAIMER);
  });

  it('throws on empty term', async () => {
    await expect(explainLeaseTerm({ term: '' })).rejects.toThrow();
  });
});
