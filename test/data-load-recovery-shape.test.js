import { describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

// Own file/module registry (see data-load-recovery.test.js and
// sync-default-project.test.js's comment on why) so this exercises a fresh
// boot against JSON that parses fine but fails loadData()'s shape checks -
// a distinct code path from invalid-JSON, converted from early-returns to
// throws so both funnel through the same clear-and-reset catch block.
describe('loadData() also clears well-formed JSON with an invalid schedule shape', () => {
  it('clears a saved schedule missing required fields', async () => {
    localStorage.setItem('classFocusData', JSON.stringify({ teacherDB: {} }));
    await loadApp();
    const { state } = await import('../src/state.js');

    expect(localStorage.getItem('classFocusData')).toBeNull();
    expect(state.applicationData.teacherDB).toHaveProperty('01國文');
  });
});
