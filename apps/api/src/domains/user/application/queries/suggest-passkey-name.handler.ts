import { Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { AuthenticatorCatalog } from "../authenticator-catalog";
import { PasskeyAttestation } from "../passkey-attestation";
import { SuggestPasskeyNameQuery } from "./suggest-passkey-name.query";

/**
 * Prefills the name of a passkey being registered with its model (specs/041 research R7). It reads
 * the AAGUID the authenticator CLAIMS, unverified: only a suggestion the person edits. What is
 * stored as the model is decided by the registration's verification.
 */
@Injectable()
@QueryHandler(SuggestPasskeyNameQuery)
export class SuggestPasskeyNameHandler extends BaseQueryHandler<
  SuggestPasskeyNameQuery,
  auth.PasskeyRegistrationSuggestionResponse,
  null
> {
  constructor(
    private readonly attestation: PasskeyAttestation,
    private readonly catalog: AuthenticatorCatalog,
  ) {
    super();
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    query: SuggestPasskeyNameQuery,
  ): Promise<auth.PasskeyRegistrationSuggestionResponse> {
    const aaguid = this.attestation.aaguidOf(query.response);
    return { suggestedName: await this.catalog.modelName(aaguid) };
  }
}
