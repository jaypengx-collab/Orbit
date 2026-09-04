import { describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

describe('loadData() with no classFocusData in localStorage', () => {
  it('boots without throwing and falls back to the built-in defaults', () => {
    expect(() => loadApp()).not.toThrow();
    const data = window.__orbitTest.getApplicationData();
    expect(data.teacherDB).toBeTruthy();
    expect(data.bellTimes.length).toBeGreaterThan(0);
  });
});
