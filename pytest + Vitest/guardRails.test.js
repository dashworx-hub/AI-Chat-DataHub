/**
 * Guard Rails constant tests.
 *
 * Business context: The Agent Manager uses GUARD_RAILS_DELIMITER to split
 * user instructions from guard rails when editing. If the delimiter doesn't
 * match the backend, editing strips guard rails (dangerous) or corrupts
 * the instruction (broken).
 *
 * IMPORTANT: The frontend guardRails.js uses "Layer N:" (with colon, e.g.
 * "Layer 1: Scope Enforcement") while the backend main.py uses "Layer N"
 * (no colon, e.g. "Layer 1 Scope Enforcement"). The delimiter is identical
 * in both. These tests verify the FRONTEND constants.
 */
import { describe, it, expect } from 'vitest';

// Import from canonical frontend (frontend/src)
import { GUARD_RAILS_DELIMITER, GUARD_RAILS_DISPLAY_TEXT } from '../frontend/src/constants/guardRails.js';

// ======================================================================
// DELIMITER (must match backend exactly)
// ======================================================================
describe('Guard Rails Delimiter', () => {
  it('matches the backend format exactly', () => {
    expect(GUARD_RAILS_DELIMITER).toBe('\n\n--- GUARD RAILS (DO NOT EDIT) ---\n\n');
  });

  it('starts and ends with double newlines', () => {
    expect(GUARD_RAILS_DELIMITER.startsWith('\n\n')).toBe(true);
    expect(GUARD_RAILS_DELIMITER.endsWith('\n\n')).toBe(true);
  });
});

// ======================================================================
// DISPLAY TEXT (all 7 layers with colon format)
// ======================================================================
describe('Guard Rails Display Text – All 7 Layers', () => {
  it('contains all 7 layers with colon format', () => {
    // Frontend uses "Layer N:" format (verified from guardRails.js source)
    for (let i = 1; i <= 7; i++) {
      expect(GUARD_RAILS_DISPLAY_TEXT).toContain(`Layer ${i}:`);
    }
  });

  it('Layer 1: Scope Enforcement – blocks off-topic content', () => {
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Layer 1: Scope Enforcement');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('jokes');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('poems');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('roleplay');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('storytelling');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('entertainment content');
  });

  it('Layer 2: Output Contract Protection – enforces raw SQL output', () => {
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Layer 2: Output Contract Protection');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('raw SQL only');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('start with SELECT or WITH');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('end with a semicolon');
  });

  it('Layer 3: Data Integrity – no fabrication of numbers', () => {
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Layer 3: Data Integrity Enforcement');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Never fabricate numbers');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Never fill gaps with assumptions');
  });

  it('Layer 4: Analytical Discipline – no causation claims without evidence', () => {
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Layer 4: Analytical Discipline');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Do not claim causation');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Do not speculate');
  });

  it('Layer 5: Visual and Evidence Validation', () => {
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Layer 5: Visual and Evidence Validation');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('supported by either computed statistics or appropriate visuals');
  });

  it('Layer 6: Response Quality Preservation – guard rails must not degrade valid answers', () => {
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Layer 6: Response Quality Preservation');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Guard rails must never degrade valid responses');
  });

  it('Layer 7: Mixed Request Handling – valid analysis completed even when mixed with off-topic', () => {
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('Layer 7: Mixed Request Handling');
    expect(GUARD_RAILS_DISPLAY_TEXT).toContain('complete the valid analytical portion fully');
  });
});

// ======================================================================
// INSTRUCTION SPLITTING LOGIC (used by AgentManager.jsx)
// ======================================================================
describe('Instruction splitting with delimiter', () => {
  // Replicates getUserInstructionFromFull from AgentManager.jsx line 22-26
  const getUserInstructionFromFull = (fullInstruction) => {
    if (!fullInstruction || typeof fullInstruction !== 'string') return '';
    const parts = fullInstruction.split(GUARD_RAILS_DELIMITER, 2);
    return parts.length >= 2 ? parts[0].trim() : fullInstruction;
  };

  it('extracts user instruction when guard rails are present', () => {
    const userPart = 'You are a marketing analyst focused on ROAS.';
    const full = userPart + GUARD_RAILS_DELIMITER + 'Layer 1: Scope Enforcement ...';
    expect(getUserInstructionFromFull(full)).toBe(userPart);
  });

  it('returns full string when no delimiter is present (legacy agent)', () => {
    const instruction = 'This is a raw instruction without guard rails.';
    expect(getUserInstructionFromFull(instruction)).toBe(instruction);
  });

  it('handles empty instruction before guard rails', () => {
    const full = '' + GUARD_RAILS_DELIMITER + 'Layer 1: Scope Enforcement ...';
    expect(getUserInstructionFromFull(full)).toBe('');
  });

  it('handles null/undefined input gracefully', () => {
    expect(getUserInstructionFromFull(null)).toBe('');
    expect(getUserInstructionFromFull(undefined)).toBe('');
    expect(getUserInstructionFromFull('')).toBe('');
  });
});
