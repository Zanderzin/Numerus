import { useState, type CSSProperties, type ReactNode } from "react";
import { formatBRL, formatBRLSinal } from "../lib/currency";

// kpi tile — variants follow the painel design; `negative` flags a bad number
type KpiVariant = "dark" | "light" | "accent" | "negative";
const kpiBg: Record<KpiVariant, CSSProperties> = {
  dark: { background: "var(--nm-black)", color: "var(--nm-off-white)" },
  light: { background: "var(--nm-off-white)", color: "var(--nm-black)" },
  accent: { background: "var(--color-positive)", color: "var(--color-on-positive)" },
  negative: { background: "var(--color-negative)", color: "var(--color-on-negative)" },
};

export function KpiTile({ label, value, variant = "light" }: { label: string; value: string; variant?: KpiVariant }) {
  return (
    <div style={{ flex: "1 1 220px", border: "var(--nm-border-card)", padding: 18, display: "flex", flexDirection: "column", gap: 10, ...kpiBg[variant] }}>
      <span className="nm-eyebrow">{label}</span>
      <span style={{ fontSize: "var(--nm-size-kpi)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</span>
    </div>
  );
}

// card with section header bar
export function Card({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section style={{ border: "var(--nm-border-card)", background: "var(--nm-off-white)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", borderBottom: "4px solid var(--nm-black)", padding: "12px 16px", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em" }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>{title}</h2>
        {meta && <span>{meta}</span>}
      </header>
      <div style={{ padding: "18px 16px" }}>{children}</div>
    </section>
  );
}

// primary = green fill + hard shadow; secondary = black fill
export function Button({
  children,
  variant = "primary",
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        opacity: disabled ? 0.5 : 1,
        fontFamily: "var(--nm-font)",
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: "0.06em",
        padding: "12px 18px",
        border: "var(--nm-border-button)",
        background: primary ? "var(--nm-green)" : "var(--nm-black)",
        color: primary ? "var(--nm-black)" : "var(--nm-off-white)",
        boxShadow: primary ? "var(--nm-shadow)" : "none",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

// budget bar — black fill, red when over the cap (with ▲ and the excess, never color alone)
export function ProgressBar({ label, spent, cap }: { label: string; spent: number; cap: number }) {
  const over = spent > cap;
  const pct = Math.min(100, Math.round((spent / cap) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {label}
          {over && <Badge tom="negativo">▲ ACIMA {formatBRLSinal(spent - cap)}</Badge>}
        </span>
        <span>{formatBRL(spent)} / {formatBRL(cap)}</span>
      </div>
      <div style={{ height: 16, border: "var(--nm-border-row)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: over ? "var(--color-negative)" : "var(--nm-black)" }} />
      </div>
    </div>
  );
}

type Tom = "neutro" | "escuro" | "positivo" | "negativo";
const badgeCor: Record<Tom, CSSProperties> = {
  neutro: { background: "transparent", color: "var(--nm-black)" },
  escuro: { background: "var(--nm-black)", color: "var(--nm-off-white)" },
  positivo: { background: "var(--color-positive)", color: "var(--color-on-positive)" },
  negativo: { background: "var(--color-negative)", color: "var(--color-on-negative)" },
};

// `dark` kept as a shortcut for tom="escuro"
export function Badge({ children, dark, tom }: { children: ReactNode; dark?: boolean; tom?: Tom }) {
  return (
    <span
      style={{
        border: "var(--nm-border-row)",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.1em",
        padding: "2px 6px",
        whiteSpace: "nowrap",
        ...badgeCor[tom ?? (dark ? "escuro" : "neutro")],
      }}
    >
      {children}
    </span>
  );
}

// signed change chip: arrow shows direction, color shows good/bad.
// `inverter` when going up is bad (e.g. spend over budget).
// the text always carries ▲/▼ and +/−, so it reads without color (colorblind-safe).
export function Variacao({ valor, texto, inverter = false }: { valor: number; texto: string; inverter?: boolean }) {
  const zero = valor === 0 || /^[^1-9]*$/.test(texto); // "0,0%" or "R$ 0,00" count as flat
  const bom = zero ? null : inverter ? valor < 0 : valor > 0;
  const seta = zero ? "■" : valor > 0 ? "▲" : "▼";
  const leitura = zero ? "estável" : bom ? "positivo" : "negativo";
  return (
    <span
      aria-label={`${leitura}: ${texto}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: "var(--nm-border-row)",
        padding: "1px 6px",
        fontWeight: 800,
        whiteSpace: "nowrap",
        ...badgeCor[bom === null ? "neutro" : bom ? "positivo" : "negativo"],
      }}
    >
      <span aria-hidden>{seta}</span>
      <span aria-hidden>{texto}</span>
    </span>
  );
}

export function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <header className="nm-page-header">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="nm-eyebrow">{eyebrow}</span>
        <h1 className="nm-h1">{title}</h1>
      </div>
      {action}
    </header>
  );
}

// two-step delete: EXCLUIR → CONFIRMAR? / NÃO
export function ConfirmarExclusao({ rotulo, onConfirmar }: { rotulo: string; onConfirmar: () => void }) {
  const [perguntando, setPerguntando] = useState(false);
  if (!perguntando) {
    return <button className="nm-icon-btn" onClick={() => setPerguntando(true)} aria-label={`Excluir ${rotulo}`}>EXCLUIR</button>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} role="group" aria-label={`Confirmar exclusão de ${rotulo}`}>
      <button className="nm-icon-btn nm-icon-btn-perigo" onClick={onConfirmar} autoFocus>CONFIRMAR</button>
      <button className="nm-icon-btn" onClick={() => setPerguntando(false)}>NÃO</button>
    </span>
  );
}
