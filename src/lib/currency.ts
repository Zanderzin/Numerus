// formats numbers as brazilian real: 1284.5 -> "R$ 1.284,50"
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number): string {
  // intl uses a non-breaking space after R$; normalize to a regular space
  return brl.format(value).replace(/\u00a0/g, " ");
}

// typographic minus, so "\u2212" and "+" have the same width
export const MENOS = "\u2212";

const sinal = (v: number) => (v > 0 ? "+" : v < 0 ? MENOS : "");

// 1200 -> "+R$ 1.200,00", -300 -> "\u2212R$ 300,00"
export function formatBRLSinal(value: number): string {
  return sinal(value) + formatBRL(Math.abs(value));
}

// fraction -> signed percent: 0.123 -> "+12,3%"
export function formatPctSinal(fracao: number, casas = 1): string {
  const pct = Math.abs(fracao * 100);
  const abs = pct.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  // a value that rounds to zero shows no sign
  const zero = Math.round(pct * 10 ** casas) === 0;
  return (zero ? "" : sinal(fracao)) + abs + "%";
}
