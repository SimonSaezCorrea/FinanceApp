import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { FirstStepsCard } from "./FirstStepsCard";

function renderCard(done: { account: boolean; movement: boolean; wallet: boolean }) {
  const actions = { account: vi.fn(), movement: vi.fn(), wallet: vi.fn() };
  const onHide = vi.fn();
  render(
    <MemoryRouter>
      <FirstStepsCard done={done} actions={actions} onHide={onHide} />
    </MemoryRouter>,
  );
  return { actions, onHide };
}

describe("FirstStepsCard", () => {
  it("after the account, offers the next step with its own button", () => {
    const { actions } = renderCard({ account: true, movement: false, wallet: false });
    expect(screen.getByText(i18n.t("accounts.onboarding.title.movement"))).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("accounts.onboarding.cta.movement") }),
    );
    expect(actions.movement).toHaveBeenCalled();
    expect(actions.account).not.toHaveBeenCalled();
  });

  it("can be hidden, and renders nothing once every step is done", () => {
    const { onHide } = renderCard({ account: true, movement: true, wallet: false });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("accounts.onboarding.hide") }));
    expect(onHide).toHaveBeenCalled();

    const { container } = render(
      <MemoryRouter>
        <FirstStepsCard done={{ account: true, movement: true, wallet: true }} actions={{}} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe("");
  });
});
