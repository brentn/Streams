// Dev-only fixture seeder for Streams — ticket 01 of the streams-ux-design wayfinder map,
// extended by ticket 05 with a second (credit card) account.
// Not part of the app; paste into the browser console after loading the app once
// (so the `streams` IndexedDB database has been created), then reload.
//
// Usage:
//   1. npm start, open http://localhost:4200, let it redirect to /connect.
//   2. Open devtools console, paste this whole file, press enter.
//   3. Reload the page — home now redirects to /accounts/<seeded-id>.
//
// `expectedSign` on each fixture account is a PROTOTYPE stand-in for the real
// domain-model field decided in ticket 06 (Account.expectedSign: 1 | -1) —
// not yet added to the actual Account model/schema (that's implementation
// work for later), just present on these plain fixture objects so prototype
// code can read it via `(account).expectedSign`.

(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('streams', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  const checking = {
    id: 'fixture-checking',
    name: 'Everyday Checking',
    institutionName: 'Fixture Credit Union',
    balance: 2415.32,
    balanceDate: today,
    expectedSign: 1,
  };

  const creditCard = {
    id: 'fixture-credit-card',
    name: 'Rewards Visa',
    institutionName: 'Fixture Credit Union',
    balance: -643.18, // owed — negative because expectedSign is -1 (liability)
    balanceDate: today,
    expectedSign: -1,
  };

  // ~120 days of plausible activity: biweekly paychecks, recurring bills,
  // and scattered day-to-day spending, working backward from `balance`.
  const checkingTransactions = [];
  let checkingCursor = 0;
  for (let day = 1; day <= 120; day++) {
    const date = daysAgo(day);

    if (day % 14 === 0) {
      checkingTransactions.push(mkTxn(checking.id, () => ++checkingCursor, date, 1850.0, 'Paycheck — Acme Corp'));
    }
    if (date.getDate() === 1) {
      checkingTransactions.push(mkTxn(checking.id, () => ++checkingCursor, date, -1200.0, 'Rent'));
    }
    if (day % 30 === 3) {
      checkingTransactions.push(mkTxn(checking.id, () => ++checkingCursor, date, -85.4, 'Electric & Gas Co.'));
    }
    if (day % 7 === 0) {
      checkingTransactions.push(mkTxn(checking.id, () => ++checkingCursor, date, -62.17, 'Groceries — Market St.'));
    }
    if (day % 5 === 0) {
      checkingTransactions.push(
        mkTxn(checking.id, () => ++checkingCursor, date, -14.5 - (day % 3) * 3.2, 'Coffee / lunch'),
      );
    }
    if (day % 21 === 0) {
      checkingTransactions.push(mkTxn(checking.id, () => ++checkingCursor, date, -45.0, 'Streaming & subscriptions'));
    }
  }

  // Credit card: recurring spend plus a monthly statement payment (from
  // checking, but modeled here only as a balance-reducing transaction on the
  // card) that doesn't fully clear the balance most months — a typical
  // revolving-balance pattern, not paid to zero.
  const creditCardTransactions = [];
  let creditCardCursor = 0;
  for (let day = 1; day <= 120; day++) {
    const date = daysAgo(day);

    if (day % 30 === 8) {
      creditCardTransactions.push(
        mkTxn(creditCard.id, () => ++creditCardCursor, date, 400.0, 'Payment — thank you'),
      );
    }
    if (day % 9 === 0) {
      creditCardTransactions.push(
        mkTxn(creditCard.id, () => ++creditCardCursor, date, -78.9, 'Online shopping'),
      );
    }
    if (day % 11 === 0) {
      creditCardTransactions.push(
        mkTxn(creditCard.id, () => ++creditCardCursor, date, -32.4, 'Restaurant'),
      );
    }
    if (day % 30 === 15) {
      creditCardTransactions.push(
        mkTxn(creditCard.id, () => ++creditCardCursor, date, -110.0, 'Gas & tolls'),
      );
    }
  }

  function mkTxn(accountId, nextCursor, date, amount, description) {
    return {
      id: `fixture-txn-${accountId}-${nextCursor()}`,
      accountId,
      date,
      amount,
      description,
    };
  }

  const accounts = [checking, creditCard];
  const transactions = [...checkingTransactions, ...creditCardTransactions];

  const tx = db.transaction(['accounts', 'transactions'], 'readwrite');
  for (const a of accounts) tx.objectStore('accounts').put(a);
  for (const t of transactions) tx.objectStore('transactions').put(t);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  console.log(
    `Seeded ${accounts.length} accounts (${accounts.map((a) => a.id).join(', ')}) and ${transactions.length} transactions. Reload the page.`,
  );
})();
