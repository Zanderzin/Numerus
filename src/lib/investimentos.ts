// browser side of the python api (numerus-api), reached through the vite proxy at /py
import type { Dados } from "./data";

export type Perfil = "conservador" | "moderado" | "arrojado";

export const PERFIS: { id: Perfil; label: string; descricao: string }[] = [
  { id: "conservador", label: "CONSERVADOR", descricao: "100% renda fixa (CDI)" },
  { id: "moderado", label: "MODERADO", descricao: "70% renda fixa · 30% ações" },
  { id: "arrojado", label: "ARROJADO", descricao: "40% renda fixa · 60% ações" },
];

type Percentis = { p5: number; p25: number; p50: number; p75: number; p95: number };
type Faixas = { [K in keyof Percentis]: number[] };

export type Simulacao = {
  fonte_renda_fixa: "historico_bcb" | "premissas";
  perfil: Perfil;
  meses: number;
  n_simulacoes: number;
  total_aportado_medio: number;
  final_nominal: Percentis;
  final_real: Percentis;
  trajetoria_nominal: Faixas;
  trajetoria_real: Faixas;
  premissas: Record<string, number>;
  meta?: number;
  prob_atingir_meta?: number;
};

export type Previsao = {
  modelo: "ridge" | "baseline_media_movel";
  motivo: string;
  mae_baseline: number | null;
  mae_ridge: number | null;
  sazonalidade?: boolean;
  meses_historico: number;
  sobra_historica_media: number;
  previsoes: { passo: number; media: number; p25: number; p75: number }[];
  desvio_mensal: number;
  aporte_sugerido: number;
};

export type MesHistorico = { mes: string; receita: number; despesa: number };

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/py/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.detail === "string" ? json.detail : `Erro ${res.status}`);
  return json as T;
}

// monthly income/spend history for the ml model.
// spend comes per month from the transactions; income is the period average
// (Dados only keeps the average), so the model learns from spend variation.
export function historicoMensal(d: Dados): MesHistorico[] {
  const porMes = new Map<string, number>();
  for (const t of d.transacoes) {
    const mes = t.data.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + t.valor);
  }
  const atual = new Date().toISOString().slice(0, 7);
  return [...porMes.entries()]
    .filter(([mes]) => mes < atual) // current month is incomplete and would look like a huge saving
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, despesa]) => ({ mes, receita: d.renda, despesa: Math.round(despesa * 100) / 100 }));
}

export function preverAporte(meses: MesHistorico[], horizonte = 6) {
  return api<Previsao>("investimentos/previsao-aporte", { meses, horizonte });
}

export function simular(params: {
  meses: number;
  perfil: Perfil;
  valor_inicial?: number;
  aporte_mensal?: number;
  aporte_desvio?: number;
  aportes_previstos?: number[];
  meta?: number;
  n_simulacoes?: number;
}) {
  return api<Simulacao>("investimentos/monte-carlo", params);
}

export function aporteParaMeta(params: { meta: number; meses: number; perfil: Perfil; valor_inicial?: number; confianca?: number }) {
  return api<{ aporte_mensal_necessario: number }>("investimentos/aporte-para-meta", params);
}

export function plano(params: { meses_historico: MesHistorico[]; meses: number; perfil: Perfil; valor_inicial?: number; meta?: number }) {
  return api<{ previsao: Previsao; simulacao: Simulacao }>("investimentos/plano", params);
}

// ---- whatsapp ----

const KEY_WHATSAPP = "numerus.whatsapp";

export function carregarWhatsApp(): string {
  try {
    return localStorage.getItem(KEY_WHATSAPP) ?? "";
  } catch {
    return "";
  }
}

export function salvarWhatsApp(numero: string) {
  try {
    localStorage.setItem(KEY_WHATSAPP, numero);
  } catch {
    // storage unavailable — number just won't persist
  }
}

export function notificarProgressoMeta(para: string, nome: string, atual: number, alvo: number) {
  return api<{ sid: string; status: string }>("notificacoes/whatsapp", {
    para,
    tipo: "progresso_meta",
    dados: { nome, atual, alvo },
  });
}

export function notificarTexto(para: string, mensagem: string) {
  return api<{ sid: string; status: string }>("notificacoes/whatsapp", { para, mensagem });
}

// "R$ 12,3 mil" style labels for chart axes
export function brlCurto(v: number): string {
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `R$ ${Math.round(v)}`;
}
