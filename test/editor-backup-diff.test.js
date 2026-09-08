import { beforeAll, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { buildFixtureData, seedLocalStorage } from './helpers/fixtureData.js';

let describeSettingsDiff;

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  ({ describeSettingsDiff } = await import('../src/editor-backup.js'));
});

describe('describeSettingsDiff: pure reorder detection', () => {
  it('reports nothing for two identical settings objects', () => {
    const data = buildFixtureData();
    expect(describeSettingsDiff(data, data)).toBe('沒有變更。');
  });

  it('reports a reorder line when only teacherOrder changes', () => {
    const current = buildFixtureData();
    const next = { ...current, teacherOrder: ['C', 'A', 'B'] };
    expect(describeSettingsDiff(current, next)).toMatch(/課程順序已調整/);
  });

  it('does not report a reorder when teacherOrder is unchanged', () => {
    const current = buildFixtureData();
    const next = { ...current, teacherOrder: [...current.teacherOrder] };
    expect(describeSettingsDiff(current, next)).not.toMatch(/課程順序已調整/);
  });

  it('does not report a reorder when a teacher was actually added (not a pure reorder)', () => {
    const current = buildFixtureData();
    const next = {
      ...current,
      teacherDB: { ...current.teacherDB, D: ['歷史', '張老師', ''] },
      teacherOrder: [...current.teacherOrder, 'D']
    };
    const diff = describeSettingsDiff(current, next);
    expect(diff).toMatch(/新增/);
    expect(diff).not.toMatch(/課程順序已調整/);
  });

  it('reports a reorder line when only countdown event order changes', () => {
    const current = {
      ...buildFixtureData(),
      countdownEvents: [
        { name: '段考', startDate: '2024-01-15', endDate: '2024-01-17' },
        { name: '運動會', startDate: '2024-03-01', endDate: '2024-03-01' }
      ]
    };
    const next = { ...current, countdownEvents: [...current.countdownEvents].reverse() };
    expect(describeSettingsDiff(current, next)).toMatch(/倒數活動順序已調整/);
  });
});

describe('describeSettingsDiff: no truncation for a long diff', () => {
  it('keeps every changed line, even well past the old 70-line cap', () => {
    const current = buildFixtureData();
    const manyTeachers = {};
    const order = [];
    for (let i = 0; i < 100; i++) {
      manyTeachers[`t${i}`] = [`科目${i}`, `老師${i}`, ''];
      order.push(`t${i}`);
    }
    const next = { ...current, teacherDB: manyTeachers, teacherOrder: order };
    const diff = describeSettingsDiff(current, next);
    expect(diff).not.toMatch(/還有.*項變更未顯示/);
    // Every one of the 100 new-teacher lines should survive.
    for (let i = 0; i < 100; i++) {
      expect(diff).toContain(`科目${i}`);
    }
  });
});
