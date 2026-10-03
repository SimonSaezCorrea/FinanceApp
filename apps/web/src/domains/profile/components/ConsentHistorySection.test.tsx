import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { ConsentHistorySection } from "./ConsentHistorySection";

const listConsents = vi.fn();
vi.mock("../api/consentsApi", () => ({
  consentsApi: { list: (...args: unknown[]) => listConsents(...args) },
}));

function renderSection() {
  return render(
    <Providers>
      <ConsentHistorySection />
    </Providers>,
  );
}

describe("ConsentHistorySection", () => {
  it("shows the granted consent with its policy version", async () => {
    listConsents.mockResolvedValue([
      {
        id: "c1",
        type: "SENSITIVE_DATA_PROCESSING",
        policyVersion: "2026-09-20",
        grantedAt: "2026-09-20T12:00:00.000Z",
        revokedAt: null,
      },
    ]);
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.consents.title") }));

    expect(
      await screen.findByText(i18n.t("profile.consents.type.sensitiveDataProcessing")),
    ).toBeDefined();
    await waitFor(() => expect(screen.getByText(/2026-09-20/)).toBeDefined());
  });

  it("shows the empty state when there are no consents", async () => {
    listConsents.mockResolvedValue([]);
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.consents.title") }));

    expect(await screen.findByText(i18n.t("profile.consents.empty"))).toBeDefined();
  });
});
