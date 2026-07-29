import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeBackup } from '../../core/storage/backup-codec';
import { StorageRepository } from '../../core/storage/storage-repository';
import { BackupImport } from './backup-import';

describe('BackupImport', () => {
  let storage: { importAll: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    storage = { importAll: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [BackupImport],
      providers: [{ provide: StorageRepository, useValue: storage }],
    }).compileComponents();
  });

  function makeFile(content: string, name = 'backup.json'): File {
    return new File([content], name, { type: 'application/json' });
  }

  it('parses a selected file and stages it for confirmation without touching storage yet', async () => {
    const backupJson = serializeBackup({
      dbVersion: 4,
      exportedAt: '2026-07-27T00:00:00.000Z',
      stores: { accounts: [{ id: 'acc-1' }], transactions: [{ id: 't1' }, { id: 't2' }] },
    });

    const component = TestBed.createComponent(BackupImport).componentInstance;
    await component['onFileSelected'](makeFile(backupJson));

    expect(component['pendingImport']()).not.toBeNull();
    expect(component['storeSummary']()).toEqual(
      expect.arrayContaining([
        { name: 'accounts', count: 1 },
        { name: 'transactions', count: 2 },
      ]),
    );
    expect(storage.importAll).not.toHaveBeenCalled();
  });

  it('surfaces a friendly error and stages nothing when the file is not a valid backup', async () => {
    const component = TestBed.createComponent(BackupImport).componentInstance;

    await component['onFileSelected'](makeFile('not json'));

    expect(component['pendingImport']()).toBeNull();
    expect(component['errorMessage']()).toMatch(/not a valid Streams backup/i);
  });

  it('cancelImport clears the staged file without calling storage', async () => {
    const backupJson = serializeBackup({
      dbVersion: 4,
      exportedAt: '2026-07-27T00:00:00.000Z',
      stores: { accounts: [] },
    });
    const component = TestBed.createComponent(BackupImport).componentInstance;
    await component['onFileSelected'](makeFile(backupJson));

    component['cancelImport']();

    expect(component['pendingImport']()).toBeNull();
    expect(storage.importAll).not.toHaveBeenCalled();
  });

  it('confirmImport restores the staged stores and emits imported', async () => {
    const backupJson = serializeBackup({
      dbVersion: 4,
      exportedAt: '2026-07-27T00:00:00.000Z',
      stores: { accounts: [{ id: 'acc-1' }] },
    });
    storage.importAll.mockResolvedValue(undefined);
    const component = TestBed.createComponent(BackupImport).componentInstance;
    await component['onFileSelected'](makeFile(backupJson));
    const onImported = vi.fn();
    component.imported.subscribe(onImported);

    await component['confirmImport']();

    expect(storage.importAll).toHaveBeenCalledWith({ accounts: [{ id: 'acc-1' }] });
    expect(component['pendingImport']()).toBeNull();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error and keeps the staged file when the restore fails', async () => {
    const backupJson = serializeBackup({
      dbVersion: 4,
      exportedAt: '2026-07-27T00:00:00.000Z',
      stores: { accounts: [] },
    });
    storage.importAll.mockRejectedValue(new Error('restore failed'));
    const component = TestBed.createComponent(BackupImport).componentInstance;
    await component['onFileSelected'](makeFile(backupJson));
    const onImported = vi.fn();
    component.imported.subscribe(onImported);

    await component['confirmImport']();

    expect(component['errorMessage']()).toBe('restore failed');
    expect(onImported).not.toHaveBeenCalled();
  });

  it('retries the restore after a failed confirmImport', async () => {
    const backupJson = serializeBackup({
      dbVersion: 4,
      exportedAt: '2026-07-27T00:00:00.000Z',
      stores: { accounts: [] },
    });
    storage.importAll
      .mockRejectedValueOnce(new Error('restore failed'))
      .mockResolvedValueOnce(undefined);
    const component = TestBed.createComponent(BackupImport).componentInstance;
    await component['onFileSelected'](makeFile(backupJson));
    await component['confirmImport']();
    expect(component['errorMessage']()).toBe('restore failed');
    const onImported = vi.fn();
    component.imported.subscribe(onImported);

    await component['retry']();

    expect(storage.importAll).toHaveBeenCalledTimes(2);
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(component['errorMessage']()).toBeNull();
  });

  it('does nothing when there is no prior failure to retry', async () => {
    const component = TestBed.createComponent(BackupImport).componentInstance;

    await component['retry']();

    expect(storage.importAll).not.toHaveBeenCalled();
  });
});
