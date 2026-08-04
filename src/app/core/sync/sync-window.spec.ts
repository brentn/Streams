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
  // `cursor` is the far edge of the Dormant Gap — the point where continuous coverage already
  // existed before the gap opened, and the real floor the walk can never regress past. Chunks
  // walk forward from there toward `normalSyncStartDate` (stand-in for whatever
  // `computeNormalSyncStartDate` returned this resync — the near edge, where the normal sync
  // itself picks back up), so progress made this call — and any call before it, since each
  // chunk's endDate is what callers persist as the next call's cursor — always inches toward
  // closing the gap rather than re-covering the same recent slice on every resync.
  const normalSyncStartDate = new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS);

  it('is empty when the cursor already reaches the normal-sync start date', () => {
    expect(computeBackfillChunks(normalSyncStartDate, normalSyncStartDate)).toEqual([]);
  });

  it('is empty when the cursor is more recent than the normal-sync start date — no real gap', () => {
    const cursor = new Date(normalSyncStartDate.getTime() + 5 * DAY_MS);

    expect(computeBackfillChunks(cursor, normalSyncStartDate)).toEqual([]);
  });

  it('produces exactly one chunk, clipped to the normal-sync start date, for a small gap', () => {
    const cursor = new Date(normalSyncStartDate.getTime() - 5 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, normalSyncStartDate);

    expect(chunks).toEqual([
      {
        startDate: new Date(cursor.getTime() - DAY_MS),
        endDate: normalSyncStartDate,
      },
    ]);
  });

  it('produces only as many chunks as needed for a mid-sized gap, short of the 10-chunk cap, the last one clipped to the normal-sync start date', () => {
    const cursor = new Date(normalSyncStartDate.getTime() - 100 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, normalSyncStartDate);

    expect(chunks).toHaveLength(3);
    expect(chunks[2].endDate).toEqual(normalSyncStartDate);
  });

  it('chunks overlap by 1 day between consecutive chunks', () => {
    const cursor = new Date(normalSyncStartDate.getTime() - 200 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, normalSyncStartDate);

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startDate).toEqual(new Date(chunks[i - 1].endDate.getTime() - DAY_MS));
    }
  });

  it('walks forward in time — each chunk newer than the last', () => {
    const cursor = new Date(normalSyncStartDate.getTime() - 500 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, normalSyncStartDate);

    for (const chunk of chunks) {
      expect(chunk.startDate.getTime()).toBeLessThan(chunk.endDate.getTime());
    }
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].endDate.getTime()).toBeGreaterThan(chunks[i - 1].endDate.getTime());
    }
  });

  it('caps at 10 chunks for a gap wider than one resync can close, without reaching the normal-sync start date', () => {
    const cursor = new Date(normalSyncStartDate.getTime() - 5000 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, normalSyncStartDate);

    expect(chunks).toHaveLength(10);
    expect(chunks[9].endDate.getTime()).toBeLessThan(normalSyncStartDate.getTime());
  });

  it('never produces an endDate newer than the normal-sync start date, however large the gap', () => {
    const cursor = new Date(normalSyncStartDate.getTime() - 5000 * DAY_MS);

    const chunks = computeBackfillChunks(cursor, normalSyncStartDate);

    for (const chunk of chunks) {
      expect(chunk.endDate.getTime()).toBeLessThanOrEqual(normalSyncStartDate.getTime());
    }
  });

  it('resumes forward from wherever a prior capped call left off, rather than re-covering the same slice', () => {
    const cursor = new Date(normalSyncStartDate.getTime() - 5000 * DAY_MS);

    const firstCall = computeBackfillChunks(cursor, normalSyncStartDate);
    const progress = firstCall[firstCall.length - 1].endDate;
    const secondCall = computeBackfillChunks(progress, normalSyncStartDate);

    expect(secondCall[0].startDate.getTime()).toBeGreaterThanOrEqual(progress.getTime() - DAY_MS);
    expect(secondCall[secondCall.length - 1].endDate.getTime()).toBeGreaterThan(progress.getTime());
  });
});
