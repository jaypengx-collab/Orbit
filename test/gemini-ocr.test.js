import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

let AIVisionProcessor;
let isGeminiProxyConfigured;

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  ({ AIVisionProcessor, isGeminiProxyConfigured } = await import('../src/gemini-ocr.js'));
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

describe('AIVisionProcessor.recognizeSchedule without a configured proxy (bring-your-own-key)', () => {
  it('is not using a proxy in this build', () => {
    expect(isGeminiProxyConfigured()).toBe(false);
  });

  it('requires an API key', async () => {
    const processor = new AIVisionProcessor();
    await expect(processor.recognizeSchedule(fakeCanvas(), '', () => {})).rejects.toThrow(
      /Gemini API 金鑰/
    );
  });

  it('calls Gemini directly with the key as a query parameter, no model in the body', async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn(async (url, options) => {
      expect(url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\//);
      expect(url).toContain('key=my-test-key');
      const body = JSON.parse(options.body);
      expect(body.model).toBeUndefined();
      expect(body.contents).toBeTruthy();
      return fakeGeminiResponse({ teacherDB: {}, weeklySchedule: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { modelUsed } = await processor.recognizeSchedule(fakeCanvas(), 'my-test-key', () => {});
    expect(modelUsed).toBe('gemini-3.6-flash');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
