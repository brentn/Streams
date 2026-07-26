import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { StorageRepository } from '../../core/storage/storage-repository';

@Component({
  selector: 'app-home',
  template: `<p>Loading…</p>`,
})
export class Home {
  private readonly router = inject(Router);
  private readonly storage = inject(StorageRepository);

  constructor() {
    void this.redirect();
  }

  private async redirect(): Promise<void> {
    const accounts = await this.storage.getAccounts();
    const target = accounts.length > 0 ? '/accounts' : '/connect';
    await this.router.navigateByUrl(target);
  }
}
