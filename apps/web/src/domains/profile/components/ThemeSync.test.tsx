import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../../theme/ThemeProvider";
import { useTheme } from "../../../theme/useTheme";
import { ThemeSync } from "./ThemeSync";

const updatePreferences = vi.fn().mockResolvedValue(undefined);
let mockUser: { theme: "dark" | "light" | "system" } | null = null;

vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, refreshUser: vi.fn(), clearUser: vi.fn() }),
}));
vi.mock("../api/profileApi", () => ({
  profileApi: { updatePreferences: (...args: unknown[]) => updatePreferences(...args) },
}));

function Probe() {
  const { mode, setMode } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => setMode("light")}>set-light</button>
    </div>
  );
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ThemeSync", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    updatePreferences.mockClear();
  });
  afterEach(() => {
    localStorage.clear();
    mockUser = null;
  });

  it("adopts the backend's theme over the local default on first load", async () => {
    mockUser = { theme: "light" };
    const { getByTestId } = renderWithClient(
      <ThemeProvider>
        <ThemeSync />
        <Probe />
      </ThemeProvider>,
    );
    // Local default is "dark" (no localStorage); the backend's "light" wins once ThemeSync mounts.
    await act(() => Promise.resolve());
    expect(getByTestId("mode").textContent).toBe("light");
  });

  it("pushes a local theme change to the backend after the initial sync", async () => {
    mockUser = { theme: "dark" };
    const { getByText } = renderWithClient(
      <ThemeProvider>
        <ThemeSync />
        <Probe />
      </ThemeProvider>,
    );
    await act(() => Promise.resolve()); // let the initial-sync effect settle
    await act(async () => {
      getByText("set-light").click();
      await Promise.resolve();
    });
    expect(updatePreferences).toHaveBeenCalledWith({ theme: "light" });
  });
});
