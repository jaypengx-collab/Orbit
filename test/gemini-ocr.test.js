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

describe('AIVisionProcessor.recognizeSchedule without a configured proxy', () => {
  it('is not using a proxy in this build', () => {
    expect(isGeminiProxyConfigured()).toBe(false);
  });

  it('refuses to run, without making any network request', async () => {
    const processor = new AIVisionProcessor();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(processor.recognizeSchedule(fakeCanvas(), () => {})).rejects.toThrow(
      /AI 匯入功能尚未設定/
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
