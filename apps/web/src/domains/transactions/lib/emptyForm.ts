import type { TransactionFormValue } from "../components/TransactionFormPanel";

/** A blank form dated `date` (`YYYY-MM-DD`). */
export const emptyTransactionForm = (date: string): TransactionFormValue => ({
  mode: "EXPENSE",
  amount: "",
  currency: "CLP",
  bankAccountId: "",
  toBankAccountId: "",
  amountIn: "",
  amountInEdited: false,
  prepayFromAccountId: "",
  cardId: "",
  financeCharge: false,
  categoryId: "",
  recurringExpenseId: "",
  description: "",
  observation: "",
  emisor: "",
  receptor: "",
  lugar: "",
  date,
  customFields: null,
});
