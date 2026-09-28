import { describe, expect, it } from "vitest";
import { formatCatalogPrice } from "./formatCatalogPrice";

describe("formatCatalogPrice", () => {
  it("formats using the currency code from the API/DB via Intl", () => {
    expect(formatCatalogPrice(120, "INR")).toMatch(/120/);
    expect(formatCatalogPrice(120, "INR")).toMatch(/₹|INR/);
    expect(formatCatalogPrice(12, "USD")).toMatch(/12/);
    expect(formatCatalogPrice(12, "usd")).toMatch(/\$|USD/);
  });

  it("does not invent a currency when code is missing", () => {
    expect(formatCatalogPrice(45)).toBe("45");
    expect(formatCatalogPrice(45, "")).toBe("45");
    expect(formatCatalogPrice(45, null)).toBe("45");
  });

  it("returns empty for null amount", () => {
    expect(formatCatalogPrice(null)).toBe("");
    expect(formatCatalogPrice(undefined)).toBe("");
  });
});
