import { Component } from '@angular/core';
import { FlowFormPrototypeBase } from './flow-form-prototype-base';

/**
 * PROTOTYPE — wayfinder ticket #53, Variant B.
 * The form is broken into labelled section cards (Basics / Schedule / Amount rules). The
 * "Amount rules" section header itself carries small colored-dot badges for Step Change /
 * Recurring Rule. Tolerance is a rounded chip. Day-of-month renders as a compact 7-column
 * calendar-style grid of radio cells; day-of-week as a single-row segmented control.
 */
@Component({
  selector: 'app-variant-b-dialog',
  templateUrl: './variant-b-dialog.html',
  styleUrl: './variant-b-dialog.css',
})
export class VariantBDialog extends FlowFormPrototypeBase {}
