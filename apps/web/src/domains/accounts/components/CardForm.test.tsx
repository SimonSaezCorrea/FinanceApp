import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { CardForm } from "./CardForm";

function renderForm(onSubmit = vi.fn()) {
  render(
    <I18nextProvider i18n={i18n}>
      <CardForm submitLabel="add" onSubmit={onSubmit} />
    </I18nextProvider>,
  );
  return onSubmit;
}

describe("CardForm (security)", () => {
  it("submits only the last 4 digits, never the full PAN", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.name")), {
      target: { value: "Visa" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.number")), {
      target: { value: "4111 1111 1111 1234" },
    });
    fireEvent.submit(screen.getByText("add").closest("form")!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.last4).toBe("1234");
    // the full PAN must NOT appear anywhere in the payload
    expect(JSON.stringify(payload)).not.toContain("4111");
  });

  it("rejects a too-short number", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.number")), {
      target: { value: "12" },
    });
    fireEvent.submit(screen.getByText("add").closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
