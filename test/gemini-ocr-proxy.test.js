import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// A separate file (own module registry) so gemini-ocr.js's module-scope
// `import.meta.env.VITE_ORBIT_GEMINI_PROXY_URL` read - evaluated once, at
// import time - picks up this stub. See sync-default-project.test.js for
// the same pattern applied to the sync module.
const PROXY_URL = 'https://example-region-demo-project.cloudfunctions.net/geminiProxy';

let AIVisionProcessor;
let isGeminiProxyConfigured;
let warmUpGeminiProxy;

beforeAll(async () => {
  vi.stubEnv('VITE_ORBIT_GEMINI_PROXY_URL', PROXY_URL);
  seedLocalStorage();
  await loadApp();
  ({ AIVisionProcessor, isGeminiProxyConfigured, warmUpGeminiProxy } =
    await import('../src/gemini-ocr.js'));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// The encoded inline_data parts recognizeSchedule() takes now - the
// canvas/file preprocessing that produces them happens before this call and
// is the importer's job, not the processor's.
function fakeFiles(count = 1) {
  return Array.from({ length: count }, () => ({ mime_type: 'image/jpeg', data: 'AAAA' }));
}

function fakeGeminiResponse(json) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }]
    })
  };
}

describe('AIVisionProcessor.recognizeSchedule with a configured proxy', () => {
  it('reports the proxy as configured', () => {
    expect(isGeminiProxyConfigured()).toBe(true);
  });

  // Fastest model first, most capable last - see the comment on
  // AIVisionProcessor's own model list for why that order is safe now.
  it('does not require an API key, and reaches for the quickest model first', async () => {
    const processor = new AIVisionProcessor();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeGeminiResponse({ teacherDB: {}, weeklySchedule: {} }))
    );
    await expect(processor.recognizeSchedule(fakeFiles(), () => {})).resolves.toMatchObject({
      modelUsed: 'gemini-3.5-flash-lite'
    });
    vi.unstubAllGlobals();
  });

  it("sends only {model, files} - the prompt and generation config are the proxy's job, not the client's", async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn(async (url, options) => {
      expect(url).toBe(PROXY_URL);
      const body = JSON.parse(options.body);
      expect(body.model).toBe('gemini-3.5-flash-lite');
      expect(body.files).toHaveLength(1);
      expect(body.files[0]).toMatchObject({ mime_type: 'image/jpeg' });
      expect(typeof body.files[0].data).toBe('string');
      expect(body.contents).toBeUndefined();
      expect(body.generationConfig).toBeUndefined();
      return fakeGeminiResponse({ teacherDB: {}, weeklySchedule: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
    await processor.recognizeSchedule(fakeFiles(), () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  // The whole point of accepting more than one file: they have to reach the
  // model as one request, or a screenshot cannot fill in the names a
  // timetable photo left as placeholders.
  it('sends every chosen file in a single request, in the order they were picked', async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      expect(body.files.map(file => file.data)).toEqual(['one', 'two', 'three']);
      return fakeGeminiResponse({ teacherDB: {}, weeklySchedule: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
    await processor.recognizeSchedule(
      ['one', 'two', 'three'].map(data => ({ mime_type: 'image/jpeg', data })),
      () => {}
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  // A structurally unusable answer is no longer the end of the road: it
  // escalates to the next, stronger model instead of being shown to the
  // user as a broken preview.
  it('escalates to the next model when the quick one returns something unusable', async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn(async (url, options) =>
      JSON.parse(options.body).model === 'gemini-3.5-flash-lite'
        ? fakeGeminiResponse({ teacherDB: {}, weeklySchedule: {} })
        : fakeGeminiResponse({
            teacherDB: { 國文: ['國文', '陳老師', 'A101'] },
            weeklySchedule: { 1: ['國文'] },
            bellTimes: [{ start: '08:10', end: '09:00' }]
          })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await processor.recognizeSchedule(fakeFiles(), () => {}, {
      validate: candidate =>
        Object.keys(candidate.teacherDB || {}).length
          ? { valid: true }
          : { valid: false, errors: ['沒有辨識到課程或倒數日期。'] }
    });
    expect(result.modelUsed).toBe('gemini-3.6-flash');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  // ...but only so far. When no model can make sense of it, the user still
  // gets the last attempt (and its validation errors) to correct by hand,
  // rather than a bare failure.
  it('falls back to the last attempt when no model produces a usable result', async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn(async () => fakeGeminiResponse({ teacherDB: {}, weeklySchedule: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await processor.recognizeSchedule(fakeFiles(), () => {}, {
      validate: () => ({ valid: false, errors: ['沒有辨識到課程或倒數日期。'] })
    });
    expect(result.modelUsed).toBe('gemini-2.5-flash'); // the last one tried
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();
  });

  it('surfaces the proxy rate-limit message immediately without retrying other models', async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ error: { message: '請求過於頻繁，請稍後再試。' } })
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(processor.recognizeSchedule(fakeFiles(), () => {})).rejects.toThrow(
      '請求過於頻繁，請稍後再試。'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('refuses to run while offline, without making any network request', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(processor.recognizeSchedule(fakeFiles(), () => {})).rejects.toThrow(
      /沒有網路連線/
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});

// Sent while the user is still choosing a file, so DNS/TLS/Worker startup
// are paid for out of time they were going to spend anyway rather than out
// of the wait after they press import.
describe('the proxy connection is warmed up before there is anything to send', () => {
  it('pings the proxy with a GET carrying no file content', () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetchMock);
    warmUpGeminiProxy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(PROXY_URL);
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('does not ping again straight away, so reopening the picker is not a stream of pings', () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetchMock);
    warmUpGeminiProxy(); // may or may not fire, depending on what ran before
    fetchMock.mockClear();
    warmUpGeminiProxy();
    warmUpGeminiProxy();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('stays silent while offline, rather than failing in the background', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    warmUpGeminiProxy();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});
