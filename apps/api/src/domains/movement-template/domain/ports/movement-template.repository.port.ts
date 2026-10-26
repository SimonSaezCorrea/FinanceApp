import type { MovementTemplate, PlannedMovementTemplate } from "../movement-template.aggregate";

export const MOVEMENT_TEMPLATE_REPOSITORY = Symbol("MOVEMENT_TEMPLATE_REPOSITORY");

/** Domain-owned port over the `movement-template` table (specs/037) — zero Prisma
 * imports. Every access is scoped by `userId`: a foreign id resolves to `null`. */
export interface MovementTemplateRepositoryPort {
  /** The person's templates, ordered by name. */
  listForUser(userId: string): Promise<MovementTemplate[]>;
  findOwned(userId: string, id: string): Promise<MovementTemplate | null>;
  countForUser(userId: string): Promise<number>;
  /** `MOVEMENT_TEMPLATE_NAME_TAKEN` when the name collides (the unique `nameKey`). */
  create(plan: PlannedMovementTemplate): Promise<MovementTemplate>;
  /** Writes the aggregate's whole state. `MOVEMENT_TEMPLATE_NAME_TAKEN` on a collision. */
  save(template: MovementTemplate): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
}
