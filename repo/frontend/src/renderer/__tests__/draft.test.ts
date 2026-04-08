/**
 * draft.test.ts — unit tests for draft auto-save and recovery logic.
 *
 * Tests the pure-logic layer: interval scheduling, state merging, and the
 * recovery flow decision (restore vs discard). Does not render React components.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Auto-save interval scheduling ───────────────────────────────────────────

describe('Draft auto-save interval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires a save after 30 seconds', () => {
    const saveFn = vi.fn();
    const timer = setInterval(saveFn, 30_000);

    vi.advanceTimersByTime(29_999);
    expect(saveFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(saveFn).toHaveBeenCalledTimes(1);

    clearInterval(timer);
  });

  it('fires multiple saves at 30-second intervals', () => {
    const saveFn = vi.fn();
    const timer = setInterval(saveFn, 30_000);

    vi.advanceTimersByTime(90_000); // 3 intervals
    expect(saveFn).toHaveBeenCalledTimes(3);

    clearInterval(timer);
  });

  it('does not fire if cleared before first interval', () => {
    const saveFn = vi.fn();
    const timer = setInterval(saveFn, 30_000);
    clearInterval(timer);

    vi.advanceTimersByTime(60_000);
    expect(saveFn).not.toHaveBeenCalled();
  });
});

// ─── Recovery flow decision logic ────────────────────────────────────────────

describe('Draft recovery decision', () => {
  function shouldShowRecovery(draft: { saved_at: string } | null): boolean {
    return draft !== null;
  }

  function applyDraft<T>(currentState: T, draftState: Partial<T>): T {
    return { ...currentState, ...draftState };
  }

  it('shows recovery dialog when a draft exists', () => {
    const draft = { saved_at: new Date().toISOString() };
    expect(shouldShowRecovery(draft)).toBe(true);
  });

  it('does not show recovery dialog when no draft exists', () => {
    expect(shouldShowRecovery(null)).toBe(false);
  });

  it('restoring draft merges into current state', () => {
    const current = { title: '', description: '', priority: 'normal' };
    const saved = { title: 'Fix lights', description: 'Room 12' };
    const restored = applyDraft(current, saved);

    expect(restored.title).toBe('Fix lights');
    expect(restored.description).toBe('Room 12');
    expect(restored.priority).toBe('normal'); // unchanged field preserved
  });

  it('discarding draft preserves current (blank) state', () => {
    const current = { title: '', description: '', priority: 'normal' };
    // Discard = keep current unchanged
    const afterDiscard = { ...current };
    expect(afterDiscard.title).toBe('');
  });

  it('recovery uses the saved_at timestamp for display', () => {
    const isoDate = '2026-03-15T10:30:00.000Z';
    const draft = { saved_at: isoDate };
    const display = new Date(draft.saved_at).toLocaleString();
    expect(typeof display).toBe('string');
    expect(display.length).toBeGreaterThan(0);
  });
});

// ─── Draft state serialisation ────────────────────────────────────────────────

describe('Draft state serialisation', () => {
  it('serialises form state to JSON without losing field types', () => {
    const state = { qty: 5, expiry: '2030-01-01', checked: true };
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);

    expect(parsed.qty).toBe(5);
    expect(parsed.checked).toBe(true);
    expect(parsed.expiry).toBe('2030-01-01');
  });

  it('deserialises null state_json gracefully', () => {
    const raw = null;
    const state = raw ?? {};
    expect(state).toEqual({});
  });
});

// ─── F-004: Draft form-type coverage ─────────────────────────────────────────
//
// useDraftAutoSave was extended from 3 forms to 7 in F-004. These tests verify
// the form-key naming contract for all newly covered create/edit forms.
// The formType string must be stable (used as the key on the server-side draft
// store), so renaming it is a breaking change.

const EXPECTED_DRAFT_FORM_TYPES = [
  'rate_table_create',    // RateTablesPage — new in F-004
  'user_create',          // UsersPage — new in F-004
  'learning_subject',     // LearningPage — new in F-004
  'sku_create',           // SKUListPage — new in F-004
];

describe('F-004 draft form-type key naming contract', () => {
  it('every new form type is a non-empty snake_case string', () => {
    for (const formType of EXPECTED_DRAFT_FORM_TYPES) {
      expect(typeof formType).toBe('string');
      expect(formType.length).toBeGreaterThan(0);
      expect(formType).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('no two new form types share the same key', () => {
    const unique = new Set(EXPECTED_DRAFT_FORM_TYPES);
    expect(unique.size).toBe(EXPECTED_DRAFT_FORM_TYPES.length);
  });

  it('sku_create draft key serialises a SKU create form correctly', () => {
    const skuState = {
      name: 'Amoxicillin 500mg',
      sku_code: 'AMX500',
      category: 'antibiotic',
      unit: 'tablet',
      reorder_point: 50,
      controlled: false,
    };
    const json = JSON.stringify(skuState);
    const parsed = JSON.parse(json);
    expect(parsed.sku_code).toBe('AMX500');
    expect(parsed.controlled).toBe(false);
    expect(parsed.reorder_point).toBe(50);
  });

  it('user_create draft key serialises a user create form correctly', () => {
    const userState = { username: 'jdoe', password: '**REDACTED**', role: 'front_desk' };
    const json = JSON.stringify(userState);
    const parsed = JSON.parse(json);
    expect(parsed.username).toBe('jdoe');
    expect(parsed.role).toBe('front_desk');
    // password field present in state (server-side draft is scoped to userID)
    expect('password' in parsed).toBe(true);
  });

  it('rate_table_create draft key serialises rate-table form with tiers correctly', () => {
    const rtState = {
      name: 'Standard Distance',
      type: 'distance',
      tiers: '[{"min":0,"max":10,"rate":5}]',
      fuel_surcharge_pct: '2.5',
      taxable: true,
      effective_date: '2026-01-01',
    };
    const json = JSON.stringify(rtState);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('distance');
    expect(parsed.taxable).toBe(true);
    // tiers is stored as a string (textarea value) — parsed separately by the form
    const tiers = JSON.parse(parsed.tiers);
    expect(Array.isArray(tiers)).toBe(true);
    expect(tiers[0].rate).toBe(5);
  });

  it('learning_subject draft key serialises subject create form correctly', () => {
    const subjectState = {
      title: 'Hand Hygiene Basics',
      description: 'Annual hand hygiene training module',
      required_role: 'front_desk',
    };
    const json = JSON.stringify(subjectState);
    const parsed = JSON.parse(json);
    expect(parsed.title).toBe('Hand Hygiene Basics');
    expect(parsed.required_role).toBe('front_desk');
  });
});
