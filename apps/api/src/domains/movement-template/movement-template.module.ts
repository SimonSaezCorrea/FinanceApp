import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { CategoryDataModule } from "../category/category.data.module";
import { CustomFieldDataModule } from "../custom-field/custom-field.data.module";
import { RecurringExpenseDataModule } from "../recurring-expense/recurring-expense.data.module";
import { CreateMovementTemplateHandler } from "./application/commands/create-movement-template.handler";
import { RemoveMovementTemplateHandler } from "./application/commands/remove-movement-template.handler";
import { ReplaceMovementTemplateHandler } from "./application/commands/replace-movement-template.handler";
import { ListMovementTemplatesQueryHandler } from "./application/queries/list-movement-templates.handler";
import { TemplateReferencePortsProvider } from "./application/reference-ports.provider";
import { MovementTemplateDataModule } from "./movement-template.data.module";
import { MovementTemplatesController } from "./presentation/movement-templates.controller";

/**
 * Orchestration module for movement templates (specs/037). It checks references
 * through the other tables' leaf data modules only (accounts, cards, categories,
 * recurring series, custom fields) and writes only its own table.
 */
@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    MovementTemplateDataModule,
    BankAccountDataModule,
    CardAccountDataModule,
    CategoryDataModule,
    RecurringExpenseDataModule,
    CustomFieldDataModule,
  ],
  controllers: [MovementTemplatesController],
  providers: [
    CreateMovementTemplateHandler,
    ReplaceMovementTemplateHandler,
    RemoveMovementTemplateHandler,
    ListMovementTemplatesQueryHandler,
    TemplateReferencePortsProvider,
    JwtAuthGuard,
  ],
})
export class MovementTemplateModule {}
