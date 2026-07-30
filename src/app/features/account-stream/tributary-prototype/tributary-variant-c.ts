// PROTOTYPE — throwaway, answers wayfinder ticket #52 (tributary visual model).
// Variant C: symmetric two-column in/out bar chart, decoupled from the band's timeline.
import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { maxMagnitude, TributaryItem } from './tributary-data';

interface Bar extends TributaryItem {
  y: number;
  length: number;
  label: string;
}

const AXIS_X = 300;
const ROW_HEIGHT = 30;
const ROWS_START_Y = 40;
const MAX_LENGTH = 230;

@Component({
  selector: 'app-tributary-variant-c',
  imports: [CurrencyPipe],
  templateUrl: './tributary-variant-c.html',
  styleUrl: './tributary-variant-c.css',
})
export class TributaryVariantC {
  readonly items = input.required<TributaryItem[]>();

  private readonly incoming = computed(() =>
    [...this.items()]
      .filter((i) => i.direction === 'in')
      .sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude)),
  );
  private readonly outgoing = computed(() =>
    [...this.items()]
      .filter((i) => i.direction === 'out')
      .sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude)),
  );

  private readonly max = computed(() => maxMagnitude(this.items()) || 1);

  protected readonly incomingBars = computed<Bar[]>(() =>
    this.incoming().map((item, i) => this.toBar(item, i)),
  );
  protected readonly outgoingBars = computed<Bar[]>(() =>
    this.outgoing().map((item, i) => this.toBar(item, i)),
  );

  protected readonly sceneHeight = computed(
    () => ROWS_START_Y + Math.max(this.incoming().length, this.outgoing().length) * ROW_HEIGHT + 20,
  );

  private toBar(item: TributaryItem, index: number): Bar {
    return {
      ...item,
      y: ROWS_START_Y + index * ROW_HEIGHT,
      length: Math.max(8, (Math.abs(item.magnitude) / this.max()) * MAX_LENGTH),
      label:
        item.kind === 'transfer' ? `${item.direction === 'out' ? '→' : '←'} ${item.name}` : item.name,
    };
  }
}
