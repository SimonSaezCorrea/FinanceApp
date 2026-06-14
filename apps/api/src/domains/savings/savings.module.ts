import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { SavingsController } from "./savings.controller";
import { SavingsRepository } from "./savings.repository";
import { SavingsService } from "./savings.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [SavingsController],
  providers: [SavingsService, SavingsRepository, JwtAuthGuard],
})
export class SavingsModule {}
