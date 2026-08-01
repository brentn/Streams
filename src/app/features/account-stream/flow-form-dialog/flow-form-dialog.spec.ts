import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { RecurringFlow } from '../../../core/models/flow';
import { FlowFormDialog, FlowFormDialogData } from './flow-form-dialog';

const newFlow: RecurringFlow = {
  id: 'flow-1',
  accountId: 'acc-1',
  name: 'Paycheck',
  direction: 'in',
  kind: 'recurring',
  amount: 2000,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

describe('FlowFormDialog', () => {
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function createComponent(data: FlowFormDialogData) {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [FlowFormDialog],
      providers: [
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(FlowFormDialog).componentInstance;
  }

  it('closes with the saved Flow', () => {
    const component = createComponent({ accountId: 'acc-1' });

    component['onSaved'](newFlow);

    expect(dialogRef.close).toHaveBeenCalledWith(newFlow);
  });

  it('closes with no result on cancel', () => {
    const component = createComponent({ accountId: 'acc-1' });

    component['onCancelled']();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it("closes with 'deleted' on delete", () => {
    const component = createComponent({ accountId: 'acc-1', flow: newFlow });

    component['onDeleted']();

    expect(dialogRef.close).toHaveBeenCalledWith('deleted');
  });

  it('passes the given Flow through for edit mode', () => {
    const component = createComponent({ accountId: 'acc-1', flow: newFlow });

    expect(component['data'].flow).toBe(newFlow);
  });
});
