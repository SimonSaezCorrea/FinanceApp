import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { MetadataService, type MetadataStatement } from "@simplewebauthn/server";
import { verifyMDSBlob } from "@simplewebauthn/server/helpers";

import {
  compromisedStatusOf,
  type AuthenticatorCatalog as Catalog,
  type AuthenticatorModelProps,
  type StatusReport,
} from "../../authenticator-model/domain/authenticator-model";
import {
  AUTHENTICATOR_MODEL_REPOSITORY,
  type AuthenticatorModelRepositoryPort,
} from "../../authenticator-model/domain/ports/authenticator-model.repository.port";

/** The FIDO Alliance Metadata Service (MDS3) endpoint: one signed JWT with every model. */
export const FIDO_MDS_URL = "https://mds3.fidoalliance.org/";
const DOWNLOAD_TIMEOUT_MS = 30_000;

export type CatalogRefreshOutcome =
  | { replaced: true; number: number; models: number }
  | { replaced: false; reason: "not-newer" | "skipped" };

/** One entry of the verified catalog, as `verifyMDSBlob` returns it (only the fields used). */
interface CatalogEntry {
  aaguid?: string;
  metadataStatement?: MetadataStatement;
  statusReports?: StatusReport[];
}

/**
 * The FIDO catalog for this app (specs/041 research R1/R2/R8/R9). The signed catalog is downloaded
 * and verified with the WebAuthn library's own `verifyMDSBlob`, stored in `authenticator-model`
 * (shared by every container, survives deploys), and loaded from there into the library's
 * `MetadataService` — with no network, in "permissive" mode — so a registration's attestation
 * chain is checked against the makers' roots. Nothing here ever blocks a registration: without a
 * catalog the library simply has no statement and the passkey stays unverified.
 */
@Injectable()
export class AuthenticatorCatalog implements OnModuleInit {
  private readonly logger = new Logger(AuthenticatorCatalog.name);
  /** The catalog number loaded into `MetadataService` (-1 = nothing loaded yet). */
  private loadedNumber = -1;

  constructor(
    @Inject(AUTHENTICATOR_MODEL_REPOSITORY)
    private readonly models: AuthenticatorModelRepositoryPort,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.load();
    } catch (err) {
      this.logger.error(`Could not load the FIDO catalog: ${String(err)}`);
    }
  }

  /** Loads the stored catalog into the library (no network). */
  async load(): Promise<void> {
    const current = await this.models.currentCatalog();
    const statements = (await this.models.statements()) as MetadataStatement[];
    await MetadataService.initialize({
      statements,
      mdsServers: [],
      verificationMode: "permissive",
    });
    this.loadedNumber = current?.number ?? 0;
  }

  /** Reloads when another container (or the daily refresh) stored a newer catalog. */
  async ensureLoaded(): Promise<void> {
    const current = await this.models.currentCatalog();
    if ((current?.number ?? 0) !== this.loadedNumber) await this.load();
  }

  /** The model's name for an AAGUID, if the catalog has it. */
  async modelName(aaguid: string | null): Promise<string | null> {
    if (!aaguid) return null;
    return (await this.models.findByAaguid(aaguid))?.description ?? null;
  }

  /** The catalog's compromise status for an AAGUID, or null. */
  async compromisedStatus(aaguid: string): Promise<string | null> {
    return (await this.models.findByAaguid(aaguid))?.compromisedStatus ?? null;
  }

  /**
   * Downloads, verifies and stores the catalog when it is newer than the stored one, then loads
   * it. `onlyIfEmpty` (boot) skips the download when a catalog is already stored. Throws on a
   * download or signature failure: the stored copy stays as it was.
   */
  async refresh(opts: { onlyIfEmpty?: boolean } = {}): Promise<CatalogRefreshOutcome> {
    if (opts.onlyIfEmpty && (await this.models.currentCatalog())) {
      return { replaced: false, reason: "skipped" };
    }
    const blob = await this.download();
    const { payload, parsedNextUpdate } = await this.verify(blob);
    const catalog: Catalog = {
      number: payload.no,
      nextUpdate: parsedNextUpdate,
      models: toModels(payload.entries as CatalogEntry[]),
    };
    const replaced = await this.models.replaceAll(catalog);
    await this.load();
    return replaced
      ? { replaced: true, number: catalog.number, models: catalog.models.length }
      : { replaced: false, reason: "not-newer" };
  }

  /** Downloads the signed catalog (protected: tests replace it). */
  protected async download(): Promise<string> {
    const res = await fetch(FIDO_MDS_URL, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`FIDO catalog download failed: HTTP ${res.status}`);
    return res.text();
  }

  /** Verifies its signature chain up to the FIDO root (protected: tests replace it). */
  protected verify(blob: string): Promise<{
    payload: { no: number; entries: unknown[] };
    parsedNextUpdate: Date;
  }> {
    return verifyMDSBlob(blob);
  }
}

/** Entries with an AAGUID (FIDO2 authenticators) and a statement, with their compromise status. */
export function toModels(entries: readonly CatalogEntry[]): AuthenticatorModelProps[] {
  const out: AuthenticatorModelProps[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const aaguid = entry.aaguid?.toLowerCase();
    if (!aaguid || !entry.metadataStatement || seen.has(aaguid)) continue;
    seen.add(aaguid);
    const compromised = compromisedStatusOf(entry.statusReports ?? []);
    out.push({
      aaguid,
      description: entry.metadataStatement.description ?? aaguid,
      statement: entry.metadataStatement,
      compromisedStatus: compromised?.status ?? null,
      statusDate: compromised?.date ?? null,
    });
  }
  return out;
}
