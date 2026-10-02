# Graph Report - FinanceApp  (2026-10-02)

## Corpus Check
- Large corpus: 1449 files · ~844,839 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 7838 nodes · 25064 edges · 248 communities (201 shown, 47 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 795 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Template Import Handlers
- Account Deletion Scope
- Account Create/Edit UI
- Account Cards UI
- Web Providers & Account Tests
- Accounts API Client
- Account Commands & Queries
- Controllers & Route Params
- Cards API & Skeletons
- Currency Usage Ports
- Handler Contexts A
- Card Account Data Module
- Add Card Handler
- BankAccount Aggregate A
- App Layout & Nav
- Prisma Repositories
- Installments Web
- Passkey Domain
- Remove Account Handler
- Plan Schedule & Credit Math
- Data Modules
- Debts Web
- App Module & Error Filter
- Session Domain
- Spec 016 Row IDs
- MFA Recovery Codes
- Auth Contracts
- Handler Contexts B
- Transaction Cursor
- Card Limits
- Category Policy
- Card Entity & Sync Tests
- Prisma BankAccount Repo
- Recurring Web
- Contract Tests
- Idempotency Errors
- Spec 027 Import Template
- Import Errors & Debt Props
- Dashboard Page
- Spec 022 Passkeys
- CLAUDE.md Architecture Concepts
- Payment Carry-Over Math
- Template Sheet Reader
- Spec 026 IPinfo Geolocation
- Account Command Classes
- Installment Domain Errors
- Auth Controller
- Import Column Mapping
- Handler Logging Interceptors
- Consent Records
- Transaction Query Handlers
- Template Plan Types
- Login & Register Forms
- Spec 002/003 Design & Accounts Docs
- Institutions Domain
- Accounts Contract Types
- Credit Statement States
- Root package.json
- Installment Plan Repository
- Passkey & Step-Up Handlers
- Savings Controller & Queries
- Overlay Surfaces
- Wallet Visual Cards
- Spec 007 Cards Model
- Card Limit Repositories
- Transaction Filters UI
- Installments Controller & Commands
- Transaction Contract Types
- Countries Domain
- Currencies Domain
- Transactions Controller & Commands
- Debts Controller & Commands
- Web package.json
- Wallet Item Removal
- User Repository
- Landing Vignettes
- Profile Spec Docs
- Wallet Planning
- API Dependencies
- Account Deletion Log
- Recurring Update Handler
- Contracts package.json
- Passkey Rename Spec 025
- Attachments Controller & Commands
- Attachment Errors
- Template Import Panel
- Installment Pay & Billing Docs
- Security Handlers (Password/MFA)
- Categories Domain
- Wallet Controller & Commands
- Schedule Preview
- Installment Contract Types
- Web Dependencies
- API Dev Dependencies
- Cron & Domain Modules
- Add Wallet Item
- API tsconfig
- Import & Recurring Contracts
- Spec Kit Skills
- Compliance Docs (Ley 21.719)
- Credit Statements Controller
- IP Cache Purge
- Attachment Handlers & Storage
- Reference Contract Types
- Money package.json
- Recurring Errors
- Spec 014 Installment Billing
- Installment Payment Repository
- Web Dev Dependencies
- Idempotency & Wallet Contracts
- Spec 007 Research
- CQRS Architecture Patterns
- Spec 010 Transfers & Attachments
- Idempotency Cleanup Cron
- Recurring Queries
- Anchored Panels & Combobox
- Spec 015 Idempotency
- Spec 016 Row IDs Docs
- Recurring Controller
- Attachment Aggregate
- Template Cell Types
- Contracts tsconfig.build
- Controller Facade & Events
- Test Setup Utilities
- Business Days & Holidays
- Create Recurring Handler
- S3 Storage Adapter
- Wallet Query Handlers
- CQRS Test Fakes
- Date Field
- Money tsconfig.build
- Spec 005 Transactions UI
- Accounts Contract Rules
- turbo.json
- Seed Scripts
- Country-Currency Data
- Import Controller
- MFA & Recurring Repos
- tsconfig.base
- Billing Eligibility Strategy
- Recurring Repository
- Attachment Modules
- HTTP Error Helpers
- Spec 011 Prepaid Account
- API Scripts
- GeoIP Config
- Session Repository
- Transaction Writer Repository
- Replace Wallet
- Date Range Picker
- Specify PowerShell Scripts
- Spec 019 Prepayment
- Spec 020 Financial Settings
- Compliance Privacy Policy
- GeoIP Lookup & Cache
- Recurring Currency Usage
- Projected Balance
- Design System Docs
- Debt & Installment Cards
- Transfer Contracts
- Country Lookup
- Country Identifier Types
- Attachment Files
- Import Row Resolution
- Spreadsheet Reader
- Account Number Validation
- Attachment Contracts
- Spec 006 Debts
- Spec 014 Checklists
- MFA Docs
- Savings Currency Usage
- Transaction Currency Usage
- Balance After
- Spec 010 Panels
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- Community 179
- Community 180
- Community 181
- Community 182
- Community 183
- Community 184
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Community 198
- Community 199
- Community 200
- Community 201
- Community 202
- Community 203
- Community 204
- Community 205
- Community 206
- Community 207
- Community 208
- Community 209
- Community 210
- Community 211
- Community 212
- Community 213
- Community 214
- Community 215
- Community 216
- Community 217
- Community 218
- Community 219
- Community 220
- Community 221
- Community 222
- Community 223
- Community 224
- Community 225
- Community 226
- Community 227
- Community 228
- Community 229
- Community 230
- Community 231
- Community 232
- Community 233
- Community 235
- Community 236
- Community 237
- Community 238
- Community 239
- Community 240
- Community 241
- Community 242

## God Nodes (most connected - your core abstractions)
1. `@nestjs/common` - 274 edges
2. `PrismaService` - 270 edges
3. `cn()` - 215 edges
4. `react-i18next` - 175 edges
5. `HandleResult` - 162 edges
6. `UserScopedCommand` - 155 edges
7. `@nestjs/cqrs` - 150 edges
8. `BaseCommandHandler` - 129 edges
9. `Button()` - 127 edges
10. `formatMoney()` - 126 edges

## Surprising Connections (you probably didn't know these)
- `Token model 002` --semantically_similar_to--> `CSS-variable design tokens`  [INFERRED] [semantically similar]
  specs/002-frontend-design-system/data-model.md → docs/english/DESIGN_SYSTEM.md
- `Keep memory in sync rule` --semantically_similar_to--> `SDD end-to-end orchestrator skill`  [INFERRED] [semantically similar]
  CLAUDE.md → .claude/skills/sdd/SKILL.md
- `Throwaway CI secrets (JWT, CURSOR_SIGNING, MFA, PASSKEY)` --conceptually_related_to--> `Caso B: brecha de seguridad (rotar secretos, notificar Agencia)`  [INFERRED]
  .github/workflows/ci.yml → .compliance/INSTRUCTIVO.md
- `hasBillable()` --calls--> `toMoney()`  [EXTRACTED]
  apps/api/src/domains/installment-plan/domain/installment-billing.ts → packages/money/src/index.ts
- `money()` --calls--> `formatMoney()`  [EXTRACTED]
  apps/web/src/domains/accounts/components/BillingSection.test.tsx → packages/money/src/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Money-moving idempotent writes** — claude_idempotency, claude_transaction, claude_debt, claude_savings, claude_installment_plan, claude_import [EXTRACTED 1.00]
- **Spec Kit lifecycle skills** — _claude_skills_sdd_skill, _claude_skills_speckit_constitution_skill, _claude_skills_speckit_clarify_skill, _claude_skills_speckit_checklist_skill, _claude_skills_speckit_analyze_skill, _claude_skills_speckit_implement_skill [EXTRACTED 1.00]
- **Credit pool and billing cluster** — claude_bank_account, claude_card_account, claude_billing_settings, claude_credit_statement, claude_installment_plan [EXTRACTED 1.00]
- **Spec Kit SDD command pipeline (specify -> plan -> tasks -> taskstoissues)** — _claude_skills_speckit_specify_skill, _claude_skills_speckit_plan_skill, _claude_skills_speckit_tasks_skill, _claude_skills_speckit_taskstoissues_skill [INFERRED 0.95]
- **Ley 21.719 compliance document pack** — _compliance_docs_21719_rat, _compliance_docs_21719_eipd, _compliance_docs_21719_consentimiento, _compliance_docs_21719_canal_derechos, _compliance_docs_21719_dpa, _compliance_docs_21719_anexo_transferencias, _compliance_docs_21719_plan_respuesta_brechas, _compliance_docs_21719_politica_privacidad, _compliance_docs_21719_registro_vulneraciones, _compliance_resumen_ley_21719 [EXTRACTED 1.00]
- **Ley 21.595 Modelo de Prevención de Delitos pack** — _compliance_docs_21595_modelo_prevencion_delitos, _compliance_docs_21595_acta_encargado_prevencion, _compliance_docs_21595_codigo_etica, _compliance_docs_21595_matriz_riesgos, _compliance_docs_21595_reglamento_canal_denuncias, _compliance_resumen_ley_21595 [EXTRACTED 1.00]
- **Constitution data principles (isolation, one adapter, idempotency, identifiers)** — specify_memory_constitution_isolation_principle, specify_memory_constitution_one_adapter_principle, specify_memory_constitution_idempotency_principle, specify_memory_constitution_identifiers_principle [EXTRACTED 1.00]
- **MVP scope decisions** — docs_mvp_chile_only, docs_mvp_three_currencies, docs_mvp_investments_last [EXTRACTED 1.00]
- **Credit pool model (account pool, primary card, card limits, statements)** — docs_english_banking_logic_bankaccount, docs_english_banking_logic_primary_card_credit_pool, docs_english_banking_logic_card_limit, docs_english_banking_logic_credit_used_persisted, docs_english_banking_logic_credit_statement [EXTRACTED 0.95]
- **Monorepo components (api, web, contracts, money)** — docs_spanish_architecture_apps_api, docs_spanish_architecture_apps_web, docs_spanish_architecture_packages_contracts, docs_spanish_architecture_packages_money [EXTRACTED 0.95]
- **Design system theming (tokens, provider, primitives)** — docs_english_design_system_tokens, docs_english_design_system_theme_provider, docs_english_design_system_ui_primitives, docs_english_design_system_brand_vs_primary [EXTRACTED 0.90]
- **Accounts and Cards spec-driven feature chain (003 to 004)** — specs_003_accounts_management_spec, specs_003_accounts_management_plan, specs_004_account_cards_modal_spec, specs_004_account_cards_modal_plan [INFERRED 0.75]
- **Debt installment payment flow** — specs_006_debts_installments_view_contracts_api_contracts_register_payment_endpoint, specs_006_debts_installments_view_tasks_debtsservice_registerpayment, specs_006_debts_installments_view_data_model_debt_auto_settle, specs_006_debts_installments_view_tasks_usedebtmutations, specs_006_debts_installments_view_tasks_debtcard [INFERRED 0.85]
- **Secondary card shared credit pool model** — specs_007_accounts_movements_redesign_research_secondary_card_self_relation, specs_007_accounts_movements_redesign_research_derived_used_seed, specs_007_accounts_movements_redesign_spec_shared_credit_pool_sublimit, specs_007_accounts_movements_redesign_research_sum_expenses_by_card_groupby, specs_007_accounts_movements_redesign_research_card_error_codes [INFERRED 0.85]
- **Transactions view composition** — specs_005_transactions_redesign_tasks_transactionsroute, specs_005_transactions_redesign_tasks_transactionkpistrip, specs_005_transactions_redesign_tasks_transactionfiltersbar, specs_005_transactions_redesign_tasks_transactiontable [EXTRACTED 1.00]
- **Design patterns in the DDD+CQRS migration** — specs_009_ddd_cqrs_architecture_contracts_layer_contracts_basecommandhandler, specs_009_ddd_cqrs_architecture_contracts_layer_contracts_repository_adapter_pattern, specs_009_ddd_cqrs_architecture_contracts_layer_contracts_controller_facade, specs_009_ddd_cqrs_architecture_contracts_layer_contracts_domain_event_observer, specs_009_ddd_cqrs_architecture_contracts_layer_contracts_state_interface, specs_009_ddd_cqrs_architecture_contracts_layer_contracts_strategy_interface, specs_009_ddd_cqrs_architecture_spec_decorator_interceptor [EXTRACTED 1.00]
- **Profile endpoints extending auth domain** — specs_008_user_profile_contracts_auth_profile_patch_auth_me, specs_008_user_profile_contracts_auth_profile_post_auth_me_password, specs_008_user_profile_contracts_auth_profile_patch_auth_me_preferences, specs_008_user_profile_contracts_auth_profile_post_auth_me_deactivate [EXTRACTED 1.00]
- **Attachment upload/storage flow** — specs_010_movement_transfers_attachments_research_transaction_attachment_domain, specs_010_movement_transfers_attachments_research_objectstorageport, specs_010_movement_transfers_attachments_data_model_attachmentpolicy, specs_010_movement_transfers_attachments_research_magic_bytes_validation, specs_010_movement_transfers_attachments_research_s3_object_storage, specs_010_movement_transfers_attachments_research_delete_object_after_tx, specs_010_movement_transfers_attachments_research_attachments_unavailable [INFERRED 0.85]
- **Reglas de la cuenta prepago (tipo, matriz, saldo no negativo)** — specs_011_prepaid_account_product_contracts_accounts_accounttype_prepaid, specs_011_prepaid_account_product_contracts_accounts_allowed_card_kinds, specs_011_prepaid_account_product_research_d4_never_negative_rule, specs_011_prepaid_account_product_research_movementpolicy, specs_011_prepaid_account_product_research_transferpolicy, specs_011_prepaid_account_product_contracts_accounts_prepaid_insufficient_balance [INFERRED 0.85]
- **Pago atómico de cuota: gasto + saldo + cuota + arrastre** — specs_013_installments_redesign_research_r3_atomic_pay_unpay, specs_013_installments_redesign_data_model_carriedoveramount, specs_013_installments_redesign_data_model_paidamount, specs_013_installments_redesign_data_model_transactionid, specs_013_installments_redesign_contracts_installments_payinstallmentschema, specs_013_installments_redesign_research_paycreditstatementhandler [INFERRED 0.85]
- **Mecanismo de arrastre de faltante reutilizado** — specs_013_installments_redesign_data_model_carriedoveramount, specs_013_installments_redesign_research_creditstatement_carriedoveramount, specs_013_installments_redesign_research_r1_carryover_column, specs_013_installments_redesign_spec_carry_over_requirements [INFERRED 0.85]
- **Credit-card instalment billing lifecycle (purchase, stamp at close, settle on pay)** — specs_014_installment_credit_billing_data_model_plan_purchase_movement, specs_014_installment_credit_billing_research_stampstatementwithtx, specs_014_installment_credit_billing_tasks_installment_billing_selection, specs_014_installment_credit_billing_research_settle_on_payment, specs_014_installment_credit_billing_data_model_installmentpayment_creditstatementid [EXTRACTED 1.00]
- **Idempotency mechanism components (record, port, base handler, header, key hook)** — specs_015_idempotent_money_writes_data_model_idempotencyrecord, specs_015_idempotent_money_writes_data_model_idempotencyrecordrepositoryport, specs_015_idempotent_money_writes_plan_baseidempotentcommandhandler, specs_015_idempotent_money_writes_contracts_idempotency_idempotency_key_header, specs_015_idempotent_money_writes_research_useidempotencykey, specs_015_idempotent_money_writes_research_two_phase_protocol [EXTRACTED 1.00]
- **Unified row-id generation and edge validation** — specs_016_unified_row_ids_data_model_uuid_v7_row_identifier, specs_016_unified_row_ids_data_model_rowid_schema, specs_016_unified_row_ids_data_model_generate_row_id, specs_016_unified_row_ids_research_zod_pipes_meta_mapping, specs_016_unified_row_ids_data_model_invalid_id_format [EXTRACTED 1.00]
- **Identifier/opacity conformance-debt closures (specs 016-017)** — specs_016_unified_row_ids_contracts_id_validation_rowid, specs_016_unified_row_ids_tasks_generaterowid, specs_017_opaque_identifiers_research_signed_cursor, specs_017_opaque_identifiers_research_opaque_storage_key, specs_016_unified_row_ids_tasks_constitution_principle_viii [INFERRED 0.85]
- **Transaction provenance via sourceOf() cases** — specs_018_savings_redesign_contracts_savings_sourceof_savings, specs_019_credit_card_prepayment_data_model_credit_card_prepayment_source, specs_018_savings_redesign_data_model_transaction_savings_fks, specs_019_credit_card_prepayment_data_model_transaction_prepayment_fields [INFERRED 0.85]
- **Idempotent money writes with row locks** — specs_018_savings_redesign_research_baseidempotentcommandhandler, specs_018_savings_redesign_research_idempotent_savings_operations, specs_019_credit_card_prepayment_plan_prepayopenperiodhandler, specs_018_savings_redesign_research_findoneforupdatewithtx_pattern, specs_019_credit_card_prepayment_data_model_findbyidforupdatewithtx, specs_018_savings_redesign_plan_constitution_principle_vii [INFERRED 0.85]
- **Flujo de prepago de período abierto** — specs_019_credit_card_prepayment_research_prepayopenperiodhandler, specs_019_credit_card_prepayment_research_changeprepayment, specs_019_credit_card_prepayment_research_prepaidamount, specs_019_credit_card_prepayment_research_prepaymentstatementid, specs_019_credit_card_prepayment_research_findbyidforupdatewithtx [EXTRACTED 1.00]
- **Handshake de login con MFA** — specs_021_mfa_totp_research_mfa_pending_token, specs_021_mfa_totp_contracts_mfa_verify_endpoint, specs_021_mfa_totp_research_rate_limit_lockout, specs_021_mfa_totp_research_recovery_codes, specs_021_mfa_totp_research_aes_gcm_secret [INFERRED 0.85]
- **Universo de monedas acotado por perfil** — specs_020_profile_financial_settings_data_model_extracurrencies, specs_020_profile_financial_settings_data_model_currencyusagelookupport, specs_020_profile_financial_settings_data_model_updatepreferenceshandler, specs_020_profile_financial_settings_research_useallowedcurrencies, specs_020_profile_financial_settings_data_model_currency_in_use [INFERRED 0.85]
- **Session revocation mechanism (sid + guard + Session row + withTx close)** — specs_023_real_sessions_research_sid_claim, specs_023_real_sessions_research_jwtauthguard_session_check, specs_023_real_sessions_data_model_session, specs_024_revoke_sessions_on_change_data_model_closeallexceptforuserwithtx, specs_023_real_sessions_contracts_session_endpoints_session_endpoints [INFERRED 0.85]
- **Passkey login ceremony** — specs_022_passkey_login_tasks_startpasskeyloginhandler, specs_022_passkey_login_tasks_verifypasskeyloginhandler, specs_022_passkey_login_research_passkey_challenge_cookie, specs_022_passkey_login_research_simplewebauthn_server, specs_022_passkey_login_research_anti_enumeration [EXTRACTED 1.00]
- **IPinfo geolocation resolution flow (cache -> IPinfo -> MaxMind)** — specs_026_ipinfo_geolocation_data_model_geoiplookup, specs_026_ipinfo_geolocation_data_model_ipgeolocationcacherepositoryport, specs_026_ipinfo_geolocation_research_ipinfo_lite, specs_026_ipinfo_geolocation_research_maxmind_geolite2, specs_026_ipinfo_geolocation_data_model_plancacheentry [EXTRACTED 1.00]
- **Template import all-or-nothing commit flow** — specs_027_import_template_research_importtemplatehandler, specs_027_import_template_research_plantemplateimport, specs_027_import_template_research_movementpolicy, specs_027_import_template_data_model_adjustopeningwithtx, specs_027_import_template_research_findorcreateopenforaccountwithtx, specs_027_import_template_data_model_createwithtx_ports [EXTRACTED 1.00]
- **Passkey rename flow** — specs_025_passkey_management_contracts_readme_patch_auth_me_passkeys_id, specs_025_passkey_management_data_model_renamepasskeyrequestschema, specs_025_passkey_management_data_model_renamepasskeyhandler, specs_025_passkey_management_data_model_renameowned [EXTRACTED 1.00]
- **Template import pipeline (build, read, resolve, preview, apply)** — specs_027_import_template_tasks_buildtemplate, specs_027_import_template_tasks_readtemplate, specs_027_import_template_tasks_resolvetemplate, specs_027_import_template_contracts_import_template_preview_endpoint, specs_027_import_template_tasks_plantemplateimport, specs_027_import_template_tasks_importtemplatehandler [INFERRED 0.85]
- **Foreign-currency statement transfer and undo flow** — specs_028_multi_currency_billing_research_r6_transfer, specs_028_multi_currency_billing_contracts_api_post_transfer, specs_028_multi_currency_billing_tasks_transferstatementhandler, specs_028_multi_currency_billing_data_model_transferred_state, specs_028_multi_currency_billing_data_model_currency_transfer_category, specs_028_multi_currency_billing_data_model_transferreversal, specs_028_multi_currency_billing_tasks_undotransferstatementhandler [INFERRED 0.85]

## Communities (248 total, 47 thin omitted)

### Template Import Handlers - "Template Import Handlers"
Cohesion: 0.02
Nodes (69): TemplateGoalWrite, CreateSavingsEntryHandler, Context, RemoveSavingsEntryHandler, Context, MONEY_FIELDS, UpdateSavingsEntryHandler, GetSavingsEntryQueryHandler (+61 more)

### Account Deletion Scope - "Account Deletion Scope"
Cohesion: 0.02
Nodes (54): AccountDeletionPorts, AccountDeletionScope, AccountDelta, DeletionGroup, deletionImpactDto(), loadAccountDeletionScope(), AccountDeletionScopeLoader, netByAccount() (+46 more)

### Account Create/Edit UI - "Account Create/Edit UI"
Cohesion: 0.04
Nodes (141): AccountCreateModal(), reset(), submit(), AccountEditPanel(), leave(), requestClose(), AccountForm(), AccountFormValues (+133 more)

### Account Cards UI - "Account Cards UI"
Cohesion: 0.04
Nodes (121): AccountCard(), creditUsage(), CARD_INACTIVE_STYLE, isCreditType(), Props, CategoryDonut(), PALETTE, MonthFlowCard() (+113 more)

### Web Providers & Account Tests - "Web Providers & Account Tests"
Cohesion: 0.03
Nodes (108): NO_RETRY_STATUS, Providers(), queryClient, account, card, me, renderTile(), useAuth() (+100 more)

### Accounts API Client - "Accounts API Client"
Cohesion: 0.03
Nodes (97): accountsApi, renderModal(), renderModal(), me, renderForm(), account, money(), renderSection() (+89 more)

### Account Commands & Queries - "Account Commands & Queries"
Cohesion: 0.03
Nodes (43): AddCardCommand, SyncStatementCommand, ListDebtsQuery, CreateRecurringExpenseCommand, RemoveRecurringExpenseCommand, GetSavingsEntryQuery, RemoveSavingsGoalCommand, SESSION_CLOSED_RETENTION_DAYS (+35 more)

### Controllers & Route Params - "Controllers & Route Params"
Cohesion: 0.04
Nodes (55): AccountIdParams, CardParams, PrepayOpenPeriodCommand, StatementParams, statementParamsSchema, UndoDebtPaymentCommand, DebtIdParams, debtIdParamsSchema (+47 more)

### Cards API & Skeletons - "Cards API & Skeletons"
Cohesion: 0.05
Nodes (93): cardsApi, AccountDetailSkeleton(), KpiSkeleton(), AccountsSkeleton(), CardSkeleton(), GroupSkeleton(), BillingEmptyMessage(), BillingSection() (+85 more)

### Currency Usage Ports - "Currency Usage Ports"
Cohesion: 0.04
Nodes (39): BANK_ACCOUNT_CURRENCY_USAGE, CurrencyUsageLookupPort, DEBT_CURRENCY_USAGE, INSTALLMENT_PLAN_CURRENCY_USAGE, MFA_RECOVERY_CODE_REPOSITORY, MfaRecoveryCodeRepositoryPort, SAVINGS_ENTRY_CURRENCY_USAGE, ConfirmMfaEnrollmentHandler (+31 more)

### Handler Contexts A - "Handler Contexts A"
Cohesion: 0.03
Nodes (38): CardProps, AccountNotFoundError, CategoryDataModule, GenerateAllDueStatementsCommand, closeIfDue(), FAR_FUTURE, GenerateAllDueStatementsHandler, GenerateStatementsHandler (+30 more)

### Card Account Data Module - "Card Account Data Module"
Cohesion: 0.03
Nodes (38): CardAccountDataModule, CARD_ACCOUNT_REPOSITORY, CardAccountRepositoryPort, CardLimitDataModule, CATEGORY_LOOKUP, CategoryLookupPort, Context, ImportTransactionsHandler (+30 more)

### Add Card Handler - "Add Card Handler"
Cohesion: 0.04
Nodes (31): AddCardHandler, Context, Context, CreateAccountHandler, RemoveCardHandler, SetAccountStatusHandler, UpdateAccountHandler, Context (+23 more)

### BankAccount Aggregate A - "BankAccount Aggregate A"
Cohesion: 0.02
Nodes (22): BankAccount, CardPlan, Context, Context, Context, Context, CreditStatement, PrismaCreditStatementRepository (+14 more)

### App Layout & Nav - "App Layout & Nav"
Cohesion: 0.05
Nodes (82): AppLayout(), NAV, NavLinks(), readCollapsed(), UserAvatar(), DocumentTitle(), renderAt(), HomeRoute() (+74 more)

### Prisma Repositories - "Prisma Repositories"
Cohesion: 0.06
Nodes (31): Row, PrismaCardLimitRepository, GenerateStatementsCommand, PayCreditStatementCommand, PrismaIdempotencyRecordRepository, PayInstallmentCommand, SavingsEntryProps, EXCLUDE_PLAN_PURCHASES (+23 more)

### Installments Web - "Installments Web"
Cohesion: 0.04
Nodes (84): installmentsApi, DeletePlanConfirm(), Props, Figure(), FigureProps, InstallmentDetailPanel(), InstallmentDetailPanelProps, creditPlan() (+76 more)

### Passkey Domain - "Passkey Domain"
Cohesion: 0.04
Nodes (22): PasskeyPlan, PasskeyProps, PASSKEY_REPOSITORY, PasskeyRepositoryPort, PrismaPasskeyRepository, rowToProps(), ConfirmPasskeyRegistrationHandler, RemovePasskeyHandler (+14 more)

### Remove Account Handler - "Remove Account Handler"
Cohesion: 0.04
Nodes (38): RemoveAccountHandler, BankAccountProps, CardInput, CardLimitProps, isNonZero(), AccountCannotHaveCardError, AccountNumberRequiredError, AccountTypeChangeNotAllowedError (+30 more)

### Plan Schedule & Credit Math - "Plan Schedule & Credit Math"
Cohesion: 0.05
Nodes (18): foldPlanScheduleIntoRealChain(), computeSeries(), Context, ImportTemplateHandler, TEMPLATE_IMPORT_TX_TIMEOUT_MS, PreviewTemplateQueryHandler, planTemplateImport(), TemplatePlanResult (+10 more)

### Data Modules - "Data Modules"
Cohesion: 0.04
Nodes (27): CountryDataModule, MfaRecoveryCodeDataModule, PasskeyDataModule, LoginHandler, LogoutHandler, RefreshTokenCommand, RefreshTokenHandler, parseDeviceLabel() (+19 more)

### Debts Web - "Debts Web"
Cohesion: 0.06
Nodes (61): debtsApi, DebtDeleteConfirm(), Props, DebtDetailPanel(), DebtDetailPanelProps, STATUS_BADGE, DebtEmptyRow(), debtFormFrom() (+53 more)

### App Module & Error Filter - "App Module & Error Filter"
Cohesion: 0.16
Nodes (17): AppModule, AllExceptionsFilter, rut(), register(), register(), bootstrap(), PDF, PNG (+9 more)

### Session Domain - "Session Domain"
Cohesion: 0.04
Nodes (18): SESSION_REPOSITORY, SessionRepositoryPort, SESSION_STEP_UP, SessionStepUpPort, SessionPlan, SessionProps, rowToProps(), SessionDataModule (+10 more)

### Spec 016 Row IDs - "Spec 016 Row IDs"
Cohesion: 0.05
Nodes (75): 016 Spec Quality Checklist, Contract: Row-Identifier Validation (016), Business identifiers (institution code, CBU, RUT-/PSP-/AGF- keys) out of scope, INVALID_ID_FORMAT error (400), rowId zod schema (UUID v7), Tasks: Unified Row Identifiers (016), BankAccountLookupPort.accountOwned, Body-supplied FK ownership verification (US4) (+67 more)

### MFA Recovery Codes - "MFA Recovery Codes"
Cohesion: 0.04
Nodes (14): Context, Context, Context, Context, Context, StartMfaEnrollmentHandler, UpdatePreferencesHandler, UpdateProfileHandler (+6 more)

### Auth Contracts - "Auth Contracts"
Cohesion: 0.03
Nodes (66): calculateAgeFromBirthDate(), ChangePasswordRequest, changePasswordRequestSchema, ConfirmMfaEnrollmentRequest, confirmMfaEnrollmentRequestSchema, ConfirmMfaEnrollmentResponse, confirmMfaEnrollmentResponseSchema, ConfirmPasskeyRegistrationRequest (+58 more)

### Handler Contexts B - "Handler Contexts B"
Cohesion: 0.06
Nodes (16): Context, excludeInternalFlows(), LegDelta, TransactionPage, TransactionPageRequest, TransactionRepositoryPort, TransactionSummaryResult, TransferLegPatch (+8 more)

### Transaction Cursor - "Transaction Cursor"
Cohesion: 0.05
Nodes (38): decodeCursor(), encodeCursor(), sign(), BalanceCeilingExceededError, CardLimitExceededError, CardNotAllowedError, CardRequiredError, CardSubLimitExceededError (+30 more)

### Card Limits - "Card Limits"
Cohesion: 0.07
Nodes (29): currentCycleStart(), CARD_LIMIT_REPOSITORY, CardLimitRepositoryPort, INSTALLMENT_PAYMENT_LOOKUP, InstallmentPaymentLookupPort, loadAccountContext(), billingCurrencyOf(), Context (+21 more)

### Category Policy - "Category Policy"
Cohesion: 0.07
Nodes (30): assertSelectableCategory(), CategoryNotAllowedError, CategoryNotFoundError, DomainError, CreateTransferCommand, Context, CreateTransferHandler, loadTransferAccounts() (+22 more)

### Card Entity & Sync Tests - "Card Entity & Sync Tests"
Cohesion: 0.08
Nodes (37): CardProps, setup(), prisma, setup(), account, accounts, PAY, prisma (+29 more)

### Prisma BankAccount Repo - "Prisma BankAccount Repo"
Cohesion: 0.05
Nodes (14): PrismaBankAccountRepository, Row, BillingSettingsDataModule, BillingSettingsProps, DEFAULT_BILLING_SETTINGS, BILLING_SETTINGS_REPOSITORY, BillingSettingsRepositoryPort, PrismaBillingSettingsRepository (+6 more)

### Recurring Web - "Recurring Web"
Cohesion: 0.07
Nodes (46): recurringApi, RecurringAutoGenerationStrip(), Props, RecurringDetailPanel(), Stat(), RecurringEmptyRow(), emptyRecurringForm(), recurringFormFrom() (+38 more)

### Contract Tests - "Contract Tests"
Cohesion: 0.04
Nodes (57): ALL_KINDS, ALL_TYPES, VALID_PAIRS, after, base, before, ACCOUNT_NUMBER_REQUIRED_TYPES, AccountDeletionImpact (+49 more)

### Idempotency Errors - "Idempotency Errors"
Cohesion: 0.06
Nodes (22): IdempotencyInProgressError, IdempotencyKeyRequiredError, IdempotencyKeyReusedError, IdempotencyRecordCorruptError, IdempotencyRecord, IdempotencyRecordProps, IdempotencyStatus, PlannedIdempotencyRecord (+14 more)

### Spec 027 Import Template - "Spec 027 Import Template"
Cohesion: 0.06
Nodes (41): 027 Spec quality checklist, Contract: importación por plantilla (027), POST /import/template (idempotent, all-or-nothing), POST /import/template/preview (writes nothing), Template file format (Instrucciones, 9 data sheets, Referencia, _cuadra), BankAccountRepositoryPort.adjustOpeningWithTx, buildTemplate (exceljs, browser-generated .xlsx), 027 Tasks: Plantilla oficial de importación (+33 more)

### Import Errors & Debt Props - "Import Errors & Debt Props"
Cohesion: 0.06
Nodes (38): DebtProps, DomainError, ImportRowRejectedError, TEMPLATE_CODES, TemplateRowRejectedError, ImportCard, planImport(), PlannedImportRow (+30 more)

### Dashboard Page - "Dashboard Page"
Cohesion: 0.08
Nodes (40): DashboardPage(), AccountsSummary(), debtsInPrimary(), inPrimary(), GroupByMenu(), Props, accountAssets(), AccountGroup (+32 more)

### Spec 022 Passkeys - "Spec 022 Passkeys"
Cohesion: 0.05
Nodes (42): Checklist 022 requirements, Contracts 022: passkey endpoints, /auth/me/passkeys* and /auth/login/passkey-* endpoints, Plan 022: Passkey login, Passkey entity (credentialId, publicKey, counter, transports), Quickstart 022: passkeys, Research 022: passkeys, Anti-clone signature counter (+34 more)

### CLAUDE.md Architecture Concepts - "CLAUDE.md Architecture Concepts"
Cohesion: 0.07
Nodes (42): SDD end-to-end orchestrator skill, speckit-agent-context-update skill, speckit-analyze skill, speckit-checklist skill, speckit-clarify skill, speckit-constitution skill, speckit-implement skill, apps/api (NestJS 11 backend) (+34 more)

### Payment Carry-Over Math - "Payment Carry-Over Math"
Cohesion: 0.07
Nodes (16): Context, Context, applyCarryOver(), CarryablePayment, CarryDelta, CarryOverResult, laterUnpaid(), maxMoney() (+8 more)

### Template Sheet Reader - "Template Sheet Reader"
Cohesion: 0.07
Nodes (35): Props, add(), buildTemplate(), columnLetter(), LIST_ORDER, quoted(), RangeValidations, REFERENCE_HEADERS (+27 more)

### Spec 026 IPinfo Geolocation - "Spec 026 IPinfo Geolocation"
Cohesion: 0.07
Nodes (42): Requirements checklist (026), Contracts: IPinfo geolocation (026), Data Model: IPinfo geolocation cache (026), GeoIpLookup (rewritten internally), getIpinfoToken (ipinfo.config.ts), IpGeolocationCache model (table ip-geolocation-cache), IpGeolocationCacheDataModule (leaf), IpGeolocationCachePurgeCron (EVERY_DAY_AT_5AM) (+34 more)

### Account Command Classes - "Account Command Classes"
Cohesion: 0.08
Nodes (11): CreateAccountCommand, RemoveAccountCommand, RemoveCardCommand, SetAccountStatusCommand, UpdateAccountCommand, UpdateCardCommand, GetAccountDeletionImpactQuery, ListAccountsQuery (+3 more)

### Installment Domain Errors - "Installment Domain Errors"
Cohesion: 0.08
Nodes (23): DomainError, InstallmentCardIsCreditError, InstallmentPaymentAccountRequiredError, InstallmentPaymentAlreadyPaidError, InstallmentPaymentFromCreditAccountError, InstallmentPaymentNotFoundError, InstallmentPlanBilledError, InstallmentPlanScheduleLockedError (+15 more)

### Auth Controller - "Auth Controller"
Cohesion: 0.18
Nodes (4): AuthController, parseDurationMs(), AuthUser, getPasskeyChallengeSecret()

### Import Column Mapping - "Import Column Mapping"
Cohesion: 0.09
Nodes (44): cellLabel(), columnLetter(), ImportMovementsPanel(), close(), loadFile(), openSheet(), renderCell(), reset() (+36 more)

### Handler Logging Interceptors - "Handler Logging Interceptors"
Cohesion: 0.05
Nodes (37): decimal.js, eslint, @finance/config, @finance/contracts, @finance/money, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser (+29 more)

### Consent Records - "Consent Records"
Cohesion: 0.07
Nodes (19): ConsentRecordDataModule, ConsentRecordProps, ConsentType, GuardianAuthorizationPlan, GuardianRelationship, CONSENT_RECORD_REPOSITORY, ConsentRecordRepositoryPort, PrismaConsentRecordRepository (+11 more)

### Transaction Query Handlers - "Transaction Query Handlers"
Cohesion: 0.08
Nodes (13): CREDIT_STATEMENT_LOOKUP, CreditStatementLookupPort, GetTransactionQueryHandler, ListTransactionsQueryHandler, SummarizeTransactionsQueryHandler, SummarizeTransactionsQuery, EXCLUDE_TRANSFERS, toListFilter() (+5 more)

### Template Plan Types - "Template Plan Types"
Cohesion: 0.05
Nodes (42): BalanceMode, balanceModeSchema, currency, excelRow, positiveMoney, ref, TEMPLATE_IMPORT_MAX_ROWS, TEMPLATE_SHEET_KEYS (+34 more)

### Login & Register Forms - "Login & Register Forms"
Cohesion: 0.08
Nodes (33): Hero(), LoginForm(), onSubmit(), setStep(), LoginFormProps, LoginStep, fakeAssertion, fakeOptions (+25 more)

### Spec 002/003 Design & Accounts Docs - "Spec 002/003 Design & Accounts Docs"
Cohesion: 0.05
Nodes (37): Frontend Design System spec quality checklist, Component API Conventions (UI contract), shared/ui primitives (Button, Input, Field, Card, Badge, Table, PageHeader, states), ThemeProvider / useTheme contract, Accounts Management spec quality checklist, Accounts API contract, POST /accounts/:id/reconcile, Accounts Management data model (+29 more)

### Institutions Domain - "Institutions Domain"
Cohesion: 0.08
Nodes (12): ListInstitutionsQueryHandler, ListInstitutionsQuery, INSTITUTION_REPOSITORY, InstitutionRepositoryPort, FinancialInstitutionModule, PrismaInstitutionRepository, toContract(), InstitutionsController (+4 more)

### Accounts Contract Types - "Accounts Contract Types"
Cohesion: 0.06
Nodes (40): AccountFilters, AccountStatus, BankAccount, Card, CreateBankAccount, CreateCard, UpdateBankAccount, CurrentUser (+32 more)

### Credit Statement States - "Credit Statement States"
Cohesion: 0.07
Nodes (6): CreditStatementState, OpenState, PaidState, PartiallyPaidState, PendingState, TransferredState

### Root package.json - "Root package.json"
Cohesion: 0.05
Nodes (40): ignoreGhsas, devDependencies, prettier, turbo, typescript, typescript, name, brace-expansion (+32 more)

### Installment Plan Repository - "Installment Plan Repository"
Cohesion: 0.08
Nodes (7): INSTALLMENT_PAYMENT_REPOSITORY, InstallmentPaymentRepositoryPort, Context, CreateInstallmentPlanPlan, PrismaInstallmentPlanRepository, Row, rowToProps()

### Passkey & Step-Up Handlers - "Passkey & Step-Up Handlers"
Cohesion: 0.05
Nodes (7): StartPasskeyRegistrationHandler, StartStepUpPasskeyHandler, VerifyStepUpCommand, VerifyStepUpHandler, ListPasskeysQueryHandler, StepUpMethodNotAllowedError, setup()

### Savings Controller & Queries - "Savings Controller & Queries"
Cohesion: 0.12
Nodes (5): ListSavingsEntriesQuery, GetSavingsSummaryQuery, ListSavingsGoalsQuery, SavingsController, requireIdempotencyKey()

### Overlay Surfaces - "Overlay Surfaces"
Cohesion: 0.15
Nodes (24): minWidth(), ScreenName, SCREENS, Props, RecurringPauseModal(), DESKTOP_QUERY, useMediaQuery(), SurfaceChrome() (+16 more)

### Wallet Visual Cards - "Wallet Visual Cards"
Cohesion: 0.14
Nodes (28): AccountVisualCard(), balanceOf(), PickRow(), SlotButton(), WalletAddModal(), save(), dropAnimation, IconBtn() (+20 more)

### Spec 007 Cards Model - "Spec 007 Cards Model"
Cohesion: 0.07
Nodes (29): Banking Logic (accounts, cards, credit, transactions), ALLOWED_CARD_KINDS matrix (account type to card kind), BankAccount (where money or credit lives), CardLimit (per-currency sub-limit), CardAccount (payment instrument), Prepaid account (own product, never negative), How it works and how to run it, Language-agnostic error codes (+21 more)

### Card Limit Repositories - "Card Limit Repositories"
Cohesion: 0.08
Nodes (6): PrismaCardAccountRepository, CardLimitPlan, CardLimitProps, CARD_LIMIT_CURRENCY_USAGE, CurrencyUsageLookupPort, PrismaCardLimitCurrencyUsageLookupRepository

### Transaction Filters UI - "Transaction Filters UI"
Cohesion: 0.12
Nodes (22): DateRangeButtonProps, formatDateRangeLabel(), PillSelect(), TransactionFiltersBar(), TransactionFiltersBarProps, MiniStat(), monthLabel(), TransactionKpiStrip() (+14 more)

### Installments Controller & Commands - "Installments Controller & Commands"
Cohesion: 0.10
Nodes (5): RemoveInstallmentPlanCommand, UnpayInstallmentCommand, GetInstallmentPlanQuery, ListInstallmentPlansQuery, InstallmentsController

### Transaction Contract Types - "Transaction Contract Types"
Cohesion: 0.08
Nodes (27): CreateTransaction, createTransactionSchema, CreateTransfer, createTransferSchema, isTransfer(), sourceOf(), Transaction, TRANSACTION_PAGE_SIZE (+19 more)

### Countries Domain - "Countries Domain"
Cohesion: 0.10
Nodes (8): ListCountriesQueryHandler, ListCountriesQuery, CountryModule, COUNTRY_REPOSITORY, CountryRepositoryPort, PrismaCountryRepository, toContract(), CountriesController

### Currencies Domain - "Currencies Domain"
Cohesion: 0.11
Nodes (8): ListCurrenciesQueryHandler, ListCurrenciesQuery, CurrencyModule, CURRENCY_REPOSITORY, CurrencyRepositoryPort, PrismaCurrencyRepository, toContract(), CurrenciesController

### Transactions Controller & Commands - "Transactions Controller & Commands"
Cohesion: 0.11
Nodes (5): RemoveTransactionCommand, RemoveTransferCommand, GetTransactionQuery, GetTransferQuery, TransactionsController

### Debts Controller & Commands - "Debts Controller & Commands"
Cohesion: 0.13
Nodes (5): CreateDebtCommand, RegisterDebtPaymentCommand, RemoveDebtCommand, GetDebtQuery, DebtsController

### Web package.json - "Web package.json"
Cohesion: 0.07
Nodes (28): decimal.js, eslint, @finance/config, @finance/contracts, @finance/money, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser (+20 more)

### Wallet Item Removal - "Wallet Item Removal"
Cohesion: 0.12
Nodes (7): RemoveWalletItemHandler, WalletItemNotFoundError, WALLET_ITEM_REPOSITORY, WalletItemRepositoryPort, commandHandlers, queryHandlers, WalletItemDashboardModule

### User Repository - "User Repository"
Cohesion: 0.13
Nodes (13): decryptMfaSecret(), encryptMfaSecret(), IdentifierTakenError, PrismaUserRepository, rethrowUniqueViolation(), Row, rowToProps(), getMfaEncryptionKey() (+5 more)

### Landing Vignettes - "Landing Vignettes"
Cohesion: 0.14
Nodes (23): FEATURES, CalendarVignette(), CardsVignette(), CoinsVignette(), Tile(), WEEKDAYS, WEEKS, APP (+15 more)

### Profile Spec Docs - "Profile Spec Docs"
Cohesion: 0.12
Nodes (22): 008 Spec Quality Checklist, 008 Auth Profile Contracts, ACCOUNT_DISABLED error code, EMAIL_TAKEN error code, INVALID_CURRENT_PASSWORD error code, PATCH /auth/me (edit name/email), PATCH /auth/me/preferences, POST /auth/me/deactivate (+14 more)

### Wallet Planning - "Wallet Planning"
Cohesion: 0.11
Nodes (7): Context, Context, WalletItemInvalidError, PlannedWalletItem, WalletItem, WalletItemProps, rowToProps()

### API Dependencies - "API Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, bcryptjs, cookie-parser, date-holidays, decimal.js, @finance/contracts (+19 more)

### Account Deletion Log - "Account Deletion Log"
Cohesion: 0.12
Nodes (13): AccountDeletionLogDataModule, ACCOUNT_DELETION_LOG_REPOSITORY, AccountDeletionLogRepositoryPort, PrismaAccountDeletionLogRepository, DeleteAccountHandler, buildHandler(), fakeConfig(), fakeDeletionLog() (+5 more)

### Recurring Update Handler - "Recurring Update Handler"
Cohesion: 0.10
Nodes (4): UpdateRecurringExpenseCommand, UpdateRecurringExpenseHandler, nextDue(), RecurringExpense

### Contracts package.json - "Contracts package.json"
Cohesion: 0.07
Nodes (26): dependencies, @finance/money, zod, devDependencies, @finance/config, typescript, vitest, exports (+18 more)

### Passkey Rename Spec 025 - "Passkey Rename Spec 025"
Cohesion: 0.10
Nodes (23): Contracts: Revoke sessions on credential change (024), SessionRepositoryPort.closeAllExceptForUserWithTx, POST /auth/me/mfa/disable, POST /auth/me/password, POST /auth/sessions/revoke-others, Requirements checklist (025), Contracts: Passkey management (025), passkeyIdParamsSchema (+15 more)

### Attachments Controller & Commands - "Attachments Controller & Commands"
Cohesion: 0.11
Nodes (5): RemoveAttachmentCommand, UploadAttachmentCommand, GetAttachmentUrlQuery, ListAttachmentsQuery, AttachmentsController

### Attachment Errors - "Attachment Errors"
Cohesion: 0.13
Nodes (13): AttachmentPolicy, AttachmentUpload, MAGIC, storageKeyFor(), AttachmentDomainError, AttachmentsUnavailableError, AttachmentTooLargeError, AttachmentTransactionNotFoundError (+5 more)

### Template Import Panel - "Template Import Panel"
Cohesion: 0.13
Nodes (19): importApi, TemplateImportPanel(), changeMode(), close(), loadFile(), reset(), submit(), withModes() (+11 more)

### Installment Pay & Billing Docs - "Installment Pay & Billing Docs"
Cohesion: 0.13
Nodes (17): dueAmountOf(payment), Data Model: Vista Cuotas (013), InstallmentPayment.carriedOverAmount, TransactionWriterRepositoryPort.deleteWithTx, deletionImpact (movementCount, balanceRestorations), InstallmentPayment.paidAmount, Invariantes INV-C1..INV-C6 (paidAt !== null = pagada), Transiciones cuota: IMPAGA/PAGADA/PARCIALMENTE PAGADA (+9 more)

### Categories Domain - "Categories Domain"
Cohesion: 0.13
Nodes (6): ListCategoriesQueryHandler, ListCategoriesQuery, CategoryModule, CATEGORY_REPOSITORY, CategoryRepositoryPort, CategoriesController

### Wallet Controller & Commands - "Wallet Controller & Commands"
Cohesion: 0.11
Nodes (4): RemoveWalletItemCommand, ReorderWalletCommand, ListWalletQuery, WalletController

### Schedule Preview - "Schedule Preview"
Cohesion: 0.13
Nodes (18): Props, addPeriod(), schedulePreview, SchedulePreviewInput, base, currencyScale(), MONEY_SCALE, MoneyInput (+10 more)

### Installment Contract Types - "Installment Contract Types"
Cohesion: 0.10
Nodes (21): CreateInstallmentPlan, createInstallmentPlanSchema, DUE_SOON_DAYS, generatesMovementOnPay(), InstallmentDeletionImpact, installmentDeletionImpactSchema, InstallmentPayment, installmentPaymentSchema (+13 more)

### Web Dependencies - "Web Dependencies"
Cohesion: 0.09
Nodes (23): dependencies, clsx, decimal.js, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, exceljs, @finance/contracts (+15 more)

### API Dev Dependencies - "API Dev Dependencies"
Cohesion: 0.09
Nodes (22): devDependencies, dotenv, eslint, @finance/config, @nestjs/cli, @nestjs/testing, prisma, supertest (+14 more)

### Cron & Domain Modules - "Cron & Domain Modules"
Cohesion: 0.11
Nodes (7): CreditStatementModule, IdempotencyRecordModule, UserModule, BillingGenerationCron, CronModule, IpGeolocationCachePurgeCron, @nestjs/schedule

### Add Wallet Item - "Add Wallet Item"
Cohesion: 0.19
Nodes (6): AddWalletItemCommand, DomainError, WalletAccountNotFoundError, WalletCardNotFoundError, WalletFullError, WalletItemExistsError

### API tsconfig - "API tsconfig"
Cohesion: 0.09
Nodes (21): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+13 more)

### Import & Recurring Contracts - "Import & Recurring Contracts"
Cohesion: 0.10
Nodes (17): moneyString, IMPORT_MAX_ROWS, ImportResult, importResultSchema, ImportRow, importRowSchema, ImportTransactionsRequest, importTransactionsRequestSchema (+9 more)

### Spec Kit Skills - "Spec Kit Skills"
Cohesion: 0.11
Nodes (7): speckit-plan skill, speckit-specify skill, .specify/feature.json feature directory pointer, speckit-tasks skill, speckit-taskstoissues skill, Project Constitution (v2.3.12), Spec Kit full SDD workflow

### Compliance Docs (Ley 21.719) - "Compliance Docs (Ley 21.719)"
Cohesion: 0.14
Nodes (14): Acta de designación del Encargado de Prevención, Encargado de Prevención de Delitos (Simón Sáez), Código de Ética y Conducta, Conductas prohibidas (cohecho, lavado, delitos informáticos), Matriz de Riesgos de Delitos, Modelo de Prevención de Delitos (MPD), Reglamento del Canal de Denuncias, Canal de ejercicio de derechos (+6 more)

### Credit Statements Controller - "Credit Statements Controller"
Cohesion: 0.18
Nodes (3): UpdateStatementPaymentCommand, ListCreditStatementsQuery, CreditStatementsController

### IP Cache Purge - "IP Cache Purge"
Cohesion: 0.15
Nodes (4): PurgeExpiredCacheCommand, PurgeExpiredCacheHandler, IP_GEOLOCATION_CACHE_REPOSITORY, IpGeolocationCacheRepositoryPort

### Attachment Handlers & Storage - "Attachment Handlers & Storage"
Cohesion: 0.13
Nodes (4): RemoveAttachmentHandler, UploadAttachmentHandler, AttachmentRepositoryPort, ObjectStoragePort

### Reference Contract Types - "Reference Contract Types"
Cohesion: 0.10
Nodes (18): AccountType, BankCategory, Category, CategoryKind, categorySchema, Country, countrySchema, Currency (+10 more)

### Money package.json - "Money package.json"
Cohesion: 0.10
Nodes (20): dependencies, decimal.js, devDependencies, @finance/config, typescript, vitest, exports, decimal.js (+12 more)

### Recurring Errors - "Recurring Errors"
Cohesion: 0.21
Nodes (6): DomainError, RecurringEndBeforeStartError, RecurringExpenseNotFoundError, RECURRING_EXPENSE_REPOSITORY, RecurringExpensePatch, startOfTodayUTC()

### Spec 014 Installment Billing - "Spec 014 Installment Billing"
Cohesion: 0.15
Nodes (5): Contract 014: @finance/contracts installments changes, Data Model 014: installment credit billing, Plan 014: installment credit billing, Quickstart 014, Tasks 014

### Installment Payment Repository - "Installment Payment Repository"
Cohesion: 0.14
Nodes (3): InstallmentPaymentPlan, InstallmentPaymentRow, PrismaInstallmentPaymentRepository

### Web Dev Dependencies - "Web Dev Dependencies"
Cohesion: 0.11
Nodes (19): devDependencies, autoprefixer, eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @finance/config, jsdom, postcss (+11 more)

### Idempotency & Wallet Contracts - "Idempotency & Wallet Contracts"
Cohesion: 0.10
Nodes (17): IDEMPOTENCY_HEADER, IDEMPOTENCY_IN_FLIGHT_TIMEOUT_SECONDS, IDEMPOTENCY_RETENTION_HOURS, IdempotencyKey, idempotencyKeySchema, IDEMPOTENT_OPERATIONS, IdempotentOperation, CreateWalletItem (+9 more)

### Spec 007 Research - "Spec 007 Research"
Cohesion: 0.16
Nodes (14): Debt remaining amount formula, Checklist 007: Spec Quality, Contract delta 007: accounts, cardLimitSchema initialUsed + derived used, Contract delta 007: transactions, Data Model 007: Cuentas y Movimientos, Plan 007: Cuentas y Movimientos, Quickstart 007: Validación (+6 more)

### CQRS Architecture Patterns - "CQRS Architecture Patterns"
Cohesion: 0.18
Nodes (18): 009 Internal Layer Contracts, BaseCommand scope union (user | system), BaseCommandHandler (Template Method), Cross-aggregate persistence via prisma.$transaction + saveWithTx, Repository port + Prisma adapter (Adapter pattern), State interface (canClose/canPay/canCorrectAmount), Strategy interface (applies/evaluate), 009 DDD+CQRS Data Model (+10 more)

### Spec 010 Transfers & Attachments - "Spec 010 Transfers & Attachments"
Cohesion: 0.17
Nodes (12): 010 Transfers/Attachments Data Model, AttachmentPolicy, storageKey format (superseded by specs/017 opaque key), TransactionAttachment entity, TRANSFER_TO_CREDIT_ACCOUNT error, Transaction.transferGroupId, TransferPolicy, 010 Transfers/Attachments Research (+4 more)

### Idempotency Cleanup Cron - "Idempotency Cleanup Cron"
Cohesion: 0.14
Nodes (3): PurgeExpiredRecordsCommand, PurgeExpiredRecordsHandler, IdempotencyCleanupCron

### Recurring Queries - "Recurring Queries"
Cohesion: 0.16
Nodes (3): GetRecurringExpenseQuery, ListRecurringExpensesQueryHandler, ListRecurringExpensesQuery

### Anchored Panels & Combobox - "Anchored Panels & Combobox"
Cohesion: 0.14
Nodes (12): AnchoredPanelOptions, anchoredPanelRect(), establishesContainingBlock(), MAX_PANEL_HEIGHT, MIN_PANEL_HEIGHT, PanelRect, Combobox(), updatePosition() (+4 more)

### Spec 015 Idempotency - "Spec 015 Idempotency"
Cohesion: 0.19
Nodes (5): Contract 015: idempotency header, Plan 015: idempotent money writes, Quickstart 015, Research 015, Tasks 015

### Spec 016 Row IDs Docs - "Spec 016 Row IDs Docs"
Cohesion: 0.18
Nodes (5): Data Model 016: unified row ids, Plan 016: unified row ids, Quickstart 016, Research 016, Spec 016: Unified Row Identifiers

### Template Cell Types - "Template Cell Types"
Cohesion: 0.19
Nodes (16): referenceLists(), Cell, matchCategory(), normalize(), parseAmount(), Labelers, TemplateCellRow, TemplateSheetsRead (+8 more)

### Contracts tsconfig.build - "Contracts tsconfig.build"
Cohesion: 0.12
Nodes (16): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, ignoreDeprecations, lib, module, moduleResolution (+8 more)

### Controller Facade & Events - "Controller Facade & Events"
Cohesion: 0.15
Nodes (14): 009 Spec Quality Checklist, Controller as Facade, Domain event + EventsHandler listener (Observer), StatementClosed/StatementPaid/AccountDeactivated events, 009 DDD+CQRS Plan, 009 DDD+CQRS Quickstart, LogStatementPaidListener, test:unit / test:integration / test:e2e split (+6 more)

### Test Setup Utilities - "Test Setup Utilities"
Cohesion: 0.14
Nodes (10): DOMAINS_ROOT, FORBIDDEN_DOMAINS, listFilesRecursively(), dotenv, prisma, ROOT, RULES, SRC_EXT (+2 more)

### Business Days & Holidays - "Business Days & Holidays"
Cohesion: 0.23
Nodes (12): addBusinessDays(), chileHolidays, holidaySetsByYear, holidaysForYear(), isBusinessDay(), nextBoundaryAfter(), nextCalendarDayAfter(), paymentDueDate() (+4 more)

### Create Recurring Handler - "Create Recurring Handler"
Cohesion: 0.17
Nodes (4): Context, CreateRecurringExpenseHandler, RecurringExpenseRepositoryPort, PlannedRecurringExpense

### S3 Storage Adapter - "S3 Storage Adapter"
Cohesion: 0.20
Nodes (7): S3ObjectStorageAdapter, blankToUndefined(), readS3Config(), S3Config, s3ConfigSchema, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

### CQRS Test Fakes - "CQRS Test Fakes"
Cohesion: 0.13
Nodes (7): FakeCommand, FakeCommandHandler, FakeContext, FakeEvent, NoPersistHandler, SystemFakeCommand, SystemHandler

### Date Field - "Date Field"
Cohesion: 0.17
Nodes (12): DateField(), pick(), DateValue, monthGrid(), parse(), Props, sameDay(), Harness() (+4 more)

### Money tsconfig.build - "Money tsconfig.build"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, ignoreDeprecations, lib, module, moduleResolution (+7 more)

### Spec 005 Transactions UI - "Spec 005 Transactions UI"
Cohesion: 0.18
Nodes (13): Checklist 005: Spec Quality, UI Contract 005: Transactions View, TransactionKpiStrip UI contract, Spec 005: Transactions View Redesign, Default current-month date range, Segmented type filter (Todos/Ingresos/Gastos), Tasks 005: Transactions View Redesign, categoryIcon() (+5 more)

### Accounts Contract Rules - "Accounts Contract Rules"
Cohesion: 0.18
Nodes (14): Contrato accounts: cuenta prepago (011), ACCOUNT_NUMBER_REQUIRED_TYPES (+PREPAID), ACCOUNT_TYPE_CHANGE_NOT_ALLOWED, AccountType.PREPAID, ALLOWED_CARD_KINDS matrix (allowedCardKinds/isCardKindAllowed), CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT, createBankAccountSchema refinamientos prepago, INVALID_INITIAL_BALANCE (+6 more)

### turbo.json - "turbo.json"
Cohesion: 0.12
Nodes (15): dependsOn, outputs, cache, persistent, $schema, tasks, build, dev (+7 more)

### Seed Scripts - "Seed Scripts"
Cohesion: 0.20
Nodes (13): CATEGORY_CATALOGUE, dec(), DEMO_EMAILS, main(), prisma, SEED_CATEGORY_LABELS, seedCategories(), seedFullUser() (+5 more)

### Country-Currency Data - "Country-Currency Data"
Cohesion: 0.21
Nodes (5): CountryCurrencyDataModule, COUNTRY_CURRENCY_REPOSITORY, CountryCurrencyRepositoryPort, CountryCurrencyRow, PrismaCountryCurrencyRepository

### tsconfig.base - "tsconfig.base"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+6 more)

### Billing Eligibility Strategy - "Billing Eligibility Strategy"
Cohesion: 0.24
Nodes (6): BillingEligibilityStrategy, CreditLineEligibility, EligibilityCard, EligibilityContext, NoCreditLineEligibility, resolveBillingEligibility()

### Recurring Repository - "Recurring Repository"
Cohesion: 0.19
Nodes (3): RecurringExpenseProps, PrismaRecurringExpenseRepository, rowToProps()

### Attachment Modules - "Attachment Modules"
Cohesion: 0.16
Nodes (5): GetAttachmentUrlQueryHandler, ListAttachmentsQueryHandler, TransactionAttachmentDataModule, TransactionAttachmentModule, TransactionModule

### HTTP Error Helpers - "HTTP Error Helpers"
Cohesion: 0.21
Nodes (10): isDomainError(), statusToCode(), asPrismaError(), describeError(), describePrismaError(), firstLine(), needsStack(), PrismaError (+2 more)

### Spec 011 Prepaid Account - "Spec 011 Prepaid Account"
Cohesion: 0.22
Nodes (7): Data Model: Cuenta prepago (011), CardAccount.prepaidBalance/prepaidInitialBalance eliminados, Seed: cuenta 'Tenpo Prepago' con dos tarjetas, Plan: Cuenta prepago (011), Research: Cuenta prepago (011), MovementPolicy (assertWithinPrepaidBalance), TransferPolicy (pata de salida)

### API Scripts - "API Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, lint, prisma:generate, prisma:migrate, prisma:seed, start (+5 more)

### GeoIP Config - "GeoIP Config"
Cohesion: 0.19
Nodes (9): IP_GEOLOCATION_CACHE_TTL_DAYS, planCacheEntry(), GeoLocation, IpinfoFetchResult, LOOPBACK_IPS, NO_LOCATION, getGeoIpDbPath(), getIpinfoToken() (+1 more)

### Replace Wallet - "Replace Wallet"
Cohesion: 0.23
Nodes (4): ReplaceWalletCommand, ReplaceWalletHandler, handlerWith(), wallet

### Date Range Picker - "Date Range Picker"
Cohesion: 0.21
Nodes (10): buildMonthGrid(), DateRangeButton(), commit(), handleDayClick(), handleToday(), openWithFreshDraft(), fromIso(), monthStartFromIsoDate() (+2 more)

### Specify PowerShell Scripts - "Specify PowerShell Scripts"
Cohesion: 0.23
Nodes (9): Find-SpecifyRoot(), Format-SpecKitCommand(), Get-CurrentBranch(), Get-FeaturePathsEnv(), Get-InvokeSeparator(), Get-Python3Command(), Get-RepoRoot(), Resolve-TemplateContent() (+1 more)

### Spec 019 Prepayment - "Spec 019 Prepayment"
Cohesion: 0.18
Nodes (11): Checklist de calidad spec 019, Research: Prepago de tarjeta de crédito, sourceOf: CREDIT_CARD_PREPAYMENT, CreditStatement.prepaidAmount (acumulador), Modo de formulario PREPAY en TransactionFormPanel, Transaction.prepaymentStatementId / prepaymentAccountId, CreditStatement.totalFor (resta prepaidAmount), Spec 019: Prepago de tarjeta de crédito (período abierto) (+3 more)

### Spec 020 Financial Settings - "Spec 020 Financial Settings"
Cohesion: 0.17
Nodes (10): Contrato: PATCH /auth/me/preferences, Error CURRENCY_IN_USE (409), CurrencyUsageLookupPort (8 puertos isCurrencyInUse), Extracción de data leaves de debt y recurring-expense, User.extraCurrencies (regla: no quitar moneda en uso), Eliminación de monthlyBudgetTarget y billingCycleStartDay, UpdatePreferencesHandler (chequeo moneda en uso), Research 020: Personalización financiera (+2 more)

### Compliance Privacy Policy - "Compliance Privacy Policy"
Cohesion: 0.18
Nodes (5): Consentimiento y avisos en el punto de captura, Evaluación de Impacto en Protección de Datos (EIPD), Política de Privacidad (borrador, no publicada), Situación socioeconómica como dato sensible (Art. 2 letra g), Actividad 2: gestión financiera personal (dato sensible)

### Recurring Currency Usage - "Recurring Currency Usage"
Cohesion: 0.20
Nodes (6): CurrencyUsageLookupPort, RECURRING_EXPENSE_CURRENCY_USAGE, RecurringExpenseDataModule, commandHandlers, queryHandlers, RecurringExpenseModule

### Projected Balance - "Projected Balance"
Cohesion: 0.26
Nodes (10): AccountLike, cleanAmount(), delta(), drawsOnCredit(), projectedAfterSave(), projectedBalance(), ProjectedBalanceInput, Projection (+2 more)

### Design System Docs - "Design System Docs"
Cohesion: 0.21
Nodes (11): Design System (tokens, theming, primitives), ThemeProvider (dark/light/system), CSS-variable design tokens, shared/ui primitives (Button, Card, Table, Badge...), Sistema de diseno (version espanol), Token model 002, Plan 002: design system implementation plan, Quickstart 002 (+3 more)

### Debt & Installment Cards - "Debt & Installment Cards"
Cohesion: 0.24
Nodes (12): Payment status Pagada/Proxima/Pendiente, Tasks 006: Cuotas y Deudas, calcRemaining(), DebtCard component, DebtKpiStrip component, InstallmentPlanCard component, monthlyAmount(), nextDuePayment() (+4 more)

### Transfer Contracts - "Transfer Contracts"
Cohesion: 0.26
Nodes (10): Contrato Traspasos (spec 010), createTransferSchema, isTransfer / transferSide, TRANSFER_EDIT_AS_PAIR (409), /transactions/transfers endpoints, Errores TRANSFER_* (SAME_ACCOUNT, TO_CREDIT_ACCOUNT, ACCOUNT_NOT_FOUND, NOT_FOUND), Transaction.transferGroupId, transferSchema (outgoing/incoming) (+2 more)

### Country Lookup - "Country Lookup"
Cohesion: 0.27
Nodes (3): COUNTRY_LOOKUP, CountryLookupPort, PrismaCountryLookupRepository

### Country Identifier Types - "Country Identifier Types"
Cohesion: 0.27
Nodes (4): CountryIdentifierTypeDataModule, COUNTRY_IDENTIFIER_TYPE_REPOSITORY, CountryIdentifierTypeRepositoryPort, PrismaCountryIdentifierTypeRepository

### Attachment Files - "Attachment Files"
Cohesion: 0.44
Nodes (4): AttachmentProps, ATTACHMENT_REPOSITORY, OBJECT_STORAGE, Row

### Import Row Resolution - "Import Row Resolution"
Cohesion: 0.29
Nodes (9): CategoryCandidate, matchCard(), ParsedRow, ResolvedRow, ResolveOptions, resolveRows(), ResolveStats, base (+1 more)

### Spreadsheet Reader - "Spreadsheet Reader"
Cohesion: 0.25
Nodes (8): filledRowCount(), Matrix, readAsText(), readCsvText(), ReadError, readSpreadsheet(), SpreadsheetReadError, read-excel-file

### Account Number Validation - "Account Number Validation"
Cohesion: 0.31
Nodes (9): ACCOUNT_NUMBER_FORMATS, accountNumberFormat, CBU_FIRST_BLOCK_WEIGHTS, CBU_SECOND_BLOCK_WEIGHTS, checkDigit(), isValidAccountAlias(), isValidAccountNumber(), isValidCbu() (+1 more)

### Attachment Contracts - "Attachment Contracts"
Cohesion: 0.27
Nodes (9): Attachment, ATTACHMENT_CONTENT_TYPES, ATTACHMENT_MAX_BYTES, AttachmentContentType, attachmentSchema, AttachmentUrl, attachmentUrlSchema, isAllowedAttachmentType() (+1 more)

### Spec 006 Debts - "Spec 006 Debts"
Cohesion: 0.25
Nodes (9): Checklist 006: Spec Quality, API Contracts 006: Cuotas y Deudas, ALL_INSTALLMENTS_PAID / DEBT_ALREADY_SETTLED errors, POST /debts/:id/register-payment, Data Model 006: Cuotas y Deudas, Debt installment fields (totalInstallments/paidInstallments/installmentAmount), Quickstart 006: Validación Cuotas y Deudas, Spec 006: Vistas Cuotas y Deudas (+1 more)

### Spec 014 Checklists - "Spec 014 Checklists"
Cohesion: 0.29
Nodes (3): Checklist 014: Financial Integrity, Checklist 014: Requirements quality, Spec 014: Facturacion de compras en cuotas con tarjeta de credito

### MFA Docs - "MFA Docs"
Cohesion: 0.20
Nodes (10): Contratos: endpoints MFA, POST /auth/login/mfa-verify, Data Model 021: MFA con TOTP, Errores MFA (MFA_NOT_PENDING, INVALID_MFA_CODE, MFA_LOCKED, MFA_ALREADY_ENABLED, MFA_PENDING_TOKEN_INVALID), Quickstart 021: MFA de punta a punta, Cookie mfa_pending_token (MFA_PENDING_TOKEN_SECRET), Tabla mfa-recovery-code (marcado-usado atómico), Lockout MFA: 5 intentos / 15 min (MFA_LOCKED 429) (+2 more)

### Savings Currency Usage - "Savings Currency Usage"
Cohesion: 0.27
Nodes (3): CurrencyUsageLookupPort, SAVINGS_GOAL_CURRENCY_USAGE, PrismaSavingsGoalCurrencyUsageLookupRepository

### Transaction Currency Usage - "Transaction Currency Usage"
Cohesion: 0.27
Nodes (3): CurrencyUsageLookupPort, TRANSACTION_CURRENCY_USAGE, PrismaTransactionCurrencyUsageLookupRepository

### Balance After - "Balance After"
Cohesion: 0.24
Nodes (7): BalanceAfterInput, balanceAfterTransaction(), delta(), account, creditCard, debitCard, items

### Spec 010 Panels - "Spec 010 Panels"
Cohesion: 0.24
Nodes (10): 010 Spec Quality Checklist, 010 Transfers/Attachments Plan, Shared label/value detail-row primitive, SidePanel/FormSurface overlays, 010 Transfers/Attachments Quickstart, 010 Movements Transfers Attachments Spec, Deferred attachment upload on create (FR-021a), Duplicate movement (FR-005) (+2 more)

### Community 174 - "Community 174"
Cohesion: 0.27
Nodes (8): Checklist requisitos: Inversiones (012), Decisiones abiertas: instrumento↔cuenta y creación de cuenta, Spec: Registro y seguimiento de inversiones (012, diferida), Cuenta de ahorro para la vivienda, Cuenta remunerada, Depósito a plazo (abrir/liquidar/renovar), Instrumento de valor variable con valor declarado, Patrimonio: verificado vs declarado, por moneda

### Community 175 - "Community 175"
Cohesion: 0.22
Nodes (10): Checklist dinero y mutación de estado (013), Checklist requisitos: Vista Cuotas (013), Checklist UX: Vista Cuotas (013), Quickstart: Vista Cuotas (013), Spec: Vista Cuotas rediseño y pago real (013), Arrastre a la siguiente cuota impaga (FR-021..FR-023), FR-001..FR-058c Vista Cuotas, SC-001..SC-013 (+2 more)

### Community 177 - "Community 177"
Cohesion: 0.39
Nodes (7): token(), FAR_RANGE, RIDGE_END, RIDGE_FACES, RIDGE_LINE, RIDGE_SUMMIT, RIDGE_VIEWBOX

### Community 178 - "Community 178"
Cohesion: 0.22
Nodes (8): compilerOptions, jsx, lib, noEmit, types, extends, include, @finance/config/tsconfig.base.json

### Community 179 - "Community 179"
Cohesion: 0.22
Nodes (4): DebtKpi type, Plan 006: Rediseño Cuotas y Deudas, Research 006: Cuotas y Deudas, Cuotas view is UI-only redesign

### Community 180 - "Community 180"
Cohesion: 0.36
Nodes (8): Contrato Adjuntos (spec 010), ATTACHMENT_CONTENT_TYPES (jpeg/png/webp/pdf), ATTACHMENT_MAX_BYTES (5 MB), ATTACHMENTS_UNAVAILABLE (503), attachmentSchema, attachmentUrlSchema (URL firmada 5 min), ObjectStoragePort.isConfigured, Variables S3_* opcionales

### Community 181 - "Community 181"
Cohesion: 0.25
Nodes (9): Checklist requisitos: Cuenta prepago (011), Quickstart: Cuenta prepago (011), Spec: Cuenta prepago como producto independiente (011), Cuenta prepago (entidad), Tarjeta prepago (entidad), FR-001..FR-016 cuenta prepago, US1-US4: registrar, gastar sin pasarse, cargar, paridad, Tasks: Cuenta prepago (011) (+1 more)

### Community 182 - "Community 182"
Cohesion: 0.32
Nodes (8): Anexo de Transferencia Internacional de Datos, Cláusulas Contractuales Modelo (Min. Economía, RAEX202503748), Transferencia activa: IP de login a IPinfo.io, Transferencia potencial: S3 de adjuntos (hoy inerte), Contrato de Tratamiento de Datos (DPA), Proveedores encargados (S3, IPinfo; MaxMind local no es encargado), Actividad 4: seguridad de sesión (IP, dispositivo, geolocalización), Calendario de revisión de compliance

### Community 183 - "Community 183"
Cohesion: 0.39
Nodes (5): Plan de Respuesta a Brechas de Datos Personales, Registro de Actividades de Tratamiento (RAT), Registro de Vulneraciones (append-only), Privacidad desde el diseño (UUID v7, cursor HMAC, storage key opaca), PENDING.md (partial/placeholder features registry)

### Community 184 - "Community 184"
Cohesion: 0.25
Nodes (8): Dependabot configuration, Dependabot groups (nestjs, vite-vitest, typescript-eslint, react, prisma), CI workflow (build-test), pnpm audit --audit-level=high gate, prisma db push + reference seed in CI, CI postgres:16-alpine service for integration/e2e, Throwaway CI secrets (JWT, CURSOR_SIGNING, MFA, PASSKEY), Turbo affected filter (...[origin/main]) on PRs

### Community 185 - "Community 185"
Cohesion: 0.25
Nodes (3): CategoryRef, PrismaCategoryRepository, toContract()

### Community 194 - "Community 194"
Cohesion: 0.25
Nodes (4): ACCESS_COOKIE, FUTURE, makeGuard(), PAST

### Community 195 - "Community 195"
Cohesion: 0.39
Nodes (7): command(), fakeAccount(), fakePrisma, fakeRepo(), makePlan(), payHandler(), unpayHandler()

### Community 196 - "Community 196"
Cohesion: 0.29
Nodes (5): attachment(), eventBus, fakeRepo(), file, PDF

### Community 197 - "Community 197"
Cohesion: 0.29
Nodes (7): Web index.html (Cuadra entry, pre-paint theme), @finance/web README (per-domain skeleton), App Context and History (original Next.js app), Architecture (monorepo, api/web/packages), @finance/contracts (zod API contract), @finance/money (decimal.js money math), Docs Index README

### Community 198 - "Community 198"
Cohesion: 0.29
Nodes (3): capture(), root, waitForHealthy()

### Community 199 - "Community 199"
Cohesion: 0.32
Nodes (7): Contrato: POST .../credit-statements/:statementId/prepay, accounts.prepayCreditStatementSchema, Error STATEMENT_NOT_OPEN, CreditStatementState.canPrepay(), CreditStatement.changePrepayment(grossTotal, old, new), findByIdForUpdateWithTx (SELECT FOR UPDATE), PrepayOpenPeriodCommand/Handler (creditStatement.prepay)

### Community 201 - "Community 201"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, preview, test, typecheck

### Community 202 - "Community 202"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, @finance/config/tsconfig.base.json

### Community 203 - "Community 203"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, @finance/config/tsconfig.base.json

### Community 204 - "Community 204"
Cohesion: 0.43
Nodes (7): Card filter resolves to parent bankAccountId, TransactionTable component, Tasks 007: Cuentas y Movimientos, AccountDetailRoute, AccountVisualCard component, CardCreateModal component, toQuery cardId serialization fix

### Community 205 - "Community 205"
Cohesion: 0.38
Nodes (6): Data Model 008: Perfil de Usuario, Perfil financial fields (hideBalances/extraCurrencies/budget), isValidRut (modulo 11), User personal info (country/address/birthDate/identifier), User preferences (preferredCurrency/locale/dateFormat/theme), UserStatus enum (ACTIVE/DISABLED)

### Community 206 - "Community 206"
Cohesion: 0.38
Nodes (5): Contrato installments (013), generatesMovementOnPay(cardKind), installmentPlanStatus (OVERDUE/DUE_SOON/ON_TRACK/PARTIALLY_PAID/PAID), payInstallmentSchema (amount + chargedAmount), planStatus(nextDueDate, now)

### Community 209 - "Community 209"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 210 - "Community 210"
Cohesion: 0.33
Nodes (5): @finance/api README (per-table domain skeleton), Leaf data.module vs orchestration module, One table, one domain rule, infra/cqrs README (handler base classes and wiring), BaseCommandHandler/BaseQueryHandler (Template Method)

### Community 214 - "Community 214"
Cohesion: 0.33
Nodes (5): both, expense, income, lookupWith(), system

### Community 215 - "Community 215"
Cohesion: 0.33
Nodes (5): compilerOptions, rootDir, exclude, extends, ./tsconfig.json

### Community 216 - "Community 216"
Cohesion: 0.33
Nodes (4): router, rootEl, @fontsource-variable/geist, @fontsource-variable/inter

### Community 217 - "Community 217"
Cohesion: 0.33
Nodes (3): Regional Catalogue Research (Catalogo Regional), Argentine institution catalogue (BCRA codes, PSP), MVP Scope Document

### Community 219 - "Community 219"
Cohesion: 0.33
Nodes (6): Checklist de calidad spec 020, Data Model 020: Personalización financiera, Plan 020: Personalización financiera del perfil, Quickstart 020, Spec 020: Personalización financiera del perfil, Tasks 020

### Community 220 - "Community 220"
Cohesion: 0.33
Nodes (5): Endpoints /auth/me/mfa/enroll, confirm, disable, Research 021: MFA con TOTP, mfaSecretEncrypted AES-256-GCM (MFA_ENCRYPTION_KEY), Librería otpauth (TOTP RFC 6238), Librería qrcode (QR server-side data URL)

### Community 223 - "Community 223"
Cohesion: 0.40
Nodes (4): files, name, private, version

### Community 224 - "Community 224"
Cohesion: 0.40
Nodes (4): Estado MFA derivado (inactiva/pendiente/activa sin enum), Data Model 022: Llave de acceso (Passkey/WebAuthn), Errores PASSKEY_CHALLENGE_INVALID / PASSKEY_NOT_FOUND, Tabla Passkey (credentialId @unique, counter anti-clonado)

### Community 228 - "Community 228"
Cohesion: 0.50
Nodes (3): agent-context extension.yml manifest, agent-context extension, Spec Kit extensions.yml (hooks)

### Community 230 - "Community 230"
Cohesion: 0.50
Nodes (4): Checklist de calidad spec 021, Plan 021: MFA con TOTP, Spec 021: Autenticación en dos pasos (MFA TOTP), Tasks 021: MFA con TOTP

### Community 231 - "Community 231"
Cohesion: 0.67
Nodes (3): Favicon (Cordillera compact mark), Cordillera brand mark (receipt outline + snow peak + total line), prefers-color-scheme light variant (deep teal)

## Knowledge Gaps
- **1239 isolated node(s):** `extends`, `next/core-web-vitals`, `update-agent-context.sh script`, `$schema`, `collection` (+1234 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2730 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `App Module & Error Filter` to `Template Import Handlers`, `Account Deletion Scope`, `Account Commands & Queries`, `Country-Currency Data`, `Controllers & Route Params`, `MFA & Recurring Repos`, `Handler Contexts A`, `Card Account Data Module`, `Add Card Handler`, `Recurring Repository`, `Attachment Modules`, `Prisma Repositories`, `Currency Usage Ports`, `Passkey Domain`, `Remove Account Handler`, `Plan Schedule & Credit Math`, `Data Modules`, `GeoIP Config`, `Replace Wallet`, `Session Domain`, `Recurring Currency Usage`, `Handler Contexts B`, `Card Limits`, `Category Policy`, `Prisma BankAccount Repo`, `Country Lookup`, `Country Identifier Types`, `Attachment Files`, `Savings Currency Usage`, `Transaction Currency Usage`, `Account Command Classes`, `Handler Logging Interceptors`, `Consent Records`, `Transaction Query Handlers`, `Institutions Domain`, `Community 186`, `Community 187`, `Community 188`, `Installment Plan Repository`, `Community 189`, `Community 191`, `Card Limit Repositories`, `Community 194`, `Countries Domain`, `Currencies Domain`, `Wallet Item Removal`, `User Repository`, `HTTP Error Helpers`, `Wallet Planning`, `Account Deletion Log`, `Community 211`, `Community 212`, `Attachment Errors`, `Categories Domain`, `Community 221`, `Cron & Domain Modules`, `Add Wallet Item`, `Community 226`, `IP Cache Purge`, `Recurring Errors`, `Installment Payment Repository`, `Idempotency Cleanup Cron`, `Recurring Queries`, `Create Recurring Handler`, `S3 Storage Adapter`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `AuthUser` connect `Auth Controller` to `Installments Controller & Commands`, `Credit Statements Controller`, `Transactions Controller & Commands`, `Debts Controller & Commands`, `Import Controller`, `Controllers & Route Params`, `Account Commands & Queries`, `Account Command Classes`, `Attachments Controller & Commands`, `Recurring Controller`, `Wallet Controller & Commands`, `Savings Controller & Queries`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `BaseCommandHandler` connect `Passkey Domain` to `Template Import Handlers`, `Account Deletion Scope`, `CQRS Test Fakes`, `Account Commands & Queries`, `Currency Usage Ports`, `Handler Contexts A`, `Card Account Data Module`, `Add Card Handler`, `Remove Account Handler`, `Data Modules`, `Replace Wallet`, `Session Domain`, `MFA Recovery Codes`, `Card Limits`, `Category Policy`, `Attachment Files`, `Consent Records`, `Passkey & Step-Up Handlers`, `Community 190`, `Wallet Item Removal`, `Account Deletion Log`, `Recurring Update Handler`, `Attachment Errors`, `Security Handlers (Password/MFA)`, `Community 222`, `Add Wallet Item`, `IP Cache Purge`, `Attachment Handlers & Storage`, `Recurring Errors`, `Idempotency Cleanup Cron`, `Create Recurring Handler`, `Wallet Query Handlers`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `extends`, `next/core-web-vitals`, `update-agent-context.sh script` to the rest of the system?**
  _1239 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Template Import Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.0174583505438524 - nodes in this community are weakly interconnected._
- **Should `Account Deletion Scope` be split into smaller, more focused modules?**
  _Cohesion score 0.020652674793682713 - nodes in this community are weakly interconnected._
- **Should `Account Create/Edit UI` be split into smaller, more focused modules?**
  _Cohesion score 0.03669568185697218 - nodes in this community are weakly interconnected._