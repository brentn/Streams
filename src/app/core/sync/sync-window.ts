const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ceiling on how far back any single fetch's `start-date` may reach. SimpleFIN Bridge's own
 * limit is an exact 90 days; 85 leaves margin for the normal-sync overlap buffer below plus
 * rounding/timezone edge cases, so a boundary-value request never trips the bridge's own
 * "Requested date range exceeds limit of 90 days" error.
 */
export const MAX_SYNC_LOOKBACK_DAYS = 85;

const NORMAL_SYNC_OVERLAP_DAYS = 3;
const BACKFILL_CHUNK_OVERLAP_DAYS = 1;
const MAX_BACKFILL_CHUNKS_PER_RESYNC = 5;
const CHUNK_MS = MAX_SYNC_LOOKBACK_DAYS * DAY_MS;

export interface SyncWindow {
  startDate: Date;
  endDate: Date;
}

/** The oldest `start-date` any single fetch may use — shared by the normal-sync ceiling and the backfill cursor's initial bootstrap, since both estimates are "no further back than `MAX_SYNC_LOOKBACK_DAYS`". */
function lookbackCeiling(now: Date): Date {
  return new Date(now.getTime() - CHUNK_MS);
}

/**
 * `start-date` for the single request every sync trigger (initial link, auto-resync, manual
 * resync) makes to refresh recent data. 3 days before the last sync catches late-posted/backdated
 * transactions; never reaches further back than `MAX_SYNC_LOOKBACK_DAYS`, so a long-dormant
 * connection's normal sync still requests a fresh, in-limit window rather than an ever-growing
 * one — closing the resulting older gap is `computeBackfillChunks`' job, not this one's.
 */
export function computeNormalSyncStartDate(lastSyncedAt: Date | undefined, now: Date): Date {
  const ceiling = lookbackCeiling(now);
  if (!lastSyncedAt) return ceiling;
  const withOverlap = new Date(lastSyncedAt.getTime() - NORMAL_SYNC_OVERLAP_DAYS * DAY_MS);
  return withOverlap.getTime() < ceiling.getTime() ? ceiling : withOverlap;
}

/** Where a brand-new or newly-migrated connection's backfill cursor starts: the same ceiling a first-ever normal sync would use, since neither case has any fetched history yet to be more precise about. */
export function initialBackfillCursor(now: Date): Date {
  return lookbackCeiling(now);
}

/**
 * Walks backward from `cursor` (the oldest date already fetched for this connection) in
 * `MAX_SYNC_LOOKBACK_DAYS`-sized chunks, each overlapping the previous by a day so no
 * transaction sits exactly on a chunk boundary. Only produces chunks once the gap between
 * `cursor` and `now` exceeds the normal-sync ceiling — otherwise a plain normal sync already
 * covers it. Produces only as many chunks as needed to close that gap (not always the full
 * cap), so a cursor that's just barely past the ceiling costs one request, not five — capped
 * at `MAX_BACKFILL_CHUNKS_PER_RESYNC` regardless, to bound a single resync's request count and
 * protect SimpleFIN Bridge's ~24 requests/day quota (ADR-0004). Callers persist the cursor
 * after each chunk succeeds, so a gap wider than one resync's cap can close keeps closing
 * further on every subsequent manual resync rather than restarting.
 */
export function computeBackfillChunks(cursor: Date, now: Date): SyncWindow[] {
  const excessMs = now.getTime() - cursor.getTime() - CHUNK_MS;
  if (excessMs <= 0) return [];

  const chunksNeeded = Math.min(MAX_BACKFILL_CHUNKS_PER_RESYNC, Math.ceil(excessMs / CHUNK_MS));

  const chunks: SyncWindow[] = [];
  let boundary = cursor;
  for (let i = 0; i < chunksNeeded; i++) {
    const endDate = new Date(boundary.getTime() + BACKFILL_CHUNK_OVERLAP_DAYS * DAY_MS);
    const startDate = new Date(endDate.getTime() - CHUNK_MS);
    chunks.push({ startDate, endDate });
    boundary = startDate;
  }
  return chunks;
}
