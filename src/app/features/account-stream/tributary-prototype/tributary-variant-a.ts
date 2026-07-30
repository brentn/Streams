// PROTOTYPE — throwaway, answers wayfinder ticket #52 (tributary visual model).
// Variant A: tributaries as wedges merging directly onto the band's edge.
import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { maxMagnitude, TributaryItem } from './tributary-data';

interface Wedge extends TributaryItem {
  x: number;
  halfWidth: number;
  label: string;
  polygon: string;
  labelY: number;
}

const BAND_TOP = 90;
const BAND_BOTTOM = 130;
const REACH = 55;

@Component({
  selector: 'app-tributary-variant-a',
  imports: [CurrencyPipe],
  templateUrl: './tributary-variant-a.html',
  styleUrl: './tributary-variant-a.css',
})
export class TributaryVariantA {
  readonly items = input.required<TributaryItem[]>();

  private readonly incoming = computed(() => this.items().filter((i) => i.direction === 'in'));
  private readonly outgoing = computed(() => this.items().filter((i) => i.direction === 'out'));

  protected readonly incomingWedges = computed(() => this.layout(this.incoming()));
  protected readonly outgoingWedges = computed(() => this.layout(this.outgoing()));

  private layout(list: TributaryItem[]): Wedge[] {
    const max = maxMagnitude(list) || 1;
    const slot = 600 / (list.length + 1);
    const isIncoming = list.length > 0 && list[0].direction === 'in';
    const edge = isIncoming ? BAND_TOP : BAND_BOTTOM;
    const tip = isIncoming ? edge - REACH : edge + REACH;

    return list.map((item, i) => {
      const x = slot * (i + 1);
      const halfWidth = Math.max(4, (Math.abs(item.magnitude) / max) * 28);
      const polygon = `${x - halfWidth},${edge} ${x + halfWidth},${edge} ${x},${tip}`;
      return {
        ...item,
        x,
        halfWidth,
        polygon,
        labelY: tip + (isIncoming ? -8 : 16),
        label:
          item.kind === 'transfer'
            ? `${item.direction === 'out' ? '→' : '←'} ${item.name}`
            : item.name,
      };
    });
  }
}
