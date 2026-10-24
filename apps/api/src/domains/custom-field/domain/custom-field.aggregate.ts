import { customFields } from "@finance/contracts";

import {
  CustomFieldInvalidValueError,
  CustomFieldOptionInUseError,
  CustomFieldTypeLockedError,
} from "./errors";

export type CustomFieldValue = customFields.CustomFieldValue;

export interface CustomFieldScopeProps {
  movementKinds: customFields.CustomFieldMovementKind[];
  restrictAccounts: boolean;
  accountIds: string[];
  cardKinds: customFields.CustomFieldCardKind[];
}

export interface CustomFieldProps {
  id: string;
  userId: string;
  name: string;
  nameKey: string;
  type: customFields.CustomFieldType;
  options: customFields.CustomFieldOption[];
  scope: CustomFieldScopeProps;
  defaultValue: CustomFieldValue | null;
  showAsColumn: boolean;
  sortOrder: number;
}

export type PlannedCustomField = Omit<CustomFieldProps, "id">;

/** The scope as the contract sends it: naming accounts is what restricts it. */
export function scopeFromInput(scope: customFields.CustomFieldScope): CustomFieldScopeProps {
  return {
    movementKinds: [...new Set(scope.movementKinds)],
    restrictAccounts: scope.accountIds.length > 0,
    accountIds: [...new Set(scope.accountIds)],
    cardKinds: [...new Set(scope.cardKinds)],
  };
}

function checkDefault(
  field: Pick<CustomFieldProps, "type" | "options">,
  raw: CustomFieldValue | null,
): CustomFieldValue | null {
  if (raw === null) return null;
  const parsed = customFields.parseFieldValue(field, raw);
  if (!parsed.ok) throw new CustomFieldInvalidValueError("defaultValue");
  return parsed.value;
}

/**
 * A field a person defines for their own movements (specs/036). It owns every rule
 * a value is checked against — its type, its options, its scope, its default — so
 * creating a movement, editing one, a bulk assignment and an import all decide the
 * same way. The rules themselves are the contract's pure functions, shared with the
 * web forms.
 */
export class CustomField {
  private constructor(private props: CustomFieldProps) {}

  static fromPersistence(props: CustomFieldProps): CustomField {
    return new CustomField(props);
  }

  static planCreation(
    userId: string,
    input: customFields.CreateCustomField,
    sortOrder: number,
  ): PlannedCustomField {
    const type = input.type;
    const options = type === "OPTION" ? input.options : [];
    return {
      userId,
      name: input.name.trim(),
      nameKey: customFields.normalizeFieldName(input.name),
      type,
      options,
      scope: scopeFromInput(input.scope),
      defaultValue: checkDefault({ type, options }, input.defaultValue ?? null),
      showAsColumn: input.showAsColumn ?? false,
      sortOrder,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get name(): string {
    return this.props.name;
  }
  get nameKey(): string {
    return this.props.nameKey;
  }
  get type(): customFields.CustomFieldType {
    return this.props.type;
  }
  get options(): customFields.CustomFieldOption[] {
    return this.props.options;
  }
  get scope(): CustomFieldScopeProps {
    return this.props.scope;
  }
  get defaultValue(): CustomFieldValue | null {
    return this.props.defaultValue;
  }
  get showAsColumn(): boolean {
    return this.props.showAsColumn;
  }
  get sortOrder(): number {
    return this.props.sortOrder;
  }
  /** It named accounts and every one of them was deleted: it applies to nothing. */
  get scopeBroken(): boolean {
    return this.props.scope.restrictAccounts && this.props.scope.accountIds.length === 0;
  }

  /**
   * Applies a PATCH. `valueCount` locks the type (FR-004); `usedOptionIds` are the
   * options some movement holds, which can't be removed.
   */
  applyUpdate(
    patch: customFields.UpdateCustomField,
    usage: { valueCount: number; usedOptionIds: ReadonlySet<string> },
  ): void {
    const next: CustomFieldProps = { ...this.props };
    if (patch.name !== undefined) {
      next.name = patch.name.trim();
      next.nameKey = customFields.normalizeFieldName(patch.name);
    }
    const typeChanged = patch.type !== undefined && patch.type !== next.type;
    if (typeChanged) {
      if (usage.valueCount > 0) throw new CustomFieldTypeLockedError();
      next.type = patch.type!;
      if (next.type !== "OPTION") next.options = [];
    }
    if (patch.options !== undefined) {
      const kept = new Set(patch.options.map((o) => o.id));
      if (this.props.options.some((o) => !kept.has(o.id) && usage.usedOptionIds.has(o.id))) {
        throw new CustomFieldOptionInUseError();
      }
      next.options = next.type === "OPTION" ? patch.options : [];
    }
    if (next.type === "OPTION" && next.options.length === 0) {
      throw new CustomFieldInvalidValueError("options");
    }
    if (patch.scope !== undefined) next.scope = scopeFromInput(patch.scope);
    if (patch.showAsColumn !== undefined) next.showAsColumn = patch.showAsColumn;

    if (patch.defaultValue !== undefined) {
      next.defaultValue = checkDefault(next, patch.defaultValue);
    } else if (
      next.defaultValue !== null &&
      !customFields.parseFieldValue(next, next.defaultValue).ok
    ) {
      // The type changed or the option it named was removed on purpose: the old
      // default no longer means anything, so it goes rather than blocking the edit.
      next.defaultValue = null;
    }
    this.props = next;
  }

  /** The canonical form of a value of this field, or `CUSTOM_FIELD_INVALID_VALUE`. */
  parseValue(raw: unknown, field = `customFields.${this.props.id}`): CustomFieldValue {
    const parsed = customFields.parseFieldValue(this.props, raw);
    if (!parsed.ok) throw new CustomFieldInvalidValueError(field);
    return parsed.value;
  }

  appliesTo(shape: customFields.MovementShape): boolean {
    return customFields.fieldAppliesTo(this.props.scope, shape);
  }

  toProps(): CustomFieldProps {
    return { ...this.props };
  }

  toContract(valueCount: number): customFields.CustomField {
    return {
      id: this.props.id,
      name: this.props.name,
      type: this.props.type,
      options: this.props.options,
      scope: {
        movementKinds: this.props.scope.movementKinds,
        accountIds: this.props.scope.accountIds,
        cardKinds: this.props.scope.cardKinds,
      },
      scopeBroken: this.scopeBroken,
      defaultValue: this.props.defaultValue,
      showAsColumn: this.props.showAsColumn,
      sortOrder: this.props.sortOrder,
      valueCount,
    };
  }
}
