import { Dialog } from '@angular/cdk/dialog';
import { Component, inject, input, Type } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PrototypeSwitcher, PrototypeVariant } from './prototype-switcher';
import { VariantADialog } from './variant-a-dialog';
import { VariantBDialog } from './variant-b-dialog';
import { VariantCDialog } from './variant-c-dialog';

const VARIANTS: PrototypeVariant[] = [
  { key: 'A', label: 'Inline badges, dotted click-to-edit, pill days' },
  { key: 'B', label: 'Sectioned cards, dot badges, calendar-grid days' },
  { key: 'C', label: 'Summary tiles, stepper tolerance, button-group days' },
];

const DIALOGS: Record<string, Type<unknown>> = {
  A: VariantADialog,
  B: VariantBDialog,
  C: VariantCDialog,
};

/**
 * PROTOTYPE — wayfinder ticket #53 (https://github.com/brentn/Streams/issues/53), child of
 * the "Account screen tributary redesign" map (issue #51). Throwaway route: the real
 * AssignFlowDialog only opens against a real, unmatched Transaction on a synced Account,
 * which this repo has no fixture for — so this hosts the three redesign variants directly,
 * against stub data, reachable at /prototype/issue-53?variant=A|B|C.
 *
 * Not wired into any nav — visit the URL directly. Delete this whole directory and the
 * matching app.routes.ts entry once the ticket is resolved.
 */
@Component({
  selector: 'app-prototype-issue-53',
  imports: [PrototypeSwitcher],
  templateUrl: './prototype-issue-53.html',
  styleUrl: './prototype-issue-53.css',
})
export class PrototypeIssue53 {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);

  /** Bound from the `?variant=` query param by `withComponentInputBinding()` in app.config.ts. */
  readonly variant = input<string>('A');

  protected readonly variants = VARIANTS;

  protected setVariant(key: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { variant: key },
      queryParamsHandling: 'merge',
    });
  }

  protected openDialog(): void {
    this.dialog.open(DIALOGS[this.variant()]);
  }
}
