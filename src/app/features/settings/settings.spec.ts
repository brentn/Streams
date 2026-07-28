import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileDownloadService } from '../../core/download/file-download';
import { serializeBackup } from '../../core/storage/backup-codec';
import { StorageRepository } from '../../core/storage/storage-repository';
import { Settings } from './settings';

describe('Settings', () => {
  let storage: {
    exportAll: ReturnType<typeof vi.fn>;
    importAll: ReturnType<typeof vi.fn>;
  };
  let fileDownload: { download: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    storage = {
      exportAll: vi.fn(),
      importAll: vi.fn(),
    };
    fileDownload = { download: vi.fn() };
    router = { navigateByUrl: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: FileDownloadService, useValue: fileDownload },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
  });

  function makeFile(content: string, name = 'backup.json'): File {
    return new File([content], name, { type: 'application/json' });
  }

  describe('export', () => {
    it('downloads a JSON file built from every store the repository reports', async () => {
      storage.exportAll.mockResolvedValue({
        dbVersion: 4,
        stores: { accounts: [{ id: 'acc-1' }], transactions: [] },
      });

      const component = TestBed.createComponent(Settings).componentInstance;
      await component['exportData']();

      expect(fileDownload.download).toHaveBeenCalledTimes(1);
      const [filename, content, mimeType] = fileDownload.download.mock.calls[0];
      expect(filename).toMatch(/^streams-backup-.*\.json$/);
      expect(mimeType).toBe('application/json');
      const parsed = JSON.parse(content);
      expect(parsed.dbVersion).toBe(4);
      expect(parsed.stores).toEqual({ accounts: [{ id: 'acc-1' }], transactions: [] });
      expect(component['errorMessage']()).toBeNull();
    });

    it('surfaces an error message when export fails', async () => {
      storage.exportAll.mockRejectedValue(new Error('db unavailable'));

      const component = TestBed.createComponent(Settings).componentInstance;
      await component['exportData']();

      expect(component['errorMessage']()).toBe('db unavailable');
      expect(fileDownload.download).not.toHaveBeenCalled();
    });
  });

  describe('import', () => {
    it('parses a selected file and stages it for confirmation without touching storage yet', async () => {
      const backupJson = serializeBackup({
        dbVersion: 4,
        exportedAt: '2026-07-27T00:00:00.000Z',
        stores: { accounts: [{ id: 'acc-1' }], transactions: [{ id: 't1' }, { id: 't2' }] },
      });

      const component = TestBed.createComponent(Settings).componentInstance;
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
      const component = TestBed.createComponent(Settings).componentInstance;
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
      const component = TestBed.createComponent(Settings).componentInstance;
      await component['onFileSelected'](makeFile(backupJson));

      component['cancelImport']();

      expect(component['pendingImport']()).toBeNull();
      expect(storage.importAll).not.toHaveBeenCalled();
    });

    it('confirmImport restores the staged stores and navigates to the accounts view', async () => {
      const backupJson = serializeBackup({
        dbVersion: 4,
        exportedAt: '2026-07-27T00:00:00.000Z',
        stores: { accounts: [{ id: 'acc-1' }] },
      });
      storage.importAll.mockResolvedValue(undefined);
      const component = TestBed.createComponent(Settings).componentInstance;
      await component['onFileSelected'](makeFile(backupJson));

      await component['confirmImport']();

      expect(storage.importAll).toHaveBeenCalledWith({ accounts: [{ id: 'acc-1' }] });
      expect(component['pendingImport']()).toBeNull();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts');
    });

    it('surfaces an error and keeps the staged file when the restore fails', async () => {
      const backupJson = serializeBackup({
        dbVersion: 4,
        exportedAt: '2026-07-27T00:00:00.000Z',
        stores: { accounts: [] },
      });
      storage.importAll.mockRejectedValue(new Error('restore failed'));
      const component = TestBed.createComponent(Settings).componentInstance;
      await component['onFileSelected'](makeFile(backupJson));

      await component['confirmImport']();

      expect(component['errorMessage']()).toBe('restore failed');
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('re-attempts export after an export failure', async () => {
      storage.exportAll
        .mockRejectedValueOnce(new Error('db unavailable'))
        .mockResolvedValueOnce({ dbVersion: 4, stores: { accounts: [] } });
      const component = TestBed.createComponent(Settings).componentInstance;
      await component['exportData']();
      expect(component['errorMessage']()).toBe('db unavailable');

      await component['retry']();

      expect(storage.exportAll).toHaveBeenCalledTimes(2);
      expect(fileDownload.download).toHaveBeenCalledTimes(1);
      expect(component['errorMessage']()).toBeNull();
    });

    it('re-attempts the restore after a failed confirmImport', async () => {
      const backupJson = serializeBackup({
        dbVersion: 4,
        exportedAt: '2026-07-27T00:00:00.000Z',
        stores: { accounts: [] },
      });
      storage.importAll
        .mockRejectedValueOnce(new Error('restore failed'))
        .mockResolvedValueOnce(undefined);
      const component = TestBed.createComponent(Settings).componentInstance;
      await component['onFileSelected'](makeFile(backupJson));
      await component['confirmImport']();
      expect(component['errorMessage']()).toBe('restore failed');

      await component['retry']();

      expect(storage.importAll).toHaveBeenCalledTimes(2);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts');
      expect(component['errorMessage']()).toBeNull();
    });

    it('does nothing when there is no prior failure to retry', async () => {
      const component = TestBed.createComponent(Settings).componentInstance;

      await component['retry']();

      expect(storage.exportAll).not.toHaveBeenCalled();
      expect(storage.importAll).not.toHaveBeenCalled();
    });
  });
});
