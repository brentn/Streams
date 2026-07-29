import { describe, expect, it } from 'vitest';
import {
  computeBackfillChunks,
  computeNormalSyncStartDate,
  initialBackfillCursor,
  MAX_SYNC_LOOKBACK_DAYS,
} from './sync-window';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-29T12:00:00Z');

describe('computeNormalSyncStartDate', () => {
  it('is the 40-day ceiling when never synced before', () => {
    expect(computeNormalSyncStartDate(undefined, NOW)).toEqual(
      new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS),
    );
  });

  it('is 3 days before the last sync, to catch late-posted transactions', () => {
    const lastSyncedAt = new Date(NOW.getTime() - 10 * DAY_MS);

    expect(computeNormalSyncStartDate(lastSyncedAt, NOW)).toEqual(
      new Date(lastSyncedAt.getTime() - 3 * DAY_MS),
    );
  });

  it('never goes further back than the 40-day ceiling, even for a long-dormant connection', () => {
    const lastSyncedAt = new Date(NOW.getTime() - 400 * DAY_MS);

    expect(computeNormalSyncStartDate(lastSyncedAt, NOW)).toEqual(
      new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS),
    );
  });

  it('stays under the 90-day bridge limit at the exact boundary', () => {
    const lastSyncedAt = new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS);

    const startDate = computeNormalSyncStartDate(lastSyncedAt, NOW);

    expect((NOW.getTime() - startDate.getTime()) / DAY_MS).toBeLessThan(90);
  });
});

describe('initialBackfillCursor', () => {
  it('is the same 40-day ceiling a first-ever normal sync would use', () => {
    expect(initialBackfillCursor(NOW)).toEqual(computeNormalSyncStartDate(undefined, NOW));
  });
});

describe('computeBackfillChunks', () => {
  it('is empty when the cursor is within 40 days of now', () => {
    const cursor = new Date(NOW.getTime() - 20 * DAY_MS);

    expect(computeBackfillChunks(cursor, NOW)).toEqual([]);
  });

  it('is empty exactly at the 40-day boundary', () => {
    const cursor = new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS);

    expect(computeBackfillChunks(cursor, NOW)).toEqual([]);
  });

  it('produces exactly the one chunk needed to close a gap just over the ceiling, not the full cap', () => {
    const cursor = new Date(NOW.getTime() - 45 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, NOW);

    expect(chunks).toEqual([
      {
        endDate: new Date(cursor.getTime() + DAY_MS),
        startDate: new Date(cursor.getTime() + DAY_MS - MAX_SYNC_LOOKBACK_DAYS * DAY_MS),
      },
    ]);
  });

  it('produces only as many chunks as needed for a mid-sized gap, short of the 10-chunk cap', () => {
    // ~100-day gap needs 2 chunks (40 days each) to close, not the full 10-chunk cap.
    const cursor = new Date(NOW.getTime() - 100 * DAY_MS);

    expect(computeBackfillChunks(cursor, NOW)).toHaveLength(2);
  });

  it('chunks overlap by 1 day between consecutive chunks', () => {
    const cursor = new Date(NOW.getTime() - 200 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, NOW);

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].endDate).toEqual(new Date(chunks[i - 1].startDate.getTime() + DAY_MS));
    }
  });

  it('walks backward in time — each chunk older than the last', () => {
    const cursor = new Date(NOW.getTime() - 500 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, NOW);

    for (const chunk of chunks) {
      expect(chunk.startDate.getTime()).toBeLessThan(chunk.endDate.getTime());
    }
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startDate.getTime()).toBeLessThan(chunks[i - 1].startDate.getTime());
    }
  });

  it('caps at 10 chunks per call, however large the gap', () => {
    const cursor = new Date(NOW.getTime() - 5000 * DAY_MS);

    expect(computeBackfillChunks(cursor, NOW)).toHaveLength(10);
  });
});
