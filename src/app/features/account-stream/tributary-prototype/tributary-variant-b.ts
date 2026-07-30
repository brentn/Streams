// PROTOTYPE — throwaway, answers wayfinder ticket #52 (tributary visual model).
// Variant B: tributaries peeled off into a stacked, leader-lined list.
import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { maxMagnitude, TributaryItem } from './tributary-data';

interface Row extends TributaryItem {
  rowY: number;
  swatchWidth: number;
  leaderPath: string;
  label: string;
}

const BAND_BOTTOM = 40;
const LIST_START_Y = 72;
const ROW_HEIGHT = 30;
const LIST_X = 24;
const MAX_SWATCH = 120;

@Component({
  selector: 'app-tributary-variant-b',
  imports: [CurrencyPipe],
  templateUrl: './tributary-variant-b.html',
  styleUrl: './tributary-variant-b.css',
})
export class TributaryVariantB {
  readonly items = input.required<TributaryItem[]>();

  protected readonly rows = computed<Row[]>(() => {
    const list = this.items();
    const max = maxMagnitude(list) || 1;
    const slot = 600 / (list.length + 1);

    return list.map((item, i) => {
      const sourceX = slot * (i + 1);
      const rowY = LIST_START_Y + i * ROW_HEIGHT;
      const swatchWidth = Math.max(6, (Math.abs(item.magnitude) / max) * MAX_SWATCH);
      const elbowY = BAND_BOTTOM + 14;
      const leaderPath = `M ${sourceX} ${BAND_BOTTOM} L ${sourceX} ${elbowY} Q ${sourceX} ${rowY} ${LIST_X} ${rowY}`;
      return {
        ...item,
        rowY,
        swatchWidth,
        leaderPath,
        label:
          item.kind === 'transfer'
            ? `${item.direction === 'out' ? '→' : '←'} ${item.name}`
            : item.name,
      };
    });
  });

  protected readonly sceneHeight = computed(
    () => LIST_START_Y + this.items().length * ROW_HEIGHT + 20,
  );
}
