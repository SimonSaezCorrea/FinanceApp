import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { RecurringController } from "./recurring.controller";
import { RecurringRepository } from "./recurring.repository";
import { RecurringService } from "./recurring.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [RecurringController],
  providers: [RecurringService, RecurringRepository, JwtAuthGuard],
})
export class RecurringModule {}
