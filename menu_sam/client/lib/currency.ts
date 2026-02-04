export function formatDh(amount: number): string {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace("MAD", "DH")
    .replace(/\s+/g, " ")
    .trim();
}
