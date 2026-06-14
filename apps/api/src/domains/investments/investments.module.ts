import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { InvestmentsController } from "./investments.controller";
import { InvestmentsRepository } from "./investments.repository";
import { InvestmentsService } from "./investments.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [InvestmentsController],
  providers: [InvestmentsService, InvestmentsRepository, JwtAuthGuard],
})
export class InvestmentsModule {}
