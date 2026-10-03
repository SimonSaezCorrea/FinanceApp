import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { reference } from "@finance/contracts";

import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ListCategoriesQuery } from "../application/queries/list-categories.query";

/** Facade (FR-012) for `GET /categories` — the global movement-category
 * catalogue. Authed, not user-scoped. */
@Controller()
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("categories")
  categories(): Promise<reference.Category[]> {
    return this.queryBus.execute(new ListCategoriesQuery());
  }
}
