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

function fillExpiry() {
  fireEvent.change(screen.getByLabelText(i18n.t("cards.form.expiry")), {
    target: { value: "0129" },
  });
}

describe("CardForm", () => {
  it("has no field that could ever collect a full card number — only the last 4 digits", () => {
    renderForm();
    expect(screen.queryByLabelText(/número/i)).toBeNull();
    expect(screen.getByLabelText(i18n.t("cards.form.last4"))).toBeDefined();
  });

  it("submits the last 4 digits + parsed MM/AA expiry", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.name")), {
      target: { value: "Visa" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "1234" },
    });
    fillExpiry();
    fireEvent.submit(screen.getByText("add").closest("form")!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.last4).toBe("1234");
    expect(payload.expiryMonth).toBe(1);
    expect(payload.expiryYear).toBe(2029);
  });

  it("defaults the name to the card kind when left blank", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "4821" },
    });
    fillExpiry();
    fireEvent.submit(screen.getByText("add").closest("form")!);

    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.name).toBe(i18n.t("cards.kind.CREDIT"));
  });

  it("rejects a last4 that isn't exactly 4 digits", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "12" },
    });
    fillExpiry();
    fireEvent.submit(screen.getByText("add").closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range expiry month (e.g. 13/29)", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "1234" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.expiry")), {
      target: { value: "1329" },
    });
    fireEvent.submit(screen.getByText("add").closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
