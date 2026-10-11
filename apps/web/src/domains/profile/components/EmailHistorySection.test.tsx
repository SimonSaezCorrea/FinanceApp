import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { EmailHistorySection } from "./EmailHistorySection";

const listEmails = vi.fn();
const removeEmail = vi.fn();
const resendVerification = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: {
    me: vi.fn().mockResolvedValue(null),
    logout: vi.fn(),
    listEmails: (...args: unknown[]) => listEmails(...args),
    removeEmail: (...args: unknown[]) => removeEmail(...args),
    resendVerification: (...args: unknown[]) => resendVerification(...args),
  },
}));

const items = [
  {
    id: "e1",
    address: "now@test.local",
    status: "PRIMARY",
    verifiedAt: "2026-10-01T12:00:00.000Z",
    createdAt: "2026-10-01T12:00:00.000Z",
    replacedAt: null,
  },
  {
    id: "e2",
    address: "next@test.local",
    status: "PENDING",
    verifiedAt: null,
    createdAt: "2026-10-05T12:00:00.000Z",
    replacedAt: null,
  },
  {
    id: "e0",
    address: "old@test.local",
    status: "PAST",
    verifiedAt: "2026-01-01T12:00:00.000Z",
    createdAt: "2026-01-01T12:00:00.000Z",
    replacedAt: "2026-10-01T12:00:00.000Z",
  },
];

function renderSection() {
  return render(
    <Providers>
      <EmailHistorySection />
    </Providers>,
  );
}

describe("EmailHistorySection", () => {
  it("lists every address with its status and never offers to delete the primary", async () => {
    listEmails.mockResolvedValue({ items });
    renderSection();

    expect(await screen.findByText("now@test.local")).toBeDefined();
    expect(screen.getByText(i18n.t("profile.emails.status.PRIMARY"))).toBeDefined();
    expect(screen.getByText(i18n.t("profile.emails.status.PENDING"))).toBeDefined();
    expect(screen.getByText(i18n.t("profile.emails.status.PAST"))).toBeDefined();
    expect(
      screen.queryByRole("button", {
        name: i18n.t("profile.emails.remove", { address: "now@test.local" }),
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: i18n.t("profile.emails.remove", { address: "old@test.local" }),
      }),
    ).toBeDefined();
  });

  it("deletes a past address after confirming", async () => {
    listEmails.mockResolvedValue({ items });
    removeEmail.mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", {
        name: i18n.t("profile.emails.remove", { address: "old@test.local" }),
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.emails.removeConfirm") }),
    );
    await waitFor(() => expect(removeEmail).toHaveBeenCalledWith("e0"));
  });

  it("resends the pending link and says so", async () => {
    listEmails.mockResolvedValue({ items });
    resendVerification.mockResolvedValue({});
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.emails.resend") }));
    expect(await screen.findByText(i18n.t("profile.emails.resent"))).toBeDefined();
  });
});
