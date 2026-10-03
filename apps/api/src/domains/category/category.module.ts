import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ListCategoriesQueryHandler } from "./application/queries/list-categories.handler";
import { CATEGORY_REPOSITORY } from "./domain/ports/category.repository.port";
import { PrismaCategoryRepository } from "./infrastructure/prisma-category.repository";
import { CategoriesController } from "./presentation/categories.controller";

/** Orchestration module for the `category` table (global, read-only, seeded). */
@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [CategoriesController],
  providers: [
    ListCategoriesQueryHandler,
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    JwtAuthGuard,
  ],
})
export class CategoryModule {}
