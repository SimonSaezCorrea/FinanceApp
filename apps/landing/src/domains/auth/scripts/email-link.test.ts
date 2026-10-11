// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { postLink } from "./email-link";
import { initResetPassword, passwordProblem } from "./reset-password";
import { initVerifyEmail } from "./verify-email";

const TOKEN = "A".repeat(43);

function statesRoot(extra = ""): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <div data-state="loading"></div>
    <div data-state="form" hidden>
      <form data-reset-form>
        <input name="password" />
        <input name="confirmation" />
        <p data-problem hidden data-too-short="short" data-mismatch="mismatch" data-error="down"></p>
        <button type="submit">save</button>
      </form>
    </div>
    <div data-state="success" hidden></div>
    <div data-state="invalid" hidden></div>
    <div data-state="error" hidden></div>
    ${extra}`;
  return root;
}

const visible = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("[data-state]")]
    .filter((el) => !el.hidden)
    .map((el) => el.dataset.state);

afterEach(() => vi.restoreAllMocks());

describe("verify-email page", () => {
  it("confirms with the link's token and shows success", async () => {
    const root = statesRoot();
    const post = vi.fn().mockResolvedValue("ok");
    await initVerifyEmail(root, `?token=${TOKEN}`, post);
    expect(post).toHaveBeenCalledWith("/auth/email/verify", { token: TOKEN });
    expect(visible(root)).toEqual(["success"]);
  });

  it("shows the invalid state for a refused link or a missing token", async () => {
    const refused = statesRoot();
    await initVerifyEmail(refused, `?token=${TOKEN}`, vi.fn().mockResolvedValue("invalid"));
    expect(visible(refused)).toEqual(["invalid"]);

    const missing = statesRoot();
    const post = vi.fn();
    await initVerifyEmail(missing, "", post);
    expect(post).not.toHaveBeenCalled();
    expect(visible(missing)).toEqual(["invalid"]);
  });

  it("says the API couldn't be reached", async () => {
    const root = statesRoot();
    await initVerifyEmail(root, `?token=${TOKEN}`, vi.fn().mockResolvedValue("error"));
    expect(visible(root)).toEqual(["error"]);
  });
});

describe("reset-password page", () => {
  function fill(root: HTMLElement, password: string, confirmation: string) {
    root.querySelector<HTMLInputElement>("[name=password]")!.value = password;
    root.querySelector<HTMLInputElement>("[name=confirmation]")!.value = confirmation;
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  }

  it("validates the passwords before sending anything", () => {
    expect(passwordProblem("short", "short")).toBe("tooShort");
    expect(passwordProblem("long-enough", "different")).toBe("mismatch");
    expect(passwordProblem("long-enough", "long-enough")).toBeNull();

    const root = statesRoot();
    const post = vi.fn();
    initResetPassword(root, `?token=${TOKEN}`, post);
    fill(root, "short", "short");
    expect(post).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>("[data-problem]")!.textContent).toBe("short");
  });

  it("sends the token with the new password and shows success", async () => {
    const root = statesRoot();
    const post = vi.fn().mockResolvedValue("ok");
    initResetPassword(root, `?token=${TOKEN}`, post);
    expect(visible(root)).toEqual(["form"]);
    fill(root, "Nuev4Clave!x", "Nuev4Clave!x");
    await vi.waitFor(() => expect(visible(root)).toEqual(["success"]));
    expect(post).toHaveBeenCalledWith("/auth/password/reset", {
      token: TOKEN,
      newPassword: "Nuev4Clave!x",
    });
  });

  it("shows the invalid state without a token or for a refused link", async () => {
    const missing = statesRoot();
    initResetPassword(missing, "", vi.fn());
    expect(visible(missing)).toEqual(["invalid"]);

    const refused = statesRoot();
    initResetPassword(refused, `?token=${TOKEN}`, vi.fn().mockResolvedValue("invalid"));
    fill(refused, "Nuev4Clave!x", "Nuev4Clave!x");
    await vi.waitFor(() => expect(visible(refused)).toEqual(["invalid"]));
  });
});

describe("postLink", () => {
  it("tells a refused link apart from an unreachable API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "EMAIL_TOKEN_INVALID" } }), { status: 400 }),
    );
    expect(await postLink("/auth/email/verify", { token: TOKEN })).toBe("invalid");

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(await postLink("/auth/email/verify", { token: TOKEN })).toBe("ok");

    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await postLink("/auth/email/verify", { token: TOKEN })).toBe("error");
  });
});
