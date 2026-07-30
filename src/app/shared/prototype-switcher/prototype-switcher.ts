// PROTOTYPE infrastructure — reusable across prototype tickets, but only ever
// mounted from throwaway prototype code. Hidden outside dev builds.
import { Component, HostListener, input, isDevMode, output } from '@angular/core';

export interface PrototypeVariant {
  key: string;
  label: string;
}

@Component({
  selector: 'app-prototype-switcher',
  templateUrl: './prototype-switcher.html',
  styleUrl: './prototype-switcher.css',
})
export class PrototypeSwitcher {
  readonly variants = input.required<PrototypeVariant[]>();
  readonly current = input.required<string>();
  readonly changed = output<string>();

  protected readonly isDev = isDevMode();

  protected currentIndex(): number {
    const index = this.variants().findIndex((v) => v.key === this.current());
    return index === -1 ? 0 : index;
  }

  protected currentVariant(): PrototypeVariant | undefined {
    return this.variants()[this.currentIndex()];
  }

  protected cycle(delta: number): void {
    const list = this.variants();
    const next = (this.currentIndex() + delta + list.length) % list.length;
    this.changed.emit(list[next].key);
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
