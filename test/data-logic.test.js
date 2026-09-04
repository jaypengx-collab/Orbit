import { beforeAll, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

// One shared load is enough - none of these functions touch localStorage or
// the DOM, they're pure(ish) data transforms exercised directly via window.
beforeAll(() => {
  loadApp();
});

describe('time helpers', () => {
  it('parseTime converts HH:MM to minutes after midnight', () => {
    expect(window.parseTime('08:00')).toBe(480);
    expect(window.parseTime('13:05')).toBe(785);
  });

  it('getISOWeekNumber matches known ISO week boundaries', () => {
    expect(window.getISOWeekNumber(new Date('2024-01-01T12:00:00'))).toBe(1);
    expect(window.getISOWeekNumber(new Date('2024-01-08T12:00:00'))).toBe(2);
  });

  it('processSplitName resolves the correct half for a split subject by week parity', () => {
    const cls = { n: '國文/公民', t: '李老師/陳老師', isSplit: true };
    expect(window.processSplitName(cls, '單')).toMatchObject({ n: '國文', t: '李老師' });
    expect(window.processSplitName(cls, '雙')).toMatchObject({ n: '公民', t: '陳老師' });
  });

  it('processSplitName passes non-split classes through unchanged', () => {
    const cls = { n: '數學', t: '王老師', isSplit: false };
    expect(window.processSplitName(cls, '單')).toMatchObject({ n: '數學', t: '王老師', label: '' });
  });
});

describe('validateTimeIntervals', () => {
  it('accepts non-overlapping bell times and breaks', () => {
    expect(() =>
      window.validateTimeIntervals(
        [
          ['08:00', '08:50'],
          ['09:10', '10:00']
        ],
        [{ name: '打掃時間', start: '08:50', end: '09:10' }]
      )
    ).not.toThrow();
  });

  it('rejects an invalid time range', () => {
    expect(() => window.validateTimeIntervals([['08:50', '08:00']], [])).toThrow();
  });

  it('rejects overlapping intervals', () => {
    expect(() =>
      window.validateTimeIntervals(
        [
          ['08:00', '09:00'],
          ['08:30', '09:30']
        ],
        []
      )
    ).toThrow(/重疊/);
  });
});

describe('countdown event normalization', () => {
  it('normalizes a well-formed single-day event', () => {
    expect(
      window.normalizeCountdownEvent({
        name: ' 段考 ',
        startDate: '2024-01-15',
        endDate: '2024-01-15'
      })
    ).toEqual({ name: '段考', startDate: '2024-01-15', endDate: '2024-01-15' });
  });

  it('swaps start/end when they are reversed', () => {
    expect(
      window.normalizeCountdownEvent({
        name: '段考',
        startDate: '2024-01-20',
        endDate: '2024-01-15'
      })
    ).toEqual({ name: '段考', startDate: '2024-01-15', endDate: '2024-01-20' });
  });

  it('rejects an event missing a name or a valid date', () => {
    expect(
      window.normalizeCountdownEvent({ name: '', startDate: '2024-01-15', endDate: '2024-01-15' })
    ).toBeNull();
    expect(
      window.normalizeCountdownEvent({
        name: '段考',
        startDate: 'not-a-date',
        endDate: '2024-01-15'
      })
    ).toBeNull();
  });

  it('falls back to legacy data.date when startDate/endDate are absent', () => {
    expect(window.normalizeCountdownEvent({ name: '段考', date: '2024-01-15' })).toEqual({
      name: '段考',
      startDate: '2024-01-15',
      endDate: '2024-01-15'
    });
  });
});

describe('sanitizeBreakTimes', () => {
  const bellTimes = [
    ['08:00', '08:50'],
    ['09:10', '10:00']
  ];

  it('keeps a valid custom break', () => {
    const result = window.sanitizeBreakTimes(bellTimes, [
      { name: '午休', start: '12:00', end: '13:00' }
    ]);
    expect(result).toContainEqual({ name: '午休', start: '12:00', end: '13:00' });
  });

  it('drops a break that conflicts with a bell period', () => {
    const result = window.sanitizeBreakTimes(bellTimes, [
      { name: '衝突', start: '08:30', end: '09:00' }
    ]);
    expect(result.find(item => item.name === '衝突')).toBeUndefined();
  });

  it('auto-fills a default break that fits without conflict', () => {
    const result = window.sanitizeBreakTimes(bellTimes, []);
    expect(result).toContainEqual({ name: '打掃時間', start: '08:50', end: '09:10' });
  });
});

describe('normalizeSettingsData (schema migration guard)', () => {
  it('throws when a required field is missing', () => {
    expect(() => window.normalizeSettingsData({})).toThrow(/teacherDB/);
  });

  it('accepts a minimal valid settings object', () => {
    const result = window.normalizeSettingsData({
      teacherDB: { A: ['數學', '王老師', ''] },
      locationDB: { A: '101' },
      weeklySchedule: { 1: ['A'] },
      bellTimes: [['08:00', '08:50']]
    });
    expect(result.teacherDB.A).toEqual(['數學', '王老師', '']);
    expect(result.bellTimes).toEqual([['08:00', '08:50']]);
  });
});

describe('v2 backup encode/decode round-trip', () => {
  it('decodeTransferData(encodeTransferData(data)) reproduces the original schedule data', async () => {
    const original = window.normalizeSettingsData({
      teacherDB: { A: ['數學', '王老師', '101'], B: ['國文/公民', '李老師/陳老師', '102'] },
      teacherOrder: ['A', 'B'],
      locationDB: { A: '101', B: '102' },
      weeklySchedule: { 1: ['A', 'B'] },
      bellTimes: [
        ['08:00', '08:50'],
        ['09:10', '10:00']
      ],
      breakTimes: [{ name: '打掃時間', start: '08:50', end: '09:10' }],
      countdownEvents: [{ name: '段考', startDate: '2024-01-15', endDate: '2024-01-17' }],
      reverseWeek: true,
      proAccent: '#123456',
      proSecondary: '#654321',
      proTertiary: '#abcdef',
      styleSlots: [],
      geminiApiKey: 'should-not-round-trip'
    });

    const encoded = await window.encodeTransferData(original);
    // TRANSFER_MAGIC_V2 is a top-level `const` in app.js, so - like a real
    // browser - it isn't a window property; its literal value is documented
    // in README.md's backup-format section, so we match it directly here.
    expect(encoded.startsWith('[ORBIT]')).toBe(true);

    const decoded = await window.decodeTransferData(encoded);
    expect(decoded.teacherDB).toEqual(original.teacherDB);
    expect(decoded.weeklySchedule).toEqual(original.weeklySchedule);
    expect(decoded.bellTimes).toEqual(original.bellTimes);
    expect(decoded.breakTimes).toEqual(original.breakTimes);
    expect(decoded.countdownEvents).toEqual(original.countdownEvents);
    expect(decoded.reverseWeek).toBe(true);
    expect(decoded.proAccent).toBe('#123456');
    // encodeTransferData/decodeTransferData round-trip whatever geminiApiKey
    // they're given faithfully - the higher-level export flow
    // (settingsDataForExport(), which builds its payload from the editor
    // form rather than from applicationData) is what's responsible for the
    // key never reaching this layer in the first place (README: "Gemini
    // API Key 刻意存在另一把獨立的鍵...匯出課表備份不會連 Key 一起帶走").
    expect(decoded.geminiApiKey).toBe('should-not-round-trip');
  });

  it('decodes an absent geminiApiKey as an empty string', async () => {
    const original = window.normalizeSettingsData({
      teacherDB: { A: ['數學', '王老師', ''] },
      locationDB: { A: '101' },
      weeklySchedule: { 1: ['A'] },
      bellTimes: [['08:00', '08:50']]
    });
    const decoded = await window.decodeTransferData(await window.encodeTransferData(original));
    expect(decoded.geminiApiKey).toBe('');
  });

  it('rejects text that is not a valid backup', async () => {
    await expect(window.decodeTransferData('not a backup')).rejects.toThrow();
  });
});
