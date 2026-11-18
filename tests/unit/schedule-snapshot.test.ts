import { describe, expect, test } from 'vitest';
import { validateScheduleSnapshot } from '../../src/utils/scheduleSnapshot.js';

const now = new Date('2026-10-10T04:00:00Z');
const payload = () => ({
  source: 'nautilus', date: '2026-10-11', timezone: 'Asia/Shanghai',
  generatedAt: now.toISOString(), items: [
    { kind: 'pinned', title: '阅读', startMinute: 540, endMinute: 585 },
    { kind: 'flex', title: '实验复盘', startMinute: 1470, endMinute: 1530 }
  ]
});

describe('Nautilus snapshot contract', () => {
  test('keeps local calendar dates and minute offsets across midnight, independently of server timezone', () => {
    const result = validateScheduleSnapshot(payload(), now);
    expect(result.items.map(item => item.startAt.toISOString())).toEqual([
      '2026-10-11T01:00:00.000Z', '2026-10-11T16:30:00.000Z'
    ]);
    expect(result.items[1]?.endAt.toISOString()).toBe('2026-10-11T17:30:00.000Z');
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  test('uses stable content identity across reordering and flex rescheduling', () => {
    const input = payload();
    const result = validateScheduleSnapshot(input, now);
    expect(new Set(result.items.map(item => item.key)).size).toBe(2);
    const reordered = validateScheduleSnapshot({
      ...input, items: [input.items[1], input.items[0]]
    }, now);
    expect(reordered.items.map(item => item.key).sort()).toEqual(result.items.map(item => item.key).sort());
    const shifted = validateScheduleSnapshot({ ...input, items: [
      input.items[0], { ...input.items[1], startMinute: 1530, endMinute: 1590 }
    ] }, now);
    expect(shifted.items[1]?.key).toBe(result.items[1]?.key);
    expect(shifted.revision).not.toBe(result.revision);
  });

  test('rejects indistinguishable repeated flex tasks before they can drift across snapshots', () => {
    const input = payload();
    input.items.push({ ...input.items[1]!, startMinute: 1530, endMinute: 1590 });
    expect(() => validateScheduleSnapshot(input, now)).toThrow(/重复.*标题/);
  });

  test.each([
    { date: '2026-02-30' }, { date: '2027-11-11' }, { timezone: 'Mars/Olympus' },
    { generatedAt: 'invalid' }, { generatedAt: '2026-10-10T05:00:00Z' }, { source: 'other' },
    { items: null }, { items: Array.from({ length: 201 }, () => payload().items[0]) },
    { items: [{ ...payload().items[0], startMinute: -1 }] },
    { items: [{ ...payload().items[0], startMinute: 0.5 }] },
    { items: [{ ...payload().items[0], endMinute: 540 }] },
    { items: [{ ...payload().items[0], endMinute: 2881 }] },
    { items: [{ ...payload().items[0], title: '' }] },
    { items: [{ ...payload().items[0], title: 'x'.repeat(1001) }] },
    { items: [{ ...payload().items[0], kind: 'unknown' }] }
  ])('rejects malformed snapshots before persistence: %j', (change) => {
    expect(() => validateScheduleSnapshot({ ...payload(), ...change }, now)).toThrow();
  });

  test('accepts an empty snapshot for explicit cancellation', () => {
    expect(validateScheduleSnapshot({ ...payload(), items: [] }, now).items).toEqual([]);
  });
});
