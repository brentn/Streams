import { Component, HostListener, computed, input, isDevMode, output } from '@angular/core';

export interface PrototypeVariant {
  key: string;
  label: string;
}

/**
 * PROTOTYPE — floating bottom-bar switcher for A/B/C UI variants living on the same route,
 * driven by the host page's `?variant=` query param. Not meant to survive past whichever
 * prototype it's currently wired into; `isDevMode()` keeps it out of production builds
 * regardless.
 */
@Component({
  selector: 'app-prototype-switcher',
  templateUrl: './prototype-switcher.html',
  styleUrl: './prototype-switcher.css',
})
export class PrototypeSwitcher {
  readonly variants = input.required<PrototypeVariant[]>();
  readonly current = input.required<string>();
  readonly variantChange = output<string>();

  protected readonly isDev = isDevMode();

  protected readonly currentIndex = computed(() =>
    Math.max(
      0,
      this.variants().findIndex((v) => v.key === this.current()),
    ),
  );

  protected readonly currentVariant = computed(() => this.variants()[this.currentIndex()]);

  protected cycle(delta: number): void {
    const variants = this.variants();
    const next = (this.currentIndex() + delta + variants.length) % variants.length;
    this.variantChange.emit(variants[next].key);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.matches('input, textarea, [contenteditable]') || target.isContentEditable)) {
      return;
    }
    if (event.key === 'ArrowLeft') this.cycle(-1);
    if (event.key === 'ArrowRight') this.cycle(1);
  }
}
