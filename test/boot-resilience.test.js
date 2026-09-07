import { beforeAll, describe, expect, it, vi } from 'vitest';
import { seedLocalStorage } from './helpers/fixtureData.js';
import { repoRoot } from './helpers/loadApp.js';

// bootstrap.js runs buildSchedule(), window.update(), and the sync
// panel/loop as plain top-level statements. Since main.js imports
// bootstrap.js *before* testsim-runtime.js (whose init() is what actually
// clears the boot spinner - see finishBoot()), an uncaught throw anywhere in
// that sequence used to abort the rest of the static import chain and leave
// the app stuck behind the spinner forever, with no way to recover short of
// clearing site data. This is exactly the failure mode a returning user with
// an old/unexpected localStorage shape could hit, so bootstrap.js now wraps
// each risky step and falls back rather than ever letting that happen.
//
// Own module registry (not loadApp.js's shared helper) since this needs to
// mock schedule.js *before* main.js's import chain first pulls it in.
describe('boot survives buildSchedule() throwing on the saved schedule', () => {
  beforeAll(async () => {
    vi.doMock('../src/schedule.js', async () => {
      const actual = await vi.importActual('../src/schedule.js');
      let callCount = 0;
      return {
        ...actual,
        buildSchedule: (...args) => {
          callCount += 1;
          // Fail only the first call (the one against the saved/corrupt
          // data) so the reset-and-retry in bootstrap.js has something real
          // to recover into, the same way a genuinely broken saved schedule
          // would.
          if (callCount === 1) throw new Error('simulated corrupt saved schedule');
          return actual.buildSchedule(...args);
        }
      };
    });

    seedLocalStorage({ weeklySchedule: { 1: ['A', 'B', 'C'] } });

    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const indexHtml = readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');
    const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/);
    document.body.innerHTML = bodyMatch[1].replace(
      /<script[^>]*src="src\/main\.js[^"]*"[^>]*>\s*<\/script>/,
      ''
    );
    const { Blob: NodeBlob } = await import('node:buffer');
    window.Blob = NodeBlob;
    window.Element.prototype.scrollTo = () => {};
    window.Element.prototype.scrollIntoView = () => {};
    window.Element.prototype.scrollBy = () => {};

    await import('../src/main.js');
  });

  it('finishes boot (clears the spinner) instead of getting stuck', () => {
    expect(document.body.classList.contains('orbit-booting')).toBe(false);
  });

  it('recovered by resetting to the default schedule and persisting it', async () => {
    const { state } = await import('../src/state.js');
    expect(state.applicationData.weeklySchedule[1]).not.toEqual(['A', 'B', 'C']);
    const persisted = JSON.parse(localStorage.getItem('classFocusData'));
    expect(persisted.weeklySchedule[1]).not.toEqual(['A', 'B', 'C']);
  });
});
