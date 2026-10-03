import { Module } from "@nestjs/common";

import { CATEGORY_LOOKUP } from "./domain/ports/category-lookup.port";
import { PrismaCategoryRepository } from "./infrastructure/prisma-category.repository";

/** Leaf data module for the `category` table — what the domains storing a
 * `categoryId` import. Imports no other domain. */
@Module({
  providers: [{ provide: CATEGORY_LOOKUP, useClass: PrismaCategoryRepository }],
  exports: [CATEGORY_LOOKUP],
})
export class CategoryDataModule {}
