import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { StepUpPanel } from "./StepUpPanel";

const sendStepUpEmailCode = vi.fn();
const stepUp = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: {
    me: vi.fn().mockResolvedValue({
      id: "u1",
      email: "ana@b.com",
      name: "Ana",
      mfaEnabled: true,
      mfaMethod: "email",
      mfaRecoveryCodesRemaining: 10,
      emailVerified: true,
    }),
    logout: vi.fn(),
    sendStepUpEmailCode: (...args: unknown[]) => sendStepUpEmailCode(...args),
  },
  passkeyApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../api/sessionsApi", () => ({
  sessionsApi: { stepUp: (...args: unknown[]) => stepUp(...args), list: vi.fn() },
}));

afterEach(() => vi.clearAllMocks());

describe("StepUpPanel - email method (specs/040)", () => {
  it("sends a code to the email and verifies with it", async () => {
    sendStepUpEmailCode.mockResolvedValue({ codeSent: true });
    stepUp.mockResolvedValue({ verifiedUntil: new Date(Date.now() + 300_000).toISOString() });
    const onVerified = vi.fn();
    render(
      <Providers>
        <StepUpPanel open onOpenChange={() => {}} onVerified={onVerified} />
      </Providers>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.security.stepUp.sendEmailCode") }),
    );
    await waitFor(() => expect(sendStepUpEmailCode).toHaveBeenCalled());
    expect(
      await screen.findByText(i18n.t("profile.security.stepUp.emailSent", { email: "ana@b.com" })),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText(i18n.t("profile.security.stepUp.emailCodeLabel")), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.stepUp.confirm") }),
    );
    await waitFor(() => expect(stepUp).toHaveBeenCalledWith({ method: "email", code: "123456" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalled());
  });
});
