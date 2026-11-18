// browser side of the pluggy integration: talks to the /api/pluggy routes
// served by vite (server/pluggy.ts) and maps pluggy data into `Dados`.
import { CATEGORIAS, OUTROS, type Conexao, type Conta, type Dados, type Transacao } from "./data";

export const PERIODOS = [30, 90, 180, 365] as const;
export type Periodo = (typeof PERIODOS)[number];

export const rotuloPeriodo = (dias: number) => (dias === 365 ? "12 MESES" : `${dias} DIAS`);

type PluggyConta = { id: string; name: string; marketingName?: string | null; type: string; balance: number; instituicao?: string; itemId?: string };
type PluggyTransacao = {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: "DEBIT" | "CREDIT";
  category?: string | null;
  accountId: string;
};

export type ItemInfo = { id: string; instituicao: string; imagem: string | null };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/pluggy/${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.erro ?? `Erro ${res.status}`);
  return body as T;
}

export async function pluggyConfigurado(): Promise<boolean> {
  try {
    return (await api<{ configurado: boolean }>("status")).configurado;
  } catch {
    return false;
  }
}

export async function criarConnectToken(itemId?: string): Promise<string> {
  const { accessToken } = await api<{ accessToken: string }>("connect-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(itemId ? { itemId } : {}),
  });
  return accessToken;
}

const isoDia = (d: Date) => d.toISOString().slice(0, 10);

type RespostaDados = { item: ItemInfo; contas: PluggyConta[]; transacoes: PluggyTransacao[] };

// loads every connected item in parallel and merges them into one `Dados`.
// a failing item doesn't hide the others: its error is returned in `erros`.
export async function carregarDadosPluggy(itemIds: string[], dias: Periodo): Promise<{ dados: Dados; erros: string[] }> {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - dias);
  const resultados = await Promise.allSettled(
    itemIds.map((itemId) => api<RespostaDados>(`dados?${new URLSearchParams({ itemId, from: isoDia(inicio), to: isoDia(hoje) })}`)),
  );
  const ok = resultados.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const erros = resultados.flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []));
  if (ok.length === 0) throw new Error(erros[0] ?? "Nenhuma conexão respondeu.");
  const contas = ok.flatMap((r) => r.contas.map((c) => ({ ...c, instituicao: r.item.instituicao, itemId: r.item.id })));
  const conexoes: Conexao[] = ok.map((r) => ({ id: r.item.id, instituicao: r.item.instituicao }));
  return { dados: mapear(contas, ok.flatMap((r) => r.transacoes), dias, conexoes), erros };
}

// ---- mapping ----

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// money moving between the user's own accounts / paying the card bill is not spend
const IGNORAR = /same person|mesma titularidade|credit card payment|pagamento de fatura|pagto fatura|fatura do cartao|investment|aplicacao|resgate/;

// pluggy categories (english, from the enrichment) + description keywords → app categories
const REGRAS: [string, RegExp][] = [
  ["mercado", /grocer|supermarket|supermercado|mercado|padaria|bakery|feira|hortifruti/],
  ["moradia", /rent|housing|aluguel|condominio|utilities|electricity|energia|water|agua|internet|telecom|gas bill/],
  ["transporte", /transport|taxi|ride|uber|99app|fuel|gas station|combustivel|posto|parking|estacionamento|toll|pedagio|vehicle|automotive/],
  ["saude", /health|pharmac|farmacia|drogaria|medical|hospital|dentist|clinic|laborator|saude/],
  ["lazer", /leisure|entertainment|restaurant|eating out|food|bar|cinema|streaming|travel|viagem|hotel|airline|shopping|games|lazer|ifood/],
];

function categorizar(t: PluggyTransacao): string {
  const texto = norm(`${t.category ?? ""} ${t.description}`);
  return REGRAS.find(([, re]) => re.test(texto))?.[0] ?? OUTROS.id;
}

function mapear(contas: PluggyConta[], brutas: PluggyTransacao[], dias: Periodo, conexoes: Conexao[]): Dados {
  const tipoConta = new Map(contas.map((c) => [c.id, c.type]));
  const validas = brutas.filter((t) => !IGNORAR.test(norm(`${t.category ?? ""} ${t.description}`)));

  // on credit cards a charge comes as DEBIT too; `type` is the reliable signal
  const transacoes: Transacao[] = validas
    .filter((t) => t.type === "DEBIT")
    .map((t) => ({
      id: t.id,
      data: t.date.slice(0, 10),
      descricao: t.description.toUpperCase(),
      categoria: categorizar(t),
      valor: Math.abs(t.amount),
      source: "api" as const,
      conta: t.accountId,
    }));

  const renda = validas
    .filter((t) => t.type === "CREDIT" && tipoConta.get(t.accountId) === "BANK")
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const mapContas: Conta[] = contas.map((c) => ({
    id: c.id,
    nome: (c.marketingName || c.name).toUpperCase(),
    tipo: c.type === "CREDIT" ? "CREDIT" : "BANK",
    saldo: c.balance,
    instituicao: c.instituicao,
    itemId: c.itemId,
  }));

  // average over the span that actually has data, so a 12-month window
  // with only 3 months of history isn't divided by 12
  const maisAntiga = validas.reduce((min, t) => (t.date < min ? t.date : min), new Date().toISOString());
  const diasComDados = Math.min(dias, Math.max(1, (Date.now() - Date.parse(maisAntiga)) / 864e5));
  const meses = Math.max(1, Math.round((diasComDados / 30.4) * 10) / 10);

  return {
    origem: "pluggy",
    periodo: `ÚLTIMOS ${rotuloPeriodo(dias)} · PLUGGY SANDBOX`,
    meses,
    renda: Math.round((renda / meses) * 100) / 100,
    categorias: [...CATEGORIAS, OUTROS],
    transacoes,
    contas: mapContas,
    conexoes,
  };
}
