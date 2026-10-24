import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { IdempotencyRecordDataModule } from "../idempotency-record/idempotency-record.data.module";
import { TransactionFieldValueDataModule } from "../transaction-field-value/transaction-field-value.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { AssignValuesHandler } from "./application/commands/assign-values.handler";
import { CreateCustomFieldHandler } from "./application/commands/create-custom-field.handler";
import { RemoveCustomFieldHandler } from "./application/commands/remove-custom-field.handler";
import { RevertAssignmentHandler } from "./application/commands/revert-assignment.handler";
import { SetTransactionValuesHandler } from "./application/commands/set-transaction-values.handler";
import { UpdateCustomFieldHandler } from "./application/commands/update-custom-field.handler";
import { CountScopeQueryHandler } from "./application/queries/count-scope.handler";
import { ListCustomFieldsQueryHandler } from "./application/queries/list-custom-fields.handler";
import { PreviewAssignmentQueryHandler } from "./application/queries/preview-assignment.handler";
import { CustomFieldDataModule } from "./custom-field.data.module";
import { CustomFieldsController } from "./presentation/custom-fields.controller";
import { TransactionCustomFieldsController } from "./presentation/transaction-custom-fields.controller";

const commandHandlers = [
  CreateCustomFieldHandler,
  UpdateCustomFieldHandler,
  RemoveCustomFieldHandler,
  SetTransactionValuesHandler,
  AssignValuesHandler,
  RevertAssignmentHandler,
];

const queryHandlers = [
  ListCustomFieldsQueryHandler,
  CountScopeQueryHandler,
  PreviewAssignmentQueryHandler,
];

/**
 * Orchestration module for custom fields (specs/036). It reads movements, cards and
 * accounts only through their leaf data modules (scope counts, ownership, card kinds)
 * and writes values through `transaction-field-value`'s port — never another table.
 */
@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    CustomFieldDataModule,
    TransactionFieldValueDataModule,
    TransactionDataModule,
    CardAccountDataModule,
    BankAccountDataModule,
    IdempotencyRecordDataModule,
  ],
  controllers: [CustomFieldsController, TransactionCustomFieldsController],
  providers: [...commandHandlers, ...queryHandlers, JwtAuthGuard],
})
export class CustomFieldModule {}
