import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { customFields } from "@finance/contracts";

import i18n from "../../../i18n";
import { CustomFieldInputs } from "./CustomFieldInputs";

const base = {
  options: [],
  scope: { movementKinds: [], accountIds: [], cardKinds: [] },
  scopeBroken: false,
  defaultValue: null,
  showAsColumn: false,
  sortOrder: 0,
  valueCount: 0,
};
const transferido = {
  ...base,
  id: "f1",
  name: "Transferido",
  type: "BOOLEAN",
} as customFields.CustomField;
const nota = { ...base, id: "f2", name: "Nota", type: "TEXT" } as customFields.CustomField;

describe("CustomFieldInputs (specs/036)", () => {
  beforeEach(() => void i18n.changeLanguage("es"));

  it("a yes/no field has 'Sin valor' as a choice of its own, apart from 'No'", () => {
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <CustomFieldInputs fields={[transferido]} values={{ f1: false }} onChange={onChange} />
      </I18nextProvider>,
    );
    const no = screen.getByRole("button", { name: i18n.t("customFields.values.no") });
    expect(no.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.values.empty") }));
    expect(onChange).toHaveBeenCalledWith("f1", null);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.values.yes") }));
    expect(onChange).toHaveBeenCalledWith("f1", true);
  });

  it("emptying a text means no value", () => {
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <CustomFieldInputs fields={[nota]} values={{ f2: "x" }} onChange={onChange} />
      </I18nextProvider>,
    );
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: " " } });
    expect(onChange).toHaveBeenCalledWith("f2", null);
  });
});
