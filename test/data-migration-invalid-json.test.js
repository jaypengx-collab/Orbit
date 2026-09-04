import { describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

describe('loadData() with unparsable classFocusData', () => {
  it('falls back to defaults instead of throwing during boot', () => {
    localStorage.setItem('classFocusData', '{not valid json');
    expect(() => loadApp()).not.toThrow();
    expect(window.__orbitTest.getApplicationData().teacherDB).toBeTruthy();
  });
});
