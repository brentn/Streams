import { Component } from '@angular/core';
import { FlowFormPrototypeBase } from './flow-form-prototype-base';

/**
 * PROTOTYPE — wayfinder ticket #53, Variant A.
 * Flat single-column form (closest to today's layout). Step Change / Recurring Rule become
 * small icon-badge buttons inline under Amount. Tolerance is a dotted-underline value you
 * click to flip into an inline editor. Day-of-month/week render as a wrapped row of small
 * round radio pills.
 */
@Component({
  selector: 'app-variant-a-dialog',
  templateUrl: './variant-a-dialog.html',
  styleUrl: './variant-a-dialog.css',
})
export class VariantADialog extends FlowFormPrototypeBase {}
