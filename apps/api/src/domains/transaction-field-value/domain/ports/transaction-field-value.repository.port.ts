import type { customFields } from "@finance/contracts";

export const TRANSACTION_FIELD_VALUE_REPOSITORY = Symbol("TRANSACTION_FIELD_VALUE_REPOSITORY");

export type FieldValue = customFields.CustomFieldValue;
export type FieldType = customFields.CustomFieldType;

/** One value to write: which movement, which field (and its type, which decides the
 * column), and the value — already validated by the `CustomField` aggregate. */
export interface FieldValueWrite {
  transactionId: string;
  customFieldId: string;
  type: FieldType;
  value: FieldValue;
}

/** What a movement holds for one field, and whether "Transferir pendientes" set it. */
export interface StoredFieldValue {
  value: FieldValue;
  coveredByTransferGroupId: string | null;
}

/** A filter predicate on one field's values. */
export type FieldValuePredicate =
  | { kind: "equals"; type: FieldType; value: FieldValue }
  | { kind: "contains"; text: string }
  | { kind: "range"; type: "NUMBER" | "DATE"; min?: string; max?: string }
  | { kind: "any" };

/**
 * Domain-owned port over the `transaction-field-value` table (specs/036). The table
 * belongs to no rule of its own: every value written here was validated by the
 * `CustomField` aggregate first. "No value" is the absence of a row; any write made
 * by hand clears a row's cover reference.
 */
export interface TransactionFieldValueRepositoryPort {
  /** Values of these movements, by movement then field. One query per page. */
  listForTransactions(
    userId: string,
    transactionIds: string[],
  ): Promise<Map<string, Record<string, FieldValue>>>;
  /** How many movements hold a value, per field. */
  countByField(userId: string): Promise<Map<string, number>>;
  /** The options of a list field some movement holds. */
  usedOptionIds(userId: string, customFieldId: string): Promise<Set<string>>;
  /** Ids of the movements whose value of this field matches. */
  idsMatching(
    userId: string,
    customFieldId: string,
    predicate: FieldValuePredicate,
  ): Promise<string[]>;
  /** What these movements hold for one field (missing = no value). */
  valuesFor(
    userId: string,
    customFieldId: string,
    transactionIds: string[],
    tx?: unknown,
  ): Promise<Map<string, StoredFieldValue>>;
  /** Writes values (insert or replace), clearing any cover reference. */
  upsertManyWithTx(tx: unknown, userId: string, writes: FieldValueWrite[]): Promise<void>;
  /** Gives many movements the same value of one field at once (a bulk assignment, a
   * default applied to existing movements), clearing any cover reference. */
  setManyWithTx(
    tx: unknown,
    userId: string,
    field: { id: string; type: FieldType },
    transactionIds: string[],
    value: FieldValue,
  ): Promise<void>;
  /** Takes these movements' value of one field away ("no value"). */
  deleteManyWithTx(
    tx: unknown,
    userId: string,
    customFieldId: string,
    transactionIds: string[],
  ): Promise<void>;
  /** "Deshacer" of a bulk assignment: restores each movement's previous value only
   * where it still holds `applied` — one edited since is kept. */
  revertIfUnchangedWithTx(
    tx: unknown,
    userId: string,
    field: { id: string; type: FieldType },
    applied: FieldValue | null,
    restore: { transactionId: string; value: FieldValue | null }[],
  ): Promise<{ restored: number; kept: number }>;
  /** Locks the existing rows of these movements for one field (`FOR UPDATE`), for
   * "Transferir pendientes"; returns what they hold. */
  lockForCoverWithTx(
    tx: unknown,
    userId: string,
    customFieldId: string,
    transactionIds: string[],
  ): Promise<Map<string, StoredFieldValue>>;
  /** Writes the covered value with its transfer and what each one held before. A
   * concurrent insert of the same row fails the transaction (unique key). */
  coverWithTx(
    tx: unknown,
    userId: string,
    field: { id: string; type: FieldType },
    value: FieldValue,
    transferGroupId: string,
    entries: { transactionId: string; previous: FieldValue | null; existed: boolean }[],
  ): Promise<void>;
  /** The covering transfers are being deleted: every row they still cover gets its
   * previous value back (or loses its row when it had none). Returns how many. */
  revertCoverWithTx(tx: unknown, userId: string, transferGroupIds: string[]): Promise<number>;
  /** Movements a transfer still covers. */
  coveredCount(userId: string, transferGroupId: string): Promise<number>;
}
