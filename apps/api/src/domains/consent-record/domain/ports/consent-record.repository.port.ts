import type {
  ConsentRecordProps,
  ConsentType,
  GuardianAuthorizationPlan,
} from "../consent-record.entity";

export const CONSENT_RECORD_REPOSITORY = Symbol("CONSENT_RECORD_REPOSITORY");

/** Port for the `consent-record` table only (Adapter, Constitution VI). Named operations, not
 * generic CRUD: a consent is always addressed through the user it belongs to. */
export interface ConsentRecordRepositoryPort {
  /** Records a freshly granted consent inside the caller's transaction (e.g. registration).
   * `guardian` is only meaningful (and only ever passed) for a `MINOR_GUARDIAN_AUTHORIZATION`
   * row — omitted for every other type. */
  createWithTx(
    tx: unknown,
    userId: string,
    type: ConsentType,
    policyVersion: string,
    guardian?: GuardianAuthorizationPlan,
  ): Promise<void>;
  /** Every consent this user has ever granted, most recent first — what a "mis consentimientos"
   * screen reads. */
  listByUser(userId: string): Promise<ConsentRecordProps[]>;
}
