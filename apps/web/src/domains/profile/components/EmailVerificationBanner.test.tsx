import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@finance/client";

import i18n from "../../../i18n";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
import { Providers } from "../../../app/providers";

const me = vi.fn();
const resendVerification = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: {
    me: (...args: unknown[]) => me(...args),
    logout: vi.fn(),
    resendVerification: (...args: unknown[]) => resendVerification(...args),
  },
}));

function user(emailVerified: boolean) {
  return {
    id: "u1",
    email: "ana@test.local",
    name: "Ana",
    preferredCurrency: "CLP",
    locale: "es",
    theme: "dark",
    emailVerified,
  };
}

function renderBanner() {
  return render(
    <Providers>
      <EmailVerificationBanner />
    </Providers>,
  );
}

describe("EmailVerificationBanner", () => {
  it("is shown while the address is unconfirmed and resends on request", async () => {
    me.mockResolvedValue(user(false));
    resendVerification.mockResolvedValue({});
    renderBanner();

    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("app.emailVerification.resend") }),
    );
    expect(
      await screen.findByText(i18n.t("app.emailVerification.sent", { address: "ana@test.local" })),
    ).toBeDefined();
  });

  it("explains a refused resend in words", async () => {
    me.mockResolvedValue(user(false));
    resendVerification.mockRejectedValue(new ApiRequestError("EMAIL_RATE_LIMITED", 429));
    renderBanner();

    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("app.emailVerification.resend") }),
    );
    expect(await screen.findByText(i18n.t("errors.EMAIL_RATE_LIMITED"))).toBeDefined();
  });

  it("is not shown once the address is confirmed", async () => {
    me.mockResolvedValue(user(true));
    renderBanner();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(i18n.t("app.emailVerification.title"))).toBeNull();
  });
});
