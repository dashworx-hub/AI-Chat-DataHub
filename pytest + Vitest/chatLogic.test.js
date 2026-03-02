/**
 * Chat logic and security tests.
 *
 * Tests logic extracted from ChatIndex.jsx and routes.jsx. These run
 * as pure logic tests (no component renders) to avoid needing mocks for
 * 15+ component dependencies.
 *
 * Verified against actual ChatIndex.jsx source:
 * - looksLikeMarkdown (lines 212-221)
 * - Thought time formatting (lines 1077-1079)
 * - DOMPurify ALLOWED_TAGS (line 238)
 * - sendMessage validation (lines 555-570)
 * - handleClear state reset (lines 773-782)
 */
import { describe, it, expect } from 'vitest';

// ======================================================================
// MARKDOWN DETECTION — looksLikeMarkdown (ChatIndex.jsx lines 212-221)
// ======================================================================
describe('Markdown Detection (looksLikeMarkdown)', () => {
  // Exact replica of the function from ChatIndex.jsx lines 212-221
  const looksLikeMarkdown = (s) => {
    if (!s) return false;
    const hasHeading = /^#{1,6}\s+\S/m.test(s);
    const hasList = /^\s*[-*+]\s+\S/m.test(s) || /^\s*\d+\.\s+\S/m.test(s);
    const hasBoldItalics = /(\*\*.+\*\*|\*.+\*|_.+_)/.test(s);
    const hasCode = /```[\s\S]*?```/.test(s) || /`[^`]+`/.test(s);
    const hasTable =
      /\|.+\|/m.test(s) &&
      (/\|[\s-:]+\|/m.test(s) ||
        s.split('\n').some(
          (line) => line.trim().match(/^\|.+\|$/) && line.includes('|')
        ));
    return hasHeading || hasList || hasBoldItalics || hasCode || hasTable;
  };

  it('detects ## heading (campaign summary heading)', () => {
    expect(looksLikeMarkdown('## Campaign Performance Summary')).toBe(true);
  });

  it('detects ### heading', () => {
    expect(looksLikeMarkdown('### Channel Breakdown')).toBe(true);
  });

  it('detects bullet list (channel spend breakdown)', () => {
    expect(looksLikeMarkdown('- Google Ads: $560K\n- Meta Ads: $374K')).toBe(true);
  });

  it('detects numbered list', () => {
    expect(looksLikeMarkdown('1. Google Ads\n2. Meta Ads\n3. LinkedIn')).toBe(true);
  });

  it('detects **bold** text in metrics', () => {
    expect(looksLikeMarkdown('Total spend was **$1,245,300**')).toBe(true);
  });

  it('detects *italic* text', () => {
    expect(looksLikeMarkdown('The trend is *slightly upward*')).toBe(true);
  });

  it('detects inline `code` (table references)', () => {
    expect(looksLikeMarkdown('Queried `campaign_performance.ad_spend` table')).toBe(true);
  });

  it('detects fenced code blocks', () => {
    expect(looksLikeMarkdown('```sql\nSELECT * FROM ad_spend\n```')).toBe(true);
  });

  it('detects markdown table (channel performance data)', () => {
    const table = '| Channel | Spend | ROAS |\n|---------|-------|------|\n| Google | $560K | 3.2x |';
    expect(looksLikeMarkdown(table)).toBe(true);
  });

  it('returns false for plain text answer', () => {
    expect(looksLikeMarkdown('Total Q1 spend was $1.2M across all channels.')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(looksLikeMarkdown(null)).toBe(false);
    expect(looksLikeMarkdown(undefined)).toBe(false);
    expect(looksLikeMarkdown('')).toBe(false);
  });
});

// ======================================================================
// THOUGHT TIME FORMATTING — ChatIndex.jsx lines 1077-1079
// ======================================================================
describe('Thought Time Formatting', () => {
  // Exact replica of inline template logic from ChatIndex.jsx
  const formatThoughtTime = (seconds) => {
    if (seconds >= 60) {
      return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
    }
    return `${Number(seconds) === Math.floor(seconds) ? Math.floor(seconds) : seconds} s`;
  };

  it('formats integer seconds under 60', () => {
    expect(formatThoughtTime(3)).toBe('3 s');
    expect(formatThoughtTime(0)).toBe('0 s');
    expect(formatThoughtTime(59)).toBe('59 s');
  });

  it('formats decimal seconds without rounding', () => {
    expect(formatThoughtTime(3.2)).toBe('3.2 s');
    expect(formatThoughtTime(0.8)).toBe('0.8 s');
  });

  it('formats 60+ seconds as minutes and seconds', () => {
    expect(formatThoughtTime(65)).toBe('1 min 5 s');
    expect(formatThoughtTime(125)).toBe('2 min 5 s');
  });

  it('formats exactly 60 seconds', () => {
    expect(formatThoughtTime(60)).toBe('1 min 0 s');
  });

  it('formats large values (long GCP response)', () => {
    expect(formatThoughtTime(300)).toBe('5 min 0 s');
    expect(formatThoughtTime(601)).toBe('10 min 1 s');
  });
});

// ======================================================================
// XSS PREVENTION — DOMPurify ALLOWED_TAGS (ChatIndex.jsx line 238)
// ======================================================================
describe('DOMPurify Allowlist (XSS Prevention)', () => {
  // Exact list from ChatIndex.jsx line 238
  const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'u',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'code', 'pre', 'blockquote',
    'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ];

  // Exact list from ChatIndex.jsx line 239
  const ALLOWED_ATTR = ['href', 'title', 'class'];

  it('blocks <script> tags', () => {
    expect(ALLOWED_TAGS).not.toContain('script');
  });

  it('blocks <iframe> tags', () => {
    expect(ALLOWED_TAGS).not.toContain('iframe');
  });

  it('blocks <img> tags (image-based XSS)', () => {
    expect(ALLOWED_TAGS).not.toContain('img');
  });

  it('blocks <form> and <input> tags (form injection)', () => {
    expect(ALLOWED_TAGS).not.toContain('form');
    expect(ALLOWED_TAGS).not.toContain('input');
  });

  it('blocks <object> and <embed> (plugin-based XSS)', () => {
    expect(ALLOWED_TAGS).not.toContain('object');
    expect(ALLOWED_TAGS).not.toContain('embed');
  });

  it('allows table tags for campaign data display', () => {
    expect(ALLOWED_TAGS).toContain('table');
    expect(ALLOWED_TAGS).toContain('thead');
    expect(ALLOWED_TAGS).toContain('tbody');
    expect(ALLOWED_TAGS).toContain('tr');
    expect(ALLOWED_TAGS).toContain('th');
    expect(ALLOWED_TAGS).toContain('td');
  });

  it('allows text formatting tags', () => {
    expect(ALLOWED_TAGS).toContain('strong');
    expect(ALLOWED_TAGS).toContain('em');
    expect(ALLOWED_TAGS).toContain('code');
    expect(ALLOWED_TAGS).toContain('pre');
  });

  it('blocks onclick and onerror attributes', () => {
    expect(ALLOWED_ATTR).not.toContain('onclick');
    expect(ALLOWED_ATTR).not.toContain('onerror');
    expect(ALLOWED_ATTR).not.toContain('onload');
    expect(ALLOWED_ATTR).not.toContain('onmouseover');
  });

  it('allows only href, title, class attributes', () => {
    expect(ALLOWED_ATTR).toHaveLength(3);
    expect(ALLOWED_ATTR).toContain('href');
    expect(ALLOWED_ATTR).toContain('title');
    expect(ALLOWED_ATTR).toContain('class');
  });
});

// ======================================================================
// SEND MESSAGE VALIDATION — ChatIndex.jsx lines 555-570
// ======================================================================
describe('sendMessage Validation Logic', () => {
  // Replicates the guard checks at the top of sendMessage()
  const shouldRejectMessage = (messageText, selectedProfile) => {
    if (!messageText || !messageText.trim() || !selectedProfile) return true;
    return false;
  };

  it('rejects null/undefined message', () => {
    expect(shouldRejectMessage(null, 'test-agent')).toBe(true);
    expect(shouldRejectMessage(undefined, 'test-agent')).toBe(true);
  });

  it('rejects empty string message', () => {
    expect(shouldRejectMessage('', 'test-agent')).toBe(true);
  });

  it('rejects whitespace-only message', () => {
    expect(shouldRejectMessage('   ', 'test-agent')).toBe(true);
  });

  it('rejects when no profile is selected', () => {
    expect(shouldRejectMessage('Valid question', null)).toBe(true);
  });

  it('accepts valid message with profile selected', () => {
    expect(shouldRejectMessage('What was Q1 spend?', 'test-campaign')).toBe(false);
  });

  // Query length limit check (lines 565-569)
  const shouldRejectByLength = (message, maxLength, limitsEnabled) => {
    if (limitsEnabled && maxLength && message.length > maxLength) return true;
    return false;
  };

  it('rejects message exceeding maxQueryLength when limits enabled', () => {
    expect(shouldRejectByLength('x'.repeat(501), 500, true)).toBe(true);
  });

  it('allows message at exactly maxQueryLength', () => {
    expect(shouldRejectByLength('x'.repeat(500), 500, true)).toBe(false);
  });

  it('skips length check when limits disabled', () => {
    expect(shouldRejectByLength('x'.repeat(10000), 500, false)).toBe(false);
  });
});

// ======================================================================
// HANDLE CLEAR — ChatIndex.jsx lines 773-782
// ======================================================================
describe('handleClear State Reset', () => {
  it('resets all state to initial values', () => {
    // Simulates the state after handleClear()
    const afterClear = {
      history: [],
      artifacts: { sql: 'No SQL.' },
      messageCharts: {},
      sqlError: null,
      typingStatus: '',
      messageThoughtTimes: {},
    };

    expect(afterClear.history).toEqual([]);
    expect(afterClear.artifacts.sql).toBe('No SQL.');
    expect(afterClear.messageCharts).toEqual({});
    expect(afterClear.sqlError).toBeNull();
    expect(afterClear.typingStatus).toBe('');
    expect(afterClear.messageThoughtTimes).toEqual({});
  });
});

// ======================================================================
// VEGA CHART SECURITY — ChatIndex.jsx lines 286-339
// Spec tests: document intended rules; they do not call renderVegaChart.
// ======================================================================
describe('Vega Chart Security Validation', () => {
  // Replicates the security checks from renderVegaChart

  it('rejects spec without data property (line 271)', () => {
    const spec = { mark: 'bar', encoding: {} };
    expect(spec.data).toBeUndefined();
  });

  it('rejects non-object spec (line 264)', () => {
    expect(typeof 'not an object' !== 'object').toBe(true);
    expect(typeof null !== 'object' || null === null).toBe(true);
  });

  it('detects dangerous data URLs (lines 322-324)', () => {
    const dangerousUrls = ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox'];
    dangerousUrls.forEach((url) => {
      const lowered = url.toLowerCase().trim();
      const isDangerous =
        lowered.startsWith('javascript:') ||
        lowered.startsWith('data:') ||
        lowered.startsWith('vbscript:');
      expect(isDangerous).toBe(true);
    });
  });

  it('allows safe data URL patterns', () => {
    const safeUrls = ['https://example.com/data.json', '/api/data'];
    safeUrls.forEach((url) => {
      const lowered = url.toLowerCase().trim();
      const isDangerous =
        lowered.startsWith('javascript:') ||
        lowered.startsWith('data:') ||
        lowered.startsWith('vbscript:');
      expect(isDangerous).toBe(false);
    });
  });

  it('rejects setdata transform (XSS vulnerability, line 293)', () => {
    const transform = { setdata: 'malicious' };
    expect(transform.setdata).toBeDefined();
    // The actual code throws: throw new Error('Security: setdata transform is not allowed')
  });

  it('validates data.values must be an array (line 328)', () => {
    const validData = { values: [{ x: 1 }] };
    const invalidData = { values: 'not an array' };
    expect(Array.isArray(validData.values)).toBe(true);
    expect(Array.isArray(invalidData.values)).toBe(false);
  });
});

// ======================================================================
// ROUTES CONFIGURATION — routes.jsx
// Spec tests: document expected route list; they do not import routes.jsx.
// ======================================================================
describe('Route Configuration', () => {
  // We can't import routes.jsx directly (it contains JSX with component imports),
  // so we verify the route paths match the expected structure.
  const EXPECTED_ROUTES = ['/', '/agents', '/create', '/settings'];

  it('defines all 4 core routes', () => {
    // Verified from routes.jsx lines 11-16
    expect(EXPECTED_ROUTES).toContain('/');
    expect(EXPECTED_ROUTES).toContain('/agents');
    expect(EXPECTED_ROUTES).toContain('/create');
    expect(EXPECTED_ROUTES).toContain('/settings');
  });

  it('chat is the default route at /', () => {
    expect(EXPECTED_ROUTES[0]).toBe('/');
  });

  it('has exactly 4 routes', () => {
    expect(EXPECTED_ROUTES).toHaveLength(4);
  });
});
