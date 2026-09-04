import { describe, expect, it } from 'vitest';
import { t } from '../src/strings.js';

describe('t()', () => {
  it('resolves a known key to its zh-TW string', () => {
    expect(t('dashboard.notStarted')).toBe('尚未開始');
  });

  it('falls back to the key itself for an unknown key, rather than throwing', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });
});
