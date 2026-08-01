import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { AlertIcon } from '../alert-icon/alert-icon';
import { RunningDryAlert } from '../../core/projection/projection-engine';

/**
 * Small per-lane indicator for a Running-Dry Alert (see CONTEXT.md) on the multi-account
 * overview — previously only visible after drilling into the individual account.
 */
@Component({
  selector: 'app-dry-alert-badge',
  imports: [AlertIcon, CurrencyPipe, DatePipe],
  templateUrl: './dry-alert-badge.html',
  styleUrl: './dry-alert-badge.css',
})
export class DryAlertBadge {
  readonly alert = input.required<RunningDryAlert>();
}
