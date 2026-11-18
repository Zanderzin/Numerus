// data model + sample data. pages read a `Dados` from the FinancasProvider,
// which is either DADOS_EXEMPLO or data mapped from a pluggy connection.

export type Categoria = {
  id: string;
  label: string;
  cap: number; // teto mensal
  fixa: boolean; // fixed costs (rent etc.) are not suggested for cuts
};

export type Transacao = {
  id: string;
  data: string; // yyyy-mm-dd
  descricao: string;
  categoria: string; // Categoria.id
  valor: number; // always positive (it's a spend)
  source: "api" | "manual";
  conta?: string; // Conta.id or a free-text account name for manual entries
};

export type Conta = {
  id: string;
  nome: string;
  tipo: "BANK" | "CREDIT";
  saldo: number;
  instituicao?: string;
  itemId?: string; // pluggy item the account came from
};

export type Conexao = { id: string; instituicao: string };

export type Dados = {
  origem: "exemplo" | "pluggy" | "manual"; // manual = only manual entries, no bank connected
  periodo: string; // label shown in page headers
  meses: number; // months covered; spend and income below are compared as monthly averages
  renda: number; // média mensal
  categorias: Categoria[];
  transacoes: Transacao[];
  contas: Conta[];
  conexoes?: Conexao[]; // pluggy items behind this data
};

export const CATEGORIAS: Categoria[] = [
  { id: "mercado", label: "MERCADO", cap: 1000, fixa: false },
  { id: "moradia", label: "MORADIA", cap: 1450, fixa: true },
  { id: "transporte", label: "TRANSPORTE", cap: 400, fixa: false },
  { id: "lazer", label: "LAZER", cap: 350, fixa: false },
  { id: "saude", label: "SAÚDE", cap: 300, fixa: false },
];

// catch-all for spends no rule recognizes
export const OUTROS: Categoria = { id: "outros", label: "OUTROS", cap: 500, fixa: false };

export const DADOS_EXEMPLO: Dados = {
  origem: "exemplo",
  periodo: "NOVEMBRO",
  meses: 1,
  renda: 5200,
  categorias: CATEGORIAS,
  contas: [],
  transacoes: [
    { id: "t1", data: "2026-11-01", descricao: "ALUGUEL", categoria: "moradia", valor: 1200, source: "api" },
    { id: "t2", data: "2026-11-01", descricao: "CONDOMÍNIO", categoria: "moradia", valor: 250, source: "api" },
    { id: "t3", data: "2026-11-02", descricao: "SUPERMERCADO", categoria: "mercado", valor: 412.3, source: "api" },
    { id: "t4", data: "2026-11-03", descricao: "UBER", categoria: "transporte", valor: 38.9, source: "api" },
    { id: "t5", data: "2026-11-03", descricao: "CINEMA", categoria: "lazer", valor: 64, source: "api" },
    { id: "t6", data: "2026-11-04", descricao: "FARMÁCIA", categoria: "saude", valor: 87.5, source: "api" },
    { id: "t7", data: "2026-11-05", descricao: "COMBUSTÍVEL", categoria: "transporte", valor: 221.1, source: "api" },
    { id: "t8", data: "2026-11-06", descricao: "FEIRA", categoria: "mercado", valor: 96.4, source: "api" },
    { id: "t9", data: "2026-11-07", descricao: "RESTAURANTE", categoria: "lazer", valor: 182, source: "api" },
    { id: "t10", data: "2026-11-07", descricao: "PADARIA", categoria: "mercado", valor: 41.3, source: "api" },
    { id: "t11", data: "2026-11-08", descricao: "SHOW", categoria: "lazer", valor: 139, source: "api" },
    { id: "t12", data: "2026-11-08", descricao: "CONSULTA", categoria: "saude", valor: 62.5, source: "api" },
    { id: "t13", data: "2026-11-09", descricao: "ESTACIONAMENTO", categoria: "transporte", valor: 50, source: "api" },
    { id: "t14", data: "2026-11-09", descricao: "SUPERMERCADO", categoria: "mercado", valor: 270, source: "api" },
  ],
};

export type ResumoCategoria = Categoria & {
  spent: number; // média mensal — comparable with the monthly cap
  total: number; // soma no período
  transacoes: Transacao[];
};

const cent = (v: number) => Math.round(v * 100) / 100;

// groups transactions by category, biggest spend first
export function resumoPorCategoria(d: Dados): ResumoCategoria[] {
  return d.categorias
    .map((c) => {
      const transacoes = d.transacoes.filter((t) => t.categoria === c.id).sort((a, b) => b.data.localeCompare(a.data));
      const total = cent(transacoes.reduce((s, t) => s + t.valor, 0));
      return { ...c, spent: cent(total / d.meses), total, transacoes };
    })
    .sort((a, b) => b.spent - a.spent);
}

// sum over the whole period
export function totalPeriodo(d: Dados): number {
  return d.transacoes.reduce((s, t) => s + t.valor, 0);
}

// monthly average — what the caps are compared against
export function totalGasto(d: Dados): number {
  return totalPeriodo(d) / d.meses;
}

// spend per calendar month (yyyy-mm), oldest first
export function gastoPorMes(d: Dados): { mes: string; total: number }[] {
  const m = new Map<string, number>();
  for (const t of d.transacoes) m.set(t.data.slice(0, 7), (m.get(t.data.slice(0, 7)) ?? 0) + t.valor);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, total]) => ({ mes, total: cent(total) }));
}

export function totalTeto(d: Dados): number {
  return d.categorias.reduce((s, c) => s + c.cap, 0);
}
