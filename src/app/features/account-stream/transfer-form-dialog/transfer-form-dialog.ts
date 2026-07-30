import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { Account } from '../../../core/models/account';
import { Transfer } from '../../../core/models/transfer';
import { TransferForm } from '../transfer-form/transfer-form';

export interface TransferFormDialogData {
  accountId: string;
  accounts: Account[];
}

/** Opens `TransferForm` as a modal, per the CDK Dialog pattern `AssignFlowDialog` established — closes with the saved Transfer, or no result on cancel. */
@Component({
  selector: 'app-transfer-form-dialog',
  imports: [TransferForm],
  templateUrl: './transfer-form-dialog.html',
  styleUrl: './transfer-form-dialog.css',
})
export class TransferFormDialog {
  private readonly dialogRef = inject(DialogRef<Transfer>);
  protected readonly data = inject<TransferFormDialogData>(DIALOG_DATA);

  protected onSaved(transfer: Transfer): void {
    this.dialogRef.close(transfer);
  }

  protected onCancelled(): void {
    this.dialogRef.close();
  }
}
