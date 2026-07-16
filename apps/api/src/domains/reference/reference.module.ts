import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ReferenceController } from "./reference.controller";
import { ReferenceRepository } from "./reference.repository";
import { ReferenceService } from "./reference.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [ReferenceController],
  providers: [ReferenceService, ReferenceRepository, JwtAuthGuard],
})
export class ReferenceModule {}
