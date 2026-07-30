import { Component } from '@angular/core';
import { FlowFormPrototypeBase } from './flow-form-prototype-base';

/**
 * PROTOTYPE — wayfinder ticket #53, Variant C.
 * Splits the dialog into two zones: essentials (name/direction/kind/amount) stay fixed at
 * the top, always visible; everything else lives in a scrollable "Advanced" strip below,
 * presented as tappable summary tiles. Tapping the Tolerance tile flips it in place into a
 * stepper (- value +) with a %/$ toggle. Step Change / Recurring Rule tiles show their count
 * directly (no separate badge) and open the sub-modal on tap. Day selection is a single-row,
 * wrapping button-group replacing the old select outright.
 */
@Component({
  selector: 'app-variant-c-dialog',
  templateUrl: './variant-c-dialog.html',
  styleUrl: './variant-c-dialog.css',
})
export class VariantCDialog extends FlowFormPrototypeBase {
  protected stepTolerance(delta: number): void {
    this.toleranceValue.update((v) => Math.max(0, v + delta));
  }
}
