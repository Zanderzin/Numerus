// consolidated portfolio: investments from every pluggy connection plus manual
// entries (brokers that aren't connected), normalized into one model.
import { useCallback, useEffect, useState } from "react";
import { useFinancas } from "./financas";
import { api, type ItemInfo } from "./pluggy";

export type TipoAtivo = "renda_fixa" | "tesouro" | "acoes" | "fii" | "fundos" | "previdencia" | "cripto" | "outros";

export const TIPOS: { id: TipoAtivo; label: string }[] = [
  { id: "renda_fixa", label: "RENDA FIXA" },
  { id: "tesouro", label: "TESOURO" },
  { id: "acoes", label: "AÇÕES / ETF" },
  { id: "fii", label: "FII" },
  { id: "fundos", label: "FUNDOS" },
  { id: "previdencia", label: "PREVIDÊNCIA" },
  { id: "cripto", label: "CRIPTO" },
  { id: "outros", label: "OUTROS" },
];

export const rotuloTipo = (t: TipoAtivo) => TIPOS.find((x) => x.id === t)?.label ?? "OUTROS";

export type Investimento = {
  id: string;
  nome: string;
  instituicao: string;
  tipo: TipoAtivo;
  aplicado: number | null; // amount originally invested, when known
  saldo: number; // current gross balance
  rentabilidade: number | null; // fraction: 0.12 = +12%
  rentabilidadeFonte: "calculada" | "12m" | null; // computed from amounts, or the provider's 12-month rate
  vencimento: string | null; // yyyy-mm-dd
  origem: "api" | "manual";
};

// what the user types for a broker that isn't connected
export type InvestimentoManual = {
  id: string;
  nome: string;
  instituicao: string;
  tipo: TipoAtivo;
  aplicado: number;
  saldo: number;
  vencimento: string | null;
};

// ---- pluggy → internal model ----

type PluggyInvestimento = {
  id: string;
  name: string;
  type: string;
  subtype?: string | null;
  balance?: number | null;
  amount?: number | null;
  amountOriginal?: number | null;
  lastTwelveMonthsRate?: number | null;
  dueDate?: string | null;
  status?: string | null;
};

function tipoPluggy(i: PluggyInvestimento): TipoAtivo {
  const sub = (i.subtype ?? "").toUpperCase();
  if (/bitcoin|btc|ethereum|cripto|crypto/i.test(i.name)) return "cripto";
  switch (i.type) {
    case "FIXED_INCOME":
      return sub === "TREASURY" ? "tesouro" : "renda_fixa";
    case "MUTUAL_FUND":
      return "fundos";
    case "EQUITY":
      return sub === "REAL_ESTATE_FUND" ? "fii" : "acoes";
    case "ETF":
      return "acoes";
    case "SECURITY":
      return /RETIREMENT|PGBL|VGBL/.test(sub) ? "previdencia" : "outros";
    default:
      return "outros";
  }
}

export function rentabilidadeDe(aplicado: number | null, saldo: number): number | null {
  return aplicado && aplicado > 0 ? saldo / aplicado - 1 : null;
}

export function normalizarPluggy(i: PluggyInvestimento, instituicao: string): Investimento {
  const saldo = i.balance ?? i.amount ?? 0;
  const aplicado = i.amountOriginal && i.amountOriginal > 0 ? i.amountOriginal : null;
  const calculada = rentabilidadeDe(aplicado, saldo);
  // without the invested amount, fall back to the provider's 12-month rate (given in percent)
  const doze = typeof i.lastTwelveMonthsRate === "number" ? i.lastTwelveMonthsRate / 100 : null;
  return {
    id: i.id,
    nome: i.name,
    instituicao,
    tipo: tipoPluggy(i),
    aplicado,
    saldo,
    rentabilidade: calculada ?? doze,
    rentabilidadeFonte: calculada !== null ? "calculada" : doze !== null ? "12m" : null,
    vencimento: i.dueDate ? i.dueDate.slice(0, 10) : null,
    origem: "api",
  };
}

export function normalizarManual(m: InvestimentoManual): Investimento {
  const rentabilidade = rentabilidadeDe(m.aplicado, m.saldo);
  return { ...m, rentabilidade, rentabilidadeFonte: rentabilidade === null ? null : "calculada", origem: "manual" };
}

export async function carregarInvestimentosPluggy(itemIds: string[]): Promise<{ lista: Investimento[]; erros: string[] }> {
  const r = await Promise.allSettled(itemIds.map((id) => api<{ item: ItemInfo; investimentos: PluggyInvestimento[] }>(`investimentos?itemId=${encodeURIComponent(id)}`)));
  const lista = r.flatMap((x) =>
    x.status === "fulfilled"
      ? x.value.investimentos
          .filter((i) => i.status !== "TOTAL_WITHDRAWAL") // fully redeemed: nothing left to show
          .map((i) => normalizarPluggy(i, x.value.item.instituicao.toUpperCase()))
      : [],
  );
  const erros = r.flatMap((x) => (x.status === "rejected" ? [x.reason instanceof Error ? x.reason.message : String(x.reason)] : []));
  return { lista, erros };
}

// ---- manual entries (localStorage, like goals) ----

const KEY = "numerus.investimentos.manuais";

export function carregarManuais(): InvestimentoManual[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InvestimentoManual[]) : [];
  } catch {
    return [];
  }
}

export function salvarManuais(lista: InvestimentoManual[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lista));
  } catch {
    // storage unavailable — manual entries just won't persist
  }
}

// ---- summaries ----

export type Fatia = { chave: string; label: string; saldo: number; pct: number };

export type Resumo = {
  total: number; // patrimônio investido
  aplicado: number; // invested, only over assets where it is known
  rentabilidade: number | null; // over the assets with a known invested amount
  porInstituicao: Fatia[];
  porTipo: Fatia[];
};

function fatias(lista: Investimento[], chave: (i: Investimento) => string, label: (k: string) => string, total: number): Fatia[] {
  const m = new Map<string, number>();
  for (const i of lista) m.set(chave(i), (m.get(chave(i)) ?? 0) + i.saldo);
  return [...m.entries()]
    .map(([k, saldo]) => ({ chave: k, label: label(k), saldo, pct: total ? saldo / total : 0 }))
    .sort((a, b) => b.saldo - a.saldo);
}

export function resumir(lista: Investimento[]): Resumo {
  const total = lista.reduce((s, i) => s + i.saldo, 0);
  const comBase = lista.filter((i) => i.aplicado !== null);
  const aplicado = comBase.reduce((s, i) => s + (i.aplicado ?? 0), 0);
  const saldoComBase = comBase.reduce((s, i) => s + i.saldo, 0);
  return {
    total,
    aplicado,
    rentabilidade: aplicado > 0 ? saldoComBase / aplicado - 1 : null,
    porInstituicao: fatias(lista, (i) => i.instituicao, (k) => k, total),
    porTipo: fatias(lista, (i) => i.tipo, (k) => rotuloTipo(k as TipoAtivo), total),
  };
}

// ---- hook: api + manual, with loading / error state ----

export type EstadoCarteira = "carregando" | "pronto" | "erro";

export function useCarteira() {
  const { itemIds, versao } = useFinancas();
  const [api_, setApi] = useState<Investimento[]>([]);
  const [manuais, setManuaisState] = useState<InvestimentoManual[]>(carregarManuais);
  const [estado, setEstado] = useState<EstadoCarteira>(itemIds.length ? "carregando" : "pronto");
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const chave = itemIds.join(",");

  useEffect(() => {
    const ids = chave ? chave.split(",") : [];
    if (ids.length === 0) {
      setApi([]);
      setEstado("pronto");
      setErro(null);
      return;
    }
    let ativo = true;
    setEstado("carregando");
    setErro(null);
    carregarInvestimentosPluggy(ids)
      .then(({ lista, erros }) => {
        if (!ativo) return;
        setApi(lista);
        // every connection failed → error state; some failed → data + warning
        if (erros.length === ids.length) {
          setEstado("erro");
          setErro(erros[0]);
        } else {
          setEstado("pronto");
          setErro(erros.length ? `${erros.length} conexão(ões) não responderam: ${erros.join(" · ")}` : null);
        }
      })
      .catch((e: Error) => {
        if (!ativo) return;
        setEstado("erro");
        setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [chave, versao, recarga]);

  const setManuais = useCallback((f: (l: InvestimentoManual[]) => InvestimentoManual[]) => {
    setManuaisState((atual) => {
      const novo = f(atual);
      salvarManuais(novo);
      return novo;
    });
  }, []);

  const lista = [...api_, ...manuais.map(normalizarManual)];
  return { lista, manuais, setManuais, estado, erro, conectado: itemIds.length > 0, recarregar: () => setRecarga((r) => r + 1) };
}
