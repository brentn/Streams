export interface Backup {
  dbVersion: number;
  exportedAt: string;
  stores: Record<string, unknown[]>;
}

const DATE_TAG = 'Date';

interface TaggedDate {
  __type: typeof DATE_TAG;
  value: string;
}

function isTaggedDate(value: unknown): value is TaggedDate {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { __type?: unknown }).__type === DATE_TAG &&
    typeof (value as { value?: unknown }).value === 'string'
  );
}

/**
 * `JSON.stringify` calls `Date#toJSON` and hands the replacer the resulting
 * string, not the Date instance — so the raw value has to be read back off
 * the holder (`this`) to detect it was a Date in the first place.
 */
function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this[key];
  if (raw instanceof Date) {
    const tagged: TaggedDate = { __type: DATE_TAG, value: raw.toISOString() };
    return tagged;
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  return isTaggedDate(value) ? new Date(value.value) : value;
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, replacer, 2);
}

function isBackup(value: unknown): value is Backup {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Backup>;
  if (typeof candidate.dbVersion !== 'number') return false;
  if (!candidate.stores || typeof candidate.stores !== 'object') return false;
  return Object.values(candidate.stores).every((records) => Array.isArray(records));
}

export function deserializeBackup(json: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json, reviver);
  } catch {
    throw new Error('This file is not a valid Streams backup.');
  }
  if (!isBackup(parsed)) {
    throw new Error('This file is not a valid Streams backup.');
  }
  return parsed;
}
