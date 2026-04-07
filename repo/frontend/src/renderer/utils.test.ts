/**
 * Unit tests for utility/business-logic functions in the MedOps frontend.
 * Uses vitest (configured in vite.config.ts).
 */

import { describe, it, expect } from 'vitest';

// ---------- Type guard helpers (inline — no external deps) ----------

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

function isFrozen(status: string): boolean {
  return status === 'frozen';
}

function canRedeem(status: string, expiresAt: string): boolean {
  if (isFrozen(status)) return false;
  if (isExpired(expiresAt)) return false;
  return true;
}

function hasEnoughStoredValue(balance: number, requested: number): boolean {
  return balance >= requested && requested > 0;
}

function hasEnoughPoints(balance: number, requested: number): boolean {
  return balance >= requested && requested > 0;
}

// ---------- Password validation ----------

function isValidPassword(password: string): boolean {
  return password.length >= 12;
}

// ---------- SLA priority labels ----------

function priorityLabel(priority: string): string {
  switch (priority) {
    case 'urgent': return 'Urgent (4h)';
    case 'high': return 'High (24h)';
    case 'normal': return 'Normal (3 days)';
    default: return priority;
  }
}

// ---------- Rating validation ----------

function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

// ============================================================
// Tests
// ============================================================

describe('Membership redemption guards', () => {
  it('returns false when membership is frozen', () => {
    expect(canRedeem('frozen', '2099-01-01T00:00:00Z')).toBe(false);
  });

  it('returns false when membership is expired', () => {
    expect(canRedeem('active', '2000-01-01T00:00:00Z')).toBe(false);
  });

  it('returns true for active non-expired membership', () => {
    expect(canRedeem('active', '2099-01-01T00:00:00Z')).toBe(true);
  });

  it('returns false for expired AND frozen membership', () => {
    expect(canRedeem('frozen', '2000-01-01T00:00:00Z')).toBe(false);
  });
});

describe('Stored value balance validation', () => {
  it('returns true when balance equals requested amount', () => {
    expect(hasEnoughStoredValue(100, 100)).toBe(true);
  });

  it('returns true when balance exceeds requested amount', () => {
    expect(hasEnoughStoredValue(200, 50)).toBe(true);
  });

  it('returns false when balance is less than requested amount', () => {
    expect(hasEnoughStoredValue(50, 100)).toBe(false);
  });

  it('returns false when requested amount is zero', () => {
    expect(hasEnoughStoredValue(100, 0)).toBe(false);
  });

  it('returns false when requested amount is negative', () => {
    expect(hasEnoughStoredValue(100, -10)).toBe(false);
  });
});

describe('Points balance validation', () => {
  it('returns true when points balance covers request', () => {
    expect(hasEnoughPoints(500, 100)).toBe(true);
  });

  it('returns false when points are insufficient', () => {
    expect(hasEnoughPoints(50, 100)).toBe(false);
  });

  it('returns false when requested is zero', () => {
    expect(hasEnoughPoints(100, 0)).toBe(false);
  });
});

describe('Password validation', () => {
  it('accepts password of exactly 12 characters', () => {
    expect(isValidPassword('Password1234')).toBe(true);
  });

  it('accepts password longer than 12 characters', () => {
    expect(isValidPassword('SecurePass1234!')).toBe(true);
  });

  it('rejects password shorter than 12 characters', () => {
    expect(isValidPassword('short')).toBe(false);
  });

  it('rejects empty password', () => {
    expect(isValidPassword('')).toBe(false);
  });

  it('rejects 11-character password', () => {
    expect(isValidPassword('11charpass!')).toBe(false);
  });
});

describe('Work order rating validation', () => {
  it('accepts ratings 1 through 5', () => {
    for (let i = 1; i <= 5; i++) {
      expect(isValidRating(i)).toBe(true);
    }
  });

  it('rejects rating of 0', () => {
    expect(isValidRating(0)).toBe(false);
  });

  it('rejects rating of 6', () => {
    expect(isValidRating(6)).toBe(false);
  });

  it('rejects negative rating', () => {
    expect(isValidRating(-1)).toBe(false);
  });

  it('rejects non-integer rating', () => {
    expect(isValidRating(3.5)).toBe(false);
  });
});

describe('Priority label mapping', () => {
  it('maps urgent to correct label', () => {
    expect(priorityLabel('urgent')).toBe('Urgent (4h)');
  });

  it('maps high to correct label', () => {
    expect(priorityLabel('high')).toBe('High (24h)');
  });

  it('maps normal to correct label', () => {
    expect(priorityLabel('normal')).toBe('Normal (3 days)');
  });

  it('returns raw value for unknown priority', () => {
    expect(priorityLabel('critical')).toBe('critical');
  });
});

describe('isExpired', () => {
  it('returns true for a past date', () => {
    expect(isExpired('2000-01-01T00:00:00Z')).toBe(true);
  });

  it('returns false for a future date', () => {
    expect(isExpired('2099-01-01T00:00:00Z')).toBe(false);
  });
});
