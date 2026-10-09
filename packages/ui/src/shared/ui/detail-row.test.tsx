import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DetailRow } from "./detail-row";

describe("DetailRow", () => {
  it("renders label and value as static text", () => {
    render(<DetailRow label="Categoría" value="Comida" />);
    expect(screen.getByText("Categoría")).toBeDefined();
    expect(screen.getByText("Comida")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("becomes a button when interactive", () => {
    const onClick = vi.fn();
    render(<DetailRow label="Cuenta" value="Corriente" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", () => {
    const onClick = vi.fn();
    render(<DetailRow label="Tarjeta" value="—" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("prefers children over value", () => {
    render(
      <DetailRow label="Monto" value="ignored">
        <strong>$1.000</strong>
      </DetailRow>,
    );
    expect(screen.getByText("$1.000")).toBeDefined();
    expect(screen.queryByText("ignored")).toBeNull();
  });
});
