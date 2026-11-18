// dev-only seed: ~6 months of realistic manual transactions and a few manual
// investments, so screens and analyses have data beyond the read-only sandbox.
// only imported behind `import.meta.env.DEV`, so it never ships in the production bundle.
import { carregarManuais, salvarManuais, type InvestimentoManual } from "../lib/carteira";
import { carregarTransacoesManuais, isoLocal, salvarTransacoesManuais, type TipoTransacao, type TransacaoManual } from "../lib/manuais";

const PREFIXO = "seed-"; // seeded rows are tagged so clearing never touches the user's own entries

// small deterministic prng (mulberry32): same seed → same data, easy to compare runs
function prng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gerarSeed(hoje = new Date(), semente = 42): { transacoes: TransacaoManual[]; investimentos: InvestimentoManual[] } {
  const rnd = prng(semente);
  const entre = (min: number, max: number) => Math.round((min + rnd() * (max - min)) * 100) / 100;
  const inteiro = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1));
  const hojeIso = isoLocal(hoje);
  const transacoes: TransacaoManual[] = [];
  let n = 0;

  const add = (data: Date, descricao: string, valor: number, tipo: TipoTransacao, categoria: string, conta: string) => {
    const iso = isoLocal(data);
    if (iso > hojeIso) return; // never in the future
    transacoes.push({ id: `${PREFIXO}t${++n}`, data: iso, descricao, valor, tipo, categoria, conta, source: "manual" });
  };

  // 5 full months + the current one: every seeded month fits inside the 180-day window,
  // so the ml never sees a half-filled first month
  for (let k = 5; k >= 0; k--) {
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() - k;
    const dia = (d: number) => new Date(ano, mes, d);
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const qualquerDia = () => dia(inteiro(1, ultimoDia));

    // income
    add(dia(5), "SALÁRIO ACME LTDA", 6800, "receita", "outros", "NUBANK");
    if (rnd() < 0.35) add(dia(inteiro(15, 25)), "FREELA DESIGN", entre(900, 1600), "receita", "outros", "NUBANK");

    // fixed costs
    add(dia(5), "ALUGUEL", 820, "despesa", "moradia", "NUBANK");
    add(dia(10), "CONDOMÍNIO", 260, "despesa", "moradia", "NUBANK");
    add(dia(12), "INTERNET FIBRA", 99.9, "despesa", "moradia", "NUBANK");
    add(dia(15), "ENERGIA ELÉTRICA", entre(110, 170), "despesa", "moradia", "NUBANK");

    // subscriptions
    add(dia(8), "NETFLIX", 55.9, "despesa", "lazer", "CARTÃO NUBANK");
    add(dia(8), "SPOTIFY", 21.9, "despesa", "lazer", "CARTÃO NUBANK");
    add(dia(9), "ICLOUD", 14.9, "despesa", "outros", "CARTÃO NUBANK");
    add(dia(3), "ACADEMIA", 119.9, "despesa", "saude", "CARTÃO NUBANK");

    // variable spend
    for (let i = inteiro(4, 6); i > 0; i--) add(qualquerDia(), "SUPERMERCADO", entre(50, 260), "despesa", "mercado", "CARTÃO NUBANK");
    for (let i = inteiro(5, 8); i > 0; i--) add(qualquerDia(), "PADARIA", entre(10, 30), "despesa", "mercado", "CARTÃO NUBANK");
    for (let i = inteiro(4, 7); i > 0; i--) add(qualquerDia(), "UBER", entre(15, 40), "despesa", "transporte", "CARTÃO NUBANK");
    add(qualquerDia(), "COMBUSTÍVEL", entre(150, 220), "despesa", "transporte", "CARTÃO NUBANK");
    for (let i = inteiro(1, 3); i > 0; i--) add(qualquerDia(), "RESTAURANTE", entre(50, 140), "despesa", "lazer", "CARTÃO NUBANK");
    for (let i = inteiro(2, 4); i > 0; i--) add(qualquerDia(), "IFOOD", entre(30, 65), "despesa", "lazer", "CARTÃO NUBANK");
    for (let i = inteiro(1, 2); i > 0; i--) add(qualquerDia(), "FARMÁCIA", entre(25, 140), "despesa", "saude", "CARTÃO NUBANK");

    // one heavy month, so over-budget states show up
    if (k === 2) add(dia(18), "PASSAGEM AÉREA", 1420, "despesa", "lazer", "CARTÃO NUBANK");

    // monthly investment transfer: not a spend, not income
    add(dia(6), "APORTE TESOURO SELIC", 800, "aporte", "outros", "NUBANK");
  }

  const investimentos: InvestimentoManual[] = [
    { id: `${PREFIXO}i1`, nome: "Tesouro Selic 2029", instituicao: "XP", tipo: "tesouro", aplicado: 4800, saldo: 4951.6, vencimento: "2029-03-01" },
    { id: `${PREFIXO}i2`, nome: "CDB 110% CDI", instituicao: "BTG", tipo: "renda_fixa", aplicado: 10000, saldo: 10780.55, vencimento: "2028-03-15" },
    { id: `${PREFIXO}i3`, nome: "PETR4", instituicao: "XP", tipo: "acoes", aplicado: 3000, saldo: 2712.4, vencimento: null },
    { id: `${PREFIXO}i4`, nome: "HGLG11", instituicao: "XP", tipo: "fii", aplicado: 2000, saldo: 2091.2, vencimento: null },
    { id: `${PREFIXO}i5`, nome: "Bitcoin", instituicao: "BINANCE", tipo: "cripto", aplicado: 1500, saldo: 1183.9, vencimento: null },
    { id: `${PREFIXO}i6`, nome: "Fundo Multimercado", instituicao: "NUBANK", tipo: "fundos", aplicado: 2500, saldo: 2618.75, vencimento: null },
  ];

  return { transacoes: transacoes.sort((a, b) => a.data.localeCompare(b.data)), investimentos };
}

const ehSeed = (x: { id: string }) => x.id.startsWith(PREFIXO);

// replaces earlier seed rows, keeps the user's own manual entries
export function aplicarSeed(): { transacoes: number; investimentos: number } {
  const { transacoes, investimentos } = gerarSeed();
  salvarTransacoesManuais([...carregarTransacoesManuais().filter((x) => !ehSeed(x)), ...transacoes]);
  salvarManuais([...carregarManuais().filter((x) => !ehSeed(x)), ...investimentos]);
  return { transacoes: transacoes.length, investimentos: investimentos.length };
}

export function limparSeed() {
  salvarTransacoesManuais(carregarTransacoesManuais().filter((x) => !ehSeed(x)));
  salvarManuais(carregarManuais().filter((x) => !ehSeed(x)));
}

export function contarSeed(): number {
  return carregarTransacoesManuais().filter(ehSeed).length + carregarManuais().filter(ehSeed).length;
}
