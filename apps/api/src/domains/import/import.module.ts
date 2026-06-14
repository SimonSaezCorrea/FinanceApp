import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ImportController } from "./import.controller";
import { ImportService } from "./import.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [ImportController],
  providers: [ImportService, JwtAuthGuard],
})
export class ImportModule {}
