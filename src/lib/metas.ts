import { resumoPorCategoria, totalTeto, type Dados } from "./data";

export type Meta = {
  id: string;
  nome: string;
  alvo: number; // quanto quer juntar
  guardado: number; // quanto já juntou
  prazo: string; // yyyy-mm
  obs: string;
  aporteMensal?: number | null; // planned monthly contribution; empty = use what the deadline requires
};

const mesIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type CamposMeta = { nome: string; alvo: string; guardado: string; prazo: string; aporteMensal: string };

// shared by create and edit. returns human messages, empty when valid.
export function validarMeta(f: CamposMeta, hoje = new Date()): string[] {
  const erros: string[] = [];
  if (!f.nome.trim()) erros.push("Dê um nome para a meta.");
  if (!(Number(f.alvo) > 0)) erros.push("O valor alvo precisa ser maior que zero.");
  if (f.guardado !== "" && !(Number(f.guardado) >= 0)) erros.push("O valor guardado não pode ser negativo.");
  if (!/^\d{4}-\d{2}$/.test(f.prazo)) erros.push("Informe o prazo (mês e ano).");
  else if (f.prazo <= mesIso(hoje)) erros.push("O prazo precisa ser um mês no futuro.");
  if (f.aporteMensal !== "" && !(Number(f.aporteMensal) > 0)) erros.push("O aporte mensal precisa ser maior que zero (ou deixe em branco).");
  return erros;
}

const KEY = "numerus.metas";

export function carregarMetas(): Meta[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Meta[]) : [];
  } catch {
    return [];
  }
}

export function salvarMetas(metas: Meta[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(metas));
  } catch {
    // storage unavailable (private mode) — goals just won't persist
  }
}

// deadline month already passed and the goal is not done
export function atrasada(meta: Meta, hoje = new Date()): boolean {
  return meta.guardado < meta.alvo && meta.prazo < mesIso(hoje);
}

// whole months from the current month until the deadline, at least 1
export function mesesAte(prazo: string, hoje = new Date()): number {
  const [ano, mes] = prazo.split("-").map(Number);
  const diff = (ano - hoje.getFullYear()) * 12 + (mes - 1 - hoje.getMonth());
  return Math.max(1, diff);
}

// a flexible category can be cut by at most this share of its cap
const CORTE_MAX = 0.3;

export type Corte = { label: string; cap: number; novoCap: number };

export type Plano = {
  restante: number;
  meses: number;
  mensal: number; // quanto guardar por mês
  sobra: number; // renda - tetos - outras metas
  estouros: { label: string; excesso: number }[]; // categorias acima do teto agora
  cortes: Corte[]; // sugestão de redução de teto
  viavel: boolean;
  mesesSugeridos?: number; // prazo realista quando nem os cortes bastam
  aportePlanejado: number | null; // what the user said they'll put in per month
  mesesComAporte: number | null; // months to finish at the planned pace
  atrasoPrevisto: boolean; // planned pace finishes after the deadline
  reservado: number; // monthly amount this goal takes from the leftover (planned, or required)
};

// how to reach a goal using the gap between income and the category caps.
// `comprometido` = monthly amount already reserved for other goals.
export function planejar(meta: Meta, comprometido: number, d: Dados): Plano {
  const restante = Math.max(0, meta.alvo - meta.guardado);
  const meses = mesesAte(meta.prazo);
  const mensal = restante / meses;
  const aportePlanejado = meta.aporteMensal && meta.aporteMensal > 0 ? meta.aporteMensal : null;
  const mesesComAporte = aportePlanejado && restante > 0 ? Math.ceil(restante / aportePlanejado) : aportePlanejado ? 0 : null;
  const ritmo = {
    aportePlanejado,
    mesesComAporte,
    atrasoPrevisto: mesesComAporte !== null && mesesComAporte > meses,
    reservado: restante === 0 ? 0 : aportePlanejado ?? mensal,
  };
  const sobra = Math.max(0, d.renda - totalTeto(d) - comprometido);

  const categorias = resumoPorCategoria(d);
  const estouros = categorias
    .filter((c) => c.spent > c.cap)
    .map((c) => ({ label: c.label, excesso: c.spent - c.cap }));

  if (restante === 0 || mensal <= sobra) {
    return { restante, meses, mensal, sobra, estouros, cortes: [], viavel: true, ...ritmo };
  }

  // spread the deficit across flexible caps, proportional to each cap
  const deficit = mensal - sobra;
  const flexiveis = categorias.filter((c) => !c.fixa);
  const capFlex = flexiveis.reduce((s, c) => s + c.cap, 0);
  const maxCorte = capFlex * CORTE_MAX;
  const corteTotal = Math.min(deficit, maxCorte);
  const cortes = flexiveis
    .map((c) => {
      const corte = Math.ceil((corteTotal * c.cap) / capFlex / 10) * 10;
      return { label: c.label, cap: c.cap, novoCap: Math.max(0, c.cap - corte) };
    })
    .filter((c) => c.novoCap < c.cap);

  const viavel = deficit <= maxCorte;
  const mesesSugeridos = viavel ? undefined : Math.ceil(restante / (sobra + maxCorte || 1));
  return { restante, meses, mensal, sobra, estouros, cortes, viavel, mesesSugeridos, ...ritmo };
}
