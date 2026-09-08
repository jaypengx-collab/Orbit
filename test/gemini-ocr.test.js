import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

let AIVisionProcessor;
let isGeminiProxyConfigured;
let estimateRecognitionSeconds;

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  ({ AIVisionProcessor, estimateRecognitionSeconds, isGeminiProxyConfigured } =
    await import('../src/gemini-ocr.js'));
});

function fakeFiles() {
  return [{ mime_type: 'image/jpeg', data: 'AAAA' }];
}

describe('AIVisionProcessor.recognizeSchedule without a configured proxy', () => {
  it('is not using a proxy in this build', () => {
    expect(isGeminiProxyConfigured()).toBe(false);
  });

  it('refuses to run, without making any network request', async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(processor.recognizeSchedule(fakeFiles(), () => {})).rejects.toThrow(
      /AI 匯入功能尚未設定/
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

// The wait estimate is shown once and left alone (the matchmaking-queue
// pattern) rather than counted down, but it still has to be derived rather
// than fixed: each extra file is separately uploaded and separately read, so
// quoting one screenshot's figure for four of them would just be wrong on
// purpose.
describe('the recognition wait estimate scales with how much was submitted', () => {
  it('quotes a single base figure for one file', () => {
    expect(estimateRecognitionSeconds(1)).toBe(5);
  });

  it('adds time per additional file', () => {
    expect(estimateRecognitionSeconds(2)).toBeGreaterThan(estimateRecognitionSeconds(1));
    expect(estimateRecognitionSeconds(4)).toBeGreaterThan(estimateRecognitionSeconds(2));
  });

  it('never quotes less than the base figure, however it is called', () => {
    expect(estimateRecognitionSeconds(0)).toBe(estimateRecognitionSeconds(1));
  });
});

function fakeGeminiTextResponse(json) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] };
}

// normalizeAIOutput()'s two input shapes: the current one (a `classes`
// array, chosen because it's the only one Gemini's response_schema can
// actually constrain - see the Worker's own comment on why a free-form
// map can't be schema-described), and the older {key: [subject, teacher,
// location]} map a not-yet-redeployed Worker could still be sending during
// a rolling deploy. Both must produce the exact same internal shape, since
// nothing downstream of this parse knows or cares which one arrived.
describe('AIVisionProcessor.parseResponse turns the AI JSON into the app-internal candidate shape', () => {
  it('reads the current classes-array shape, linking weeklySchedule slots back through "key"', () => {
    const processor = new AIVisionProcessor();
    const candidate = processor.parseResponse(
      fakeGeminiTextResponse({
        bellTimes: [{ start: '08:10', end: '09:00' }],
        classes: [
          { key: 'c1', subject: '國文', teacher: '陳老師', location: 'A101' },
          { key: 'c2', subject: '英文', teacher: '王老師', location: 'B202' }
        ],
        weeklySchedule: { 1: ['c1', 'c2'], 2: [], 3: [], 4: [], 5: [] }
      })
    );
    const teacherEntries = Object.values(candidate.teacherDB);
    expect(teacherEntries).toContainEqual(['國文', '陳老師', 'A101']);
    expect(teacherEntries).toContainEqual(['英文', '王老師', 'B202']);
    // The AI's own "c1"/"c2" keys never leak into the app's own data - it
    // generates its own internal ids, same as the legacy map shape always
    // did.
    expect(Object.keys(candidate.teacherDB).every(key => /^oc\d+$/.test(key))).toBe(true);
    expect(candidate.recognizedBlocks).toHaveLength(2);
    expect(candidate.recognizedBlocks.map(b => b.assignment.subject).sort()).toEqual([
      '國文',
      '英文'
    ]);
  });

  it('still reads the older {key: [subject, teacher, location]} map, for a Worker not yet redeployed', () => {
    const processor = new AIVisionProcessor();
    const candidate = processor.parseResponse(
      fakeGeminiTextResponse({
        bellTimes: [{ start: '08:10', end: '09:00' }],
        teacherDB: { A: ['國文', '陳老師', 'A101'] },
        locationDB: { A: 'A101' },
        weeklySchedule: { 1: ['A'], 2: [], 3: [], 4: [], 5: [] }
      })
    );
    expect(Object.values(candidate.teacherDB)).toContainEqual(['國文', '陳老師', 'A101']);
    expect(candidate.recognizedBlocks).toHaveLength(1);
    expect(candidate.recognizedBlocks[0].assignment.subject).toBe('國文');
  });

  it('drops a class with no subject rather than inventing one', () => {
    const processor = new AIVisionProcessor();
    const candidate = processor.parseResponse(
      fakeGeminiTextResponse({
        bellTimes: [],
        classes: [{ key: 'c1', subject: '', teacher: '陳老師', location: '' }],
        weeklySchedule: { 1: [], 2: [], 3: [], 4: [], 5: [] }
      })
    );
    expect(Object.keys(candidate.teacherDB)).toHaveLength(0);
  });
});
