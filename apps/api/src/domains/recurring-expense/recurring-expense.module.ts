import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { CreateRecurringExpenseHandler } from "./application/commands/create-recurring-expense.handler";
import { RemoveRecurringExpenseHandler } from "./application/commands/remove-recurring-expense.handler";
import { UpdateRecurringExpenseHandler } from "./application/commands/update-recurring-expense.handler";
import { GetRecurringExpenseQueryHandler } from "./application/queries/get-recurring-expense.handler";
import { ListRecurringExpensesQueryHandler } from "./application/queries/list-recurring-expenses.handler";
import { RecurringExpenseDataModule } from "./recurring-expense.data.module";
import { RecurringController } from "./presentation/recurring.controller";

const commandHandlers = [
  CreateRecurringExpenseHandler,
  UpdateRecurringExpenseHandler,
  RemoveRecurringExpenseHandler,
];

const queryHandlers = [ListRecurringExpensesQueryHandler, GetRecurringExpenseQueryHandler];

@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    BankAccountDataModule,
    CardAccountDataModule,
    RecurringExpenseDataModule,
  ],
  controllers: [RecurringController],
  providers: [...commandHandlers, ...queryHandlers, JwtAuthGuard],
  exports: [],
})
export class RecurringExpenseModule {}
