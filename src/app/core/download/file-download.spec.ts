import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileDownloadService } from './file-download';

describe('FileDownloadService', () => {
  let service: FileDownloadService;
  let anchor: HTMLAnchorElement;
  let clickSpy: ReturnType<typeof vi.fn>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new FileDownloadService();
    anchor = document.createElement('a');
    clickSpy = vi.fn();
    anchor.click = clickSpy as unknown as () => void;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a Blob of the given content and MIME type, and clicks a download anchor for it', () => {
    service.download('backup.json', '{"a":1}', 'application/json');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(blob.size).toBe('{"a":1}'.length);

    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('backup.json');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL after triggering the download', () => {
    service.download('backup.json', '{}', 'application/json');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
