import {
  Banknote,
  Car,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  PawPrint,
  Plane,
  ShoppingCart,
  Tag,
  Tv,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { describe, expect, it } from "vitest";

import { categoryIcon } from "./categoryIcons";

describe("categoryIcon", () => {
  it("returns Tag for null category", () => {
    expect(categoryIcon(null)).toBe(Tag);
  });

  it("returns Tag for empty string", () => {
    expect(categoryIcon("")).toBe(Tag);
  });

  it("returns Tag for unknown category", () => {
    expect(categoryIcon("zzznomatch")).toBe(Tag);
  });

  it("matches supermarket keywords", () => {
    expect(categoryIcon("Supermercado")).toBe(ShoppingCart);
    expect(categoryIcon("mercado")).toBe(ShoppingCart);
    expect(categoryIcon("almacén local")).toBe(ShoppingCart);
  });

  it("matches food keywords", () => {
    expect(categoryIcon("Restaurant japonés")).toBe(UtensilsCrossed);
    expect(categoryIcon("Café")).toBe(UtensilsCrossed);
    expect(categoryIcon("comida rápida")).toBe(UtensilsCrossed);
  });

  it("matches transport keywords", () => {
    expect(categoryIcon("Metro Santiago")).toBe(Car);
    expect(categoryIcon("Uber")).toBe(Car);
    expect(categoryIcon("Taxi")).toBe(Car);
    expect(categoryIcon("Gasolina")).toBe(Car);
    expect(categoryIcon("Bencina")).toBe(Car);
  });

  it("matches health keywords", () => {
    expect(categoryIcon("Médico")).toBe(HeartPulse);
    expect(categoryIcon("Farmacia Cruz Verde")).toBe(HeartPulse);
    expect(categoryIcon("Salud mental")).toBe(HeartPulse);
  });

  it("matches rent keywords", () => {
    expect(categoryIcon("Arriendo mensual")).toBe(Home);
    expect(categoryIcon("Rent apartment")).toBe(Home);
  });

  it("matches streaming/subscriptions", () => {
    expect(categoryIcon("Netflix")).toBe(Tv);
    expect(categoryIcon("Spotify suscripción")).toBe(Tv);
    expect(categoryIcon("Streaming")).toBe(Tv);
  });

  it("matches salary/income keywords", () => {
    expect(categoryIcon("Sueldo julio")).toBe(Banknote);
    expect(categoryIcon("Salario")).toBe(Banknote);
    expect(categoryIcon("Ingreso freelance")).toBe(Banknote);
  });

  it("matches utility keywords", () => {
    expect(categoryIcon("Luz eléctrica")).toBe(Zap);
    expect(categoryIcon("Agua potable")).toBe(Zap);
    expect(categoryIcon("Gas natural")).toBe(Zap);
  });

  it("matches travel keywords", () => {
    expect(categoryIcon("Vuelo a Lima")).toBe(Plane);
    expect(categoryIcon("Hotel booking")).toBe(Plane);
    expect(categoryIcon("Viaje de verano")).toBe(Plane);
  });

  it("matches education keywords", () => {
    expect(categoryIcon("Colegio mensualidad")).toBe(GraduationCap);
    expect(categoryIcon("Universidad")).toBe(GraduationCap);
    expect(categoryIcon("Educación online")).toBe(GraduationCap);
  });

  it("matches gym/sport keywords", () => {
    expect(categoryIcon("Gym mensualidad")).toBe(Dumbbell);
    expect(categoryIcon("Deporte")).toBe(Dumbbell);
  });

  it("matches pet keywords", () => {
    expect(categoryIcon("Mascota veterinaria")).toBe(PawPrint);
  });

  it("matches gift keywords", () => {
    expect(categoryIcon("Regalo cumpleaños")).toBe(Gift);
    expect(categoryIcon("Birthday gift")).toBe(Gift);
  });

  it("is case-insensitive", () => {
    expect(categoryIcon("SUPERMERCADO")).toBe(ShoppingCart);
    expect(categoryIcon("NETFLIX")).toBe(Tv);
  });
});

describe("common Spanish categories all get a real icon", () => {
  // Falling through to the generic tag reads as "this category has no icon",
  // which is what the entertainment/shopping/home ones used to do.
  const named = [
    "Entretención",
    "Entretenimiento",
    "Compras",
    "Hogar",
    "Educación",
    "Supermercado",
    "Transporte",
    "Salud",
    "Internet",
    "Pago facturación",
  ];

  it("resolves each to something other than the fallback tag", () => {
    const fallback = categoryIcon(null);
    for (const category of named) {
      expect(categoryIcon(category), category).not.toBe(fallback);
    }
  });
});
