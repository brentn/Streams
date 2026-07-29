import { Component } from '@angular/core';

/** Shared "!" glyph for `StatusBanner` and `SyncBadge` — one icon for every status severity, distinguished by the caller's `currentColor`. */
@Component({
  selector: 'app-alert-icon',
  template: `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1.5" />
      <line x1="10" y1="6" x2="10" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <circle cx="10" cy="14" r="1" fill="currentColor" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class AlertIcon {}
