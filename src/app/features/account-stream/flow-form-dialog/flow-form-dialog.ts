import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { Flow } from '../../../core/models/flow';
import { FlowForm } from '../flow-form/flow-form';

export interface FlowFormDialogData {
  accountId: string;
  /** Set to edit an existing Flow instead of creating a new one. */
  flow?: Flow;
}

/** `'deleted'` distinguishes a confirmed delete from the saved Flow a normal submit closes with. */
export type FlowFormDialogResult = Flow | 'deleted';

/** Opens `FlowForm` as a modal, per the CDK Dialog pattern `AssignFlowDialog` established — closes with the saved Flow, `'deleted'`, or no result on cancel. */
@Component({
  selector: 'app-flow-form-dialog',
  imports: [FlowForm],
  templateUrl: './flow-form-dialog.html',
  styleUrl: './flow-form-dialog.css',
})
export class FlowFormDialog {
  private readonly dialogRef = inject(DialogRef<FlowFormDialogResult>);
  protected readonly data = inject<FlowFormDialogData>(DIALOG_DATA);

  protected onSaved(flow: Flow): void {
    this.dialogRef.close(flow);
  }

  protected onCancelled(): void {
    this.dialogRef.close();
  }

  protected onDeleted(): void {
    this.dialogRef.close('deleted');
  }
}
