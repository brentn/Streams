import { Injectable } from '@angular/core';

/** Isolates the Blob/anchor download dance so callers stay unit-testable without touching the DOM. */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  download(filename: string, content: string, mimeType: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
