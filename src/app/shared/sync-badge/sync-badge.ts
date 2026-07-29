import { Component, input } from '@angular/core';
import { AlertIcon } from '../alert-icon/alert-icon';

/**
 * Small per-lane indicator for a Sync Issue (see CONTEXT.md) on the multi-account overview —
 * informational, no action implied. Distinct from Needs Reauthentication, which is
 * connection-level and surfaces via `StatusBanner`'s serious severity instead, never here.
 */
@Component({
  selector: 'app-sync-badge',
  imports: [AlertIcon],
  templateUrl: './sync-badge.html',
  styleUrl: './sync-badge.css',
})
export class SyncBadge {
  readonly message = input.required<string>();
}
