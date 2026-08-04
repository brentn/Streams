const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ceiling on how far back any single fetch's `start-date` may reach. SimpleFIN Bridge's hard
 * limit is 90 days, but it also warns past a softer 45-day advisory threshold ("may be capped"
 * in the future); 40 leaves margin under that advisory threshold for the normal-sync overlap
 * buffer below plus rounding/timezone edge cases, so a boundary-value request never trips it.
 */
export const MAX_SYNC_LOOKBACK_DAYS = 40;

const NORMAL_SYNC_OVERLAP_DAYS = 3;
const BACKFILL_CHUNK_OVERLAP_DAYS = 1;
/** 10 chunks of 40 days keeps a full backfill sweep's total reach roughly unchanged from the previous 5×85. */
const MAX_BACKFILL_CHUNKS_PER_RESYNC = 10;
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

/** Whether a Dormant Gap exists between `cursor` (where continuous coverage already existed) and `normalSyncStartDate` (the near edge, wherever this resync's own normal sync starts) — the shared test `computeBackfillChunks` and its callers use to decide whether there's anything to close. */
export function hasDormantGap(cursor: Date, normalSyncStartDate: Date): boolean {
  return cursor.getTime() < normalSyncStartDate.getTime();
}

/**
 * Walks forward from `cursor` (the far edge of a Dormant Gap — the point where continuous
 * coverage already existed before the gap opened) toward `normalSyncStartDate` (the near edge,
 * wherever this resync's own normal sync starts) in `MAX_SYNC_LOOKBACK_DAYS`-sized chunks, each
 * overlapping the previous by a day so no transaction sits exactly on a chunk boundary. Produces
 * chunks only while `cursor` is still older than `normalSyncStartDate` — otherwise there's no
 * gap, a plain normal sync already covers it. The final chunk is clipped to land exactly on
 * `normalSyncStartDate` rather than overshooting past it. Capped at
 * `MAX_BACKFILL_CHUNKS_PER_RESYNC` regardless, to bound a single resync's request count and
 * protect SimpleFIN Bridge's ~24 requests/day quota (ADR-0004).
 *
 * Callers persist each chunk's `endDate` as the new cursor, so a gap wider than one resync's cap
 * can close keeps closing further — forward, from wherever the last call left off — on every
 * subsequent manual resync, rather than restarting from `cursor`'s original position (which would
 * just re-cover the same slice nearest `normalSyncStartDate` every time) or overshooting past
 * where the real gap began.
 */
export function computeBackfillChunks(cursor: Date, normalSyncStartDate: Date): SyncWindow[] {
  if (!hasDormantGap(cursor, normalSyncStartDate)) return [];

  const chunks: SyncWindow[] = [];
  let boundary = cursor;
  for (let i = 0; i < MAX_BACKFILL_CHUNKS_PER_RESYNC; i++) {
    const startDate = new Date(boundary.getTime() - BACKFILL_CHUNK_OVERLAP_DAYS * DAY_MS);
    const rawEndDate = new Date(startDate.getTime() + CHUNK_MS);
    const reachedNearEdge = rawEndDate.getTime() >= normalSyncStartDate.getTime();
    const endDate = reachedNearEdge ? normalSyncStartDate : rawEndDate;
    chunks.push({ startDate, endDate });
    if (reachedNearEdge) break;
    boundary = endDate;
  }
  return chunks;
}
