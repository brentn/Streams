import { Component, HostListener, input, isDevMode, output } from '@angular/core';

export interface PrototypeVariant {
  key: string;
  label: string;
}

/** PROTOTYPE infrastructure (per the /prototype skill's UI-variant convention) — not part of any variant's design, just the tool for flipping between them. Hidden outside dev mode. */
@Component({
  selector: 'app-prototype-switcher',
  templateUrl: './prototype-switcher.html',
  styleUrl: './prototype-switcher.css',
})
export class PrototypeSwitcher {
  readonly variants = input.required<PrototypeVariant[]>();
  readonly current = input.required<string>();
  readonly variantChanged = output<string>();

  protected readonly isDevMode = isDevMode();

  protected currentVariant(): PrototypeVariant {
    return this.variants().find((v) => v.key === this.current()) ?? this.variants()[0];
  }

  protected cycle(delta: number): void {
    const variants = this.variants();
    const index = variants.findIndex((v) => v.key === this.current());
    const next = (index + delta + variants.length) % variants.length;
    this.variantChanged.emit(variants[next].key);
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    if (event.key === 'ArrowLeft') this.cycle(-1);
    if (event.key === 'ArrowRight') this.cycle(1);
  }
}
