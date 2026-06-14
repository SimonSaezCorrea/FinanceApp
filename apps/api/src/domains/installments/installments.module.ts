import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { InstallmentsController } from "./installments.controller";
import { InstallmentsRepository } from "./installments.repository";
import { InstallmentsService } from "./installments.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [InstallmentsController],
  providers: [InstallmentsService, InstallmentsRepository, JwtAuthGuard],
})
export class InstallmentsModule {}
