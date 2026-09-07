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

beforeAll(async () => {
  vi.stubEnv('VITE_ORBIT_GEMINI_PROXY_URL', PROXY_URL);
  seedLocalStorage();
  await loadApp();
  ({ AIVisionProcessor, isGeminiProxyConfigured } = await import('../src/gemini-ocr.js'));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function fakeCanvas() {
  return { toDataURL: () => 'data:image/jpeg;base64,AAAA' };
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

  it('does not require an API key', async () => {
    const processor = new AIVisionProcessor();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeGeminiResponse({ teacherDB: {}, weeklySchedule: {} }))
    );
    await expect(processor.recognizeSchedule(fakeCanvas(), () => {})).resolves.toMatchObject({
      modelUsed: 'gemini-3.6-flash'
    });
    vi.unstubAllGlobals();
  });

  it('calls the proxy URL with the model named in the request body instead of a key in the URL', async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn(async (url, options) => {
      expect(url).toBe(PROXY_URL);
      const body = JSON.parse(options.body);
      expect(body.model).toBe('gemini-3.6-flash');
      expect(body.contents).toBeTruthy();
      return fakeGeminiResponse({ teacherDB: {}, weeklySchedule: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
    await processor.recognizeSchedule(fakeCanvas(), () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    await expect(processor.recognizeSchedule(fakeCanvas(), () => {})).rejects.toThrow(
      '請求過於頻繁，請稍後再試。'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
