import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../core/models/account';
import { FileDownloadService } from '../../core/download/file-download';
import { StorageRepository } from '../../core/storage/storage-repository';
import { Settings } from './settings';

describe('Settings', () => {
  let storage: {
    exportAll: ReturnType<typeof vi.fn>;
    importAll: ReturnType<typeof vi.fn>;
    getAccounts: ReturnType<typeof vi.fn>;
    upsertAccount: ReturnType<typeof vi.fn>;
  };
  let fileDownload: { download: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  const account: Account = {
    id: 'acc-1',
    name: 'Checking',
    institutionName: 'Bank',
    balance: 100,
    balanceDate: new Date('2026-07-25'),
    expectedSign: 1,
    dryFloor: 0,
  };

  beforeEach(async () => {
    storage = {
      exportAll: vi.fn(),
      importAll: vi.fn(),
      getAccounts: vi.fn().mockResolvedValue([account]),
      upsertAccount: vi.fn(),
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

  describe('backup import', () => {
    it('navigates to the accounts view once the shared backup-import component reports success', () => {
      const component = TestBed.createComponent(Settings).componentInstance;

      component['onBackupImported']();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts');
    });
  });

  describe('accounts', () => {
    it('loads every stored Account on init', async () => {
      const fixture = TestBed.createComponent(Settings);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.componentInstance['accounts']()).toEqual([account]);
    });

    it('persists an edited Account and reflects it in the loaded list', async () => {
      const fixture = TestBed.createComponent(Settings);
      fixture.detectChanges();
      await fixture.whenStable();
      const component = fixture.componentInstance;
      const updated: Account = { ...account, name: 'Renamed', institutionName: 'New Bank' };

      await component['onAccountSaved'](updated);

      expect(storage.upsertAccount).toHaveBeenCalledWith(updated);
      expect(component['accounts']()).toEqual([updated]);
    });

    it('surfaces an error message, without updating the list, when persisting an edit fails', async () => {
      storage.upsertAccount.mockRejectedValue(new Error('db unavailable'));
      const fixture = TestBed.createComponent(Settings);
      fixture.detectChanges();
      await fixture.whenStable();
      const component = fixture.componentInstance;
      const updated: Account = { ...account, name: 'Renamed' };

      await component['onAccountSaved'](updated);

      expect(component['errorMessage']()).toBe('db unavailable');
      expect(component['accounts']()).toEqual([account]);
    });

    it('retries the failed account save', async () => {
      storage.upsertAccount.mockRejectedValueOnce(new Error('db unavailable')).mockResolvedValueOnce(undefined);
      const fixture = TestBed.createComponent(Settings);
      fixture.detectChanges();
      await fixture.whenStable();
      const component = fixture.componentInstance;
      const updated: Account = { ...account, name: 'Renamed' };
      await component['onAccountSaved'](updated);
      expect(component['errorMessage']()).toBe('db unavailable');

      await component['retry']();

      expect(component['errorMessage']()).toBeNull();
      expect(component['accounts']()).toEqual([updated]);
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

    it('does nothing when there is no prior failure to retry', async () => {
      const component = TestBed.createComponent(Settings).componentInstance;

      await component['retry']();

      expect(storage.exportAll).not.toHaveBeenCalled();
    });
  });
});
