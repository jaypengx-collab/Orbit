import { describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

// Each `it` here needs localStorage seeded with bad data *before* loadApp()
// runs main.js's import chain (bootstrap.js reads it synchronously via
// data.js's loadData() as part of boot) - and each needs its own fresh
// module registry so that boot happens fresh against that specific bad
// value, matching the pattern other multi-scenario test files in this suite
// use (see sync-default-project.test.js's comment on the same constraint).
describe('loadData() clears a saved schedule it fails to load, instead of leaving it to fail again next time', () => {
  it('clears invalid JSON', async () => {
    localStorage.setItem('classFocusData', '{not valid json');
    await loadApp();
    const { state } = await import('../src/state.js');

    expect(localStorage.getItem('classFocusData')).toBeNull();
    expect(state.applicationData.teacherDB).toHaveProperty('01國文');
  });
});
