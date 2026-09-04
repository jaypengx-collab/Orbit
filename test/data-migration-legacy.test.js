import { describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { state } from '../src/state.js';

describe('loadData() with a legacy payload missing newer optional fields', () => {
  it('fills in styleSlots/countdownEvents and preserves the rest unchanged', async () => {
    localStorage.setItem(
      'classFocusData',
      JSON.stringify({
        teacherDB: { A: ['數學', '王老師'] },
        locationDB: { A: '101' },
        weeklySchedule: { 1: ['A'] },
        bellTimes: [['08:00', '08:50']],
        reverseWeek: true
      })
    );
    await loadApp();
    const data = state.applicationData;
    expect(data.teacherDB.A).toEqual(['數學', '王老師', '']);
    expect(data.reverseWeek).toBe(true);
    expect(data.weeklySchedule['1']).toEqual(['A']);
    expect(Array.isArray(data.countdownEvents)).toBe(true);
    expect(Array.isArray(data.styleSlots)).toBe(true);
  });
});
