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
import { RECURRING_EXPENSE_REPOSITORY } from "./domain/ports/recurring-expense.repository.port";
import { PrismaRecurringExpenseRepository } from "./infrastructure/prisma-recurring-expense.repository";
import { RecurringController } from "./presentation/recurring.controller";

const commandHandlers = [
  CreateRecurringExpenseHandler,
  UpdateRecurringExpenseHandler,
  RemoveRecurringExpenseHandler,
];

const queryHandlers = [ListRecurringExpensesQueryHandler, GetRecurringExpenseQueryHandler];

@Module({
  imports: [CqrsModule, JwtModule.register({}), BankAccountDataModule, CardAccountDataModule],
  controllers: [RecurringController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: RECURRING_EXPENSE_REPOSITORY, useClass: PrismaRecurringExpenseRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class RecurringExpenseModule {}
