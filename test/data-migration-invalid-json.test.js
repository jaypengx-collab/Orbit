import { describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { state } from '../src/state.js';

describe('loadData() with unparsable classFocusData', () => {
  it('falls back to defaults instead of throwing during boot', async () => {
    localStorage.setItem('classFocusData', '{not valid json');
    await loadApp();
    expect(state.applicationData.teacherDB).toBeTruthy();
  });
});
