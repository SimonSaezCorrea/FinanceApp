import type { ConsentRecordProps, ConsentType } from "../consent-record.entity";

export const CONSENT_RECORD_REPOSITORY = Symbol("CONSENT_RECORD_REPOSITORY");

/** Port for the `consent-record` table only (Adapter, Constitution VI). Named operations, not
 * generic CRUD: a consent is always addressed through the user it belongs to. */
export interface ConsentRecordRepositoryPort {
  /** Records a freshly granted consent inside the caller's transaction (e.g. registration). */
  createWithTx(
    tx: unknown,
    userId: string,
    type: ConsentType,
    policyVersion: string,
  ): Promise<void>;
  /** Every consent this user has ever granted, most recent first — what a "mis consentimientos"
   * screen reads. */
  listByUser(userId: string): Promise<ConsentRecordProps[]>;
}
