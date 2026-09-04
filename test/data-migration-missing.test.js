import { describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { state } from '../src/state.js';

describe('loadData() with no classFocusData in localStorage', () => {
  it('boots without throwing and falls back to the built-in defaults', async () => {
    await loadApp();
    expect(state.applicationData.teacherDB).toBeTruthy();
    expect(state.applicationData.bellTimes.length).toBeGreaterThan(0);
  });
});
