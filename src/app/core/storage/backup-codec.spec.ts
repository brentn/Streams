import { describe, expect, it } from 'vitest';
import { Backup, deserializeBackup, serializeBackup } from './backup-codec';

describe('backup-codec', () => {
  it('round-trips a bundle of stores, preserving Date instances', () => {
    const backup: Backup = {
      dbVersion: 4,
      exportedAt: '2026-07-27T00:00:00.000Z',
      stores: {
        accounts: [{ id: 'acc-1', balanceDate: new Date('2026-01-01T00:00:00.000Z') }],
        transactions: [],
      },
    };

    const restored = deserializeBackup(serializeBackup(backup));

    expect(restored).toEqual(backup);
    expect((restored.stores['accounts'][0] as { balanceDate: Date }).balanceDate).toBeInstanceOf(
      Date,
    );
  });

  it('preserves Date instances nested arbitrarily deep, without any hardcoded field names', () => {
    const backup: Backup = {
      dbVersion: 4,
      exportedAt: '2026-07-27T00:00:00.000Z',
      stores: {
        flows: [
          {
            id: 'flow-1',
            cadence: { anchorDate: new Date('2026-01-02T00:00:00.000Z'), anchors: [{ n: 1 }] },
          },
        ],
      },
    };

    const restored = deserializeBackup(serializeBackup(backup));

    const flow = restored.stores['flows'][0] as { cadence: { anchorDate: Date } };
    expect(flow.cadence.anchorDate).toBeInstanceOf(Date);
    expect(flow.cadence.anchorDate.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('rejects JSON that is not an object', () => {
    expect(() => deserializeBackup('42')).toThrow();
    expect(() => deserializeBackup('null')).toThrow();
    expect(() => deserializeBackup('[]')).toThrow();
  });

  it('rejects an object missing the expected backup shape', () => {
    expect(() => deserializeBackup(JSON.stringify({ foo: 'bar' }))).toThrow();
    expect(() => deserializeBackup(JSON.stringify({ dbVersion: 4 }))).toThrow();
    expect(() => deserializeBackup(JSON.stringify({ stores: {} }))).toThrow();
  });

  it('rejects a null stores value, even though typeof null === "object"', () => {
    expect(() => deserializeBackup(JSON.stringify({ dbVersion: 4, stores: null }))).toThrow(
      /not a valid Streams backup/i,
    );
  });

  it('rejects a store whose value is not an array of records', () => {
    expect(() =>
      deserializeBackup(JSON.stringify({ dbVersion: 4, stores: { accounts: 'oops' } })),
    ).toThrow(/not a valid Streams backup/i);
  });

  it('rejects malformed JSON with a friendly error rather than propagating the raw SyntaxError', () => {
    expect(() => deserializeBackup('not json')).toThrow(/not a valid Streams backup/i);
  });
});
