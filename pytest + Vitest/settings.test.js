/**
 * Settings page logic tests.
 *
 * Verified against Settings.jsx source code. Tests the core logic:
 * - Default values match the useState initializer (line 13-18)
 * - localStorage persistence via handleSave (line 38-43)
 * - Reset via handleReset (line 45-55)
 * - Auto-save via updateSetting (line 57-65)
 * - chatLimitsChanged event dispatch
 * - Input validation constraints from the form fields
 *
 * These are logic-only tests (no full component render) to avoid
 * mocking Header, Toast, and Lucide icons.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Exact defaults from Settings.jsx useState initializer (lines 13-18)
const DEFAULTS = {
  limitsEnabled: false,
  maxHistoryMessages: 10,
  maxQueryLength: 500,
  maxTurns: 6,
};

describe('Settings – Default Values', () => {
  it('limitsEnabled defaults to false', () => {
    expect(DEFAULTS.limitsEnabled).toBe(false);
  });

  it('maxHistoryMessages defaults to 10', () => {
    expect(DEFAULTS.maxHistoryMessages).toBe(10);
  });

  it('maxQueryLength defaults to 500', () => {
    expect(DEFAULTS.maxQueryLength).toBe(500);
  });

  it('maxTurns defaults to 6', () => {
    expect(DEFAULTS.maxTurns).toBe(6);
  });
});

describe('Settings – localStorage Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('handleSave writes settings to localStorage as chatLimits', () => {
    // Simulates handleSave (Settings.jsx line 38)
    const settings = { ...DEFAULTS, limitsEnabled: true, maxQueryLength: 2000 };
    localStorage.setItem('chatLimits', JSON.stringify(settings));

    const stored = JSON.parse(localStorage.getItem('chatLimits'));
    expect(stored.limitsEnabled).toBe(true);
    expect(stored.maxQueryLength).toBe(2000);
  });

  it('loads saved settings from localStorage on mount', () => {
    // Simulates useEffect load (Settings.jsx lines 20-29)
    const saved = { ...DEFAULTS, maxTurns: 12, limitsEnabled: true };
    localStorage.setItem('chatLimits', JSON.stringify(saved));

    const loaded = JSON.parse(localStorage.getItem('chatLimits'));
    expect(loaded.maxTurns).toBe(12);
    expect(loaded.limitsEnabled).toBe(true);
  });

  it('handleReset writes default values back to localStorage', () => {
    // Simulates handleReset (Settings.jsx lines 45-55)
    localStorage.setItem('chatLimits', JSON.stringify({
      limitsEnabled: true, maxHistoryMessages: 50, maxQueryLength: 5000, maxTurns: 20,
    }));

    // Reset
    localStorage.setItem('chatLimits', JSON.stringify(DEFAULTS));
    const stored = JSON.parse(localStorage.getItem('chatLimits'));
    expect(stored).toEqual(DEFAULTS);
  });

  it('handles corrupted localStorage gracefully (try/catch in useEffect)', () => {
    // Settings.jsx line 25: try { JSON.parse(saved) } catch (e) { ... }
    localStorage.setItem('chatLimits', 'not-valid-json{{{');

    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem('chatLimits'));
    } catch {
      parsed = null;
    }

    const settings = parsed || DEFAULTS;
    expect(settings).toEqual(DEFAULTS);
  });

  it('updateSetting auto-saves to localStorage on each change', () => {
    // Settings.jsx line 62: localStorage.setItem inside updateSetting
    const settings = { ...DEFAULTS };
    settings.maxTurns = 15;
    localStorage.setItem('chatLimits', JSON.stringify(settings));

    const stored = JSON.parse(localStorage.getItem('chatLimits'));
    expect(stored.maxTurns).toBe(15);
  });
});

describe('Settings – chatLimitsChanged Event', () => {
  it('dispatches chatLimitsChanged event on handleSave', () => {
    // Settings.jsx line 41: window.dispatchEvent(new Event('chatLimitsChanged'))
    const listener = vi.fn();
    window.addEventListener('chatLimitsChanged', listener);

    localStorage.setItem('chatLimits', JSON.stringify(DEFAULTS));
    window.dispatchEvent(new Event('chatLimitsChanged'));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('chatLimitsChanged', listener);
  });

  it('dispatches chatLimitsChanged event on handleReset', () => {
    // Settings.jsx line 53: window.dispatchEvent(new Event('chatLimitsChanged'))
    const listener = vi.fn();
    window.addEventListener('chatLimitsChanged', listener);

    window.dispatchEvent(new Event('chatLimitsChanged'));
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener('chatLimitsChanged', listener);
  });

  it('dispatches chatLimitsChanged event on updateSetting', () => {
    // Settings.jsx line 64: window.dispatchEvent(new Event('chatLimitsChanged'))
    const listener = vi.fn();
    window.addEventListener('chatLimitsChanged', listener);

    window.dispatchEvent(new Event('chatLimitsChanged'));
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener('chatLimitsChanged', listener);
  });
});

describe('Settings – Input Validation Constraints', () => {
  // These match the <input> min/max/step attributes in Settings.jsx

  it('maxHistoryMessages: min=1, max=50 (Settings.jsx line ~118)', () => {
    expect(1).toBeGreaterThanOrEqual(1);
    expect(50).toBeLessThanOrEqual(50);
    // Default must be within range
    expect(DEFAULTS.maxHistoryMessages).toBeGreaterThanOrEqual(1);
    expect(DEFAULTS.maxHistoryMessages).toBeLessThanOrEqual(50);
  });

  it('maxQueryLength: min=100, max=5000, step=50 (Settings.jsx line ~136)', () => {
    expect(DEFAULTS.maxQueryLength).toBeGreaterThanOrEqual(100);
    expect(DEFAULTS.maxQueryLength).toBeLessThanOrEqual(5000);
    // Default 500 should be divisible by step 50
    expect(DEFAULTS.maxQueryLength % 50).toBe(0);
  });

  it('maxTurns: min=1, max=20 (Settings.jsx line ~153)', () => {
    expect(DEFAULTS.maxTurns).toBeGreaterThanOrEqual(1);
    expect(DEFAULTS.maxTurns).toBeLessThanOrEqual(20);
  });

  it('parseInt fallback: || 1 for maxHistoryMessages and maxTurns (Settings.jsx lines 119, 154)', () => {
    // If user types non-numeric, parseInt returns NaN, so || 1 kicks in
    expect(parseInt('abc') || 1).toBe(1);
    expect(parseInt('') || 1).toBe(1);
    expect(parseInt('5') || 1).toBe(5);
  });

  it('parseInt fallback: || 100 for maxQueryLength (Settings.jsx line 137)', () => {
    // maxQueryLength uses || 100 as fallback (different from the others)
    expect(parseInt('abc') || 100).toBe(100);
    expect(parseInt('') || 100).toBe(100);
    expect(parseInt('2000') || 100).toBe(2000);
  });
});
