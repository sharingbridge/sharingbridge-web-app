/** Formats catalog amounts using the ISO 4217 code from the API/DB. */
export function formatCatalogPrice(
  amount: number | null | undefined,
  currencyCode?: string | null
): string {
  if (amount == null || Number.isNaN(Number(amount))) {
    return "";
  }
  const n = Math.round(Number(amount));
  const code = (currencyCode ?? "").trim().toUpperCase();
  if (!code) {
    return String(n);
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    }).format(n);
  } catch {
    return `${code} ${n}`;
  }
}
