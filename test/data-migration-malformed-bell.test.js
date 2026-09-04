import { describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

describe('loadData() with a malformed bell time', () => {
  it('rejects the whole payload and falls back to defaults, rather than a partially-salvaged schedule', () => {
    localStorage.setItem(
      'classFocusData',
      JSON.stringify({
        teacherDB: { A: ['數學', '王老師'] },
        locationDB: { A: '101' },
        weeklySchedule: { 1: ['A'] },
        bellTimes: [['not-a-time', '08:50']]
      })
    );
    expect(() => loadApp()).not.toThrow();
    const data = window.__orbitTest.getApplicationData();
    expect(data.bellTimes[0][0]).toBe('08:00'); // the built-in default's first period
  });
});
