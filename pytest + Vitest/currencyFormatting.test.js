/**
 * Currency formatting tests for chat output.
 *
 * Goal: prevent double currency symbols like "¥¥25,000" when the model output
 * already contains a currency symbol (e.g. "¥25,000").
 */
import { describe, it, expect } from 'vitest';
import { formatNumbersInText } from '../frontend/src/utils/currency.js';

describe('formatNumbersInText — currency symbol de-duplication', () => {
  const JPY = { code: 'JPY', symbol: '¥', position: 'before' };
  const SEK = { code: 'SEK', symbol: 'kr', position: 'after' };

  it('adds currency symbol when none present', () => {
    const out = formatNumbersInText('Revenue: 25,380,385.86', JPY);
    expect(out).toContain('**¥25,380,385.86**');
  });

  it('does not add a second symbol when one already exists (prefix)', () => {
    const out = formatNumbersInText('Revenue: ¥25,380,385.86', JPY);
    expect(out).not.toContain('¥**¥');
    expect(out).toContain('¥**25,380,385.86**');
  });

  it('does not add a second symbol when one already exists (suffix)', () => {
    const out = formatNumbersInText('Revenue: 25,380 kr', SEK);
    expect(out).not.toMatch(/kr\\s*\\*\\*.*kr/);
    expect(out).toContain('**25,380**');
    expect(out).toContain('kr');
  });
});

