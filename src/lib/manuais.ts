// manual transactions (source = "manual"): the pluggy sandbox is read-only, so
// extra test data and anything the bank doesn't see is typed in here and merged
// with the api data before any screen or analysis reads it.
import { CATEGORIAS, OUTROS, type Dados, type Transacao } from "./data";

export type TipoTransacao = "despesa" | "receita" | "aporte";

export type TransacaoManual = {
  id: string;
  data: string; // yyyy-mm-dd
  descricao: string;
  valor: number; // always positive; `tipo` says the direction
  tipo: TipoTransacao; // aporte = money moved into investments: neither spend nor income
  categoria: string; // Categoria.id (only meaningful for despesa)
  conta: string; // account name, free text
  source: "manual";
};

const KEY = "numerus.transacoes.manuais";

export function carregarTransacoesManuais(): TransacaoManual[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TransacaoManual[]) : [];
  } catch {
    return [];
  }
}

export function salvarTransacoesManuais(lista: TransacaoManual[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lista));
  } catch {
    // storage unavailable — manual entries just won't persist
  }
}

// local calendar day (toISOString would be utc: after 21h in brazil it is already tomorrow)
export const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type CamposTransacao = { data: string; descricao: string; valor: string; tipo: TipoTransacao; categoria: string; conta: string };

export function validarTransacao(f: CamposTransacao, hoje = new Date()): string[] {
  const erros: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) erros.push("Informe a data.");
  else if (f.data > isoLocal(hoje)) erros.push("A data não pode estar no futuro.");
  if (!f.descricao.trim()) erros.push("Informe a descrição.");
  if (!(Number(f.valor) > 0)) erros.push("O valor precisa ser maior que zero.");
  if (!f.conta.trim()) erros.push("Informe a conta.");
  return erros;
}

// merges manual entries inside the analysis window into the api (or sample) data.
// with no bank connected, manual data replaces the sample data instead of mixing with it.
export function mesclarManuais(base: Dados, manuais: TransacaoManual[], dias: number, hoje = new Date()): Dados {
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - dias);
  const janela = manuais.filter((t) => t.data >= isoLocal(inicio) && t.data <= isoLocal(hoje));
  const semBanco = base.origem === "exemplo";
  if (manuais.length === 0 || (!semBanco && janela.length === 0)) return base;
  const rotulo = dias === 365 ? "12 MESES" : `${dias} DIAS`;
  const ponto: Dados = semBanco
    ? { origem: "manual", periodo: `ÚLTIMOS ${rotulo} · MANUAL`, meses: 1, renda: 0, categorias: [...CATEGORIAS, OUTROS], transacoes: [], contas: [] }
    : { ...base, periodo: janela.length ? `${base.periodo} + MANUAL` : base.periodo };

  const despesas: Transacao[] = janela
    .filter((t) => t.tipo === "despesa")
    .map((t) => ({ id: t.id, data: t.data, descricao: t.descricao.toUpperCase(), categoria: t.categoria, valor: t.valor, source: "manual", conta: t.conta }));
  const receitas = janela.filter((t) => t.tipo === "receita").reduce((s, t) => s + t.valor, 0);

  const transacoes = [...ponto.transacoes, ...despesas];
  // income is kept as a monthly average, so undo the base average, add, and re-average
  // over the span that now has data (same rule as the pluggy mapping)
  const rendaTotal = ponto.renda * ponto.meses + receitas;
  const maisAntiga = janela.reduce((min, t) => (t.data < min ? t.data : min), isoLocal(hoje));
  const diasManuais = (hoje.getTime() - Date.parse(maisAntiga)) / 864e5;
  // the span only grows when a manual entry is older than what the api already covers
  const diasBase = semBanco ? 0 : ponto.meses * 30.4;
  const diasComDados = Math.min(dias, Math.max(1, diasBase, diasManuais));
  const meses = Math.max(1, Math.round((diasComDados / 30.4) * 10) / 10);

  const temOutros = ponto.categorias.some((c) => c.id === OUTROS.id);
  const categorias = temOutros ? ponto.categorias : [...ponto.categorias, OUTROS];

  return { ...ponto, categorias, transacoes, meses, renda: Math.round((rendaTotal / meses) * 100) / 100 };
}
