import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { DebtsController } from "./debts.controller";
import { DebtsRepository } from "./debts.repository";
import { DebtsService } from "./debts.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [DebtsController],
  providers: [DebtsService, DebtsRepository, JwtAuthGuard],
})
export class DebtsModule {}
