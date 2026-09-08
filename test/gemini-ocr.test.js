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
