import { Component, input, output } from '@angular/core';
import { AlertIcon } from '../alert-icon/alert-icon';

/** critical: a transient operation failure (existing behavior). serious: Needs Reauthentication — blocking, actionable. warning: Sync Issue — informational. Never critical for the latter two, per the dataviz status palette. */
export type BannerSeverity = 'critical' | 'serious' | 'warning';

/**
 * Shared error/loading treatment per docs/ux-spec.md ("Error / loading
 * states: inline banner"): a persistent in-flow banner for errors (icon +
 * message + its own action button), and a slim indeterminate progress bar
 * under the header while syncing. Not a toast, not folded into header text.
 */
@Component({
  selector: 'app-status-banner',
  imports: [AlertIcon],
  templateUrl: './status-banner.html',
  styleUrl: './status-banner.css',
})
export class StatusBanner {
  readonly errorMessage = input<string | null>(null);
  readonly isSyncing = input(false);
  readonly severity = input<BannerSeverity>('critical');
  readonly retryLabel = input('Retry');
  readonly retry = output<void>();
}
