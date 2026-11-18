import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import CarteiraConsolidada from "../components/CarteiraConsolidada";
import { Badge, Button, Card, KpiTile, PageHeader, Variacao } from "../components/ui";
import { formatBRL, formatBRLSinal } from "../lib/currency";
import { useFinancas } from "../lib/financas";
import {
  PERFIS,
  brlCurto,
  historicoMensal,
  plano,
  preverAporte,
  simular,
  type Perfil,
  type Previsao,
  type Simulacao,
} from "../lib/investimentos";

const HORIZONTES = [1, 2, 3, 5, 10, 15, 20, 30];

type Form = { perfil: Perfil; anos: number; inicial: string; meta: string; modo: "ml" | "manual"; aporte: string };

export default function Investimentos() {
  const { dados } = useFinancas();
  const historico = useMemo(() => historicoMensal(dados), [dados]);

  const [form, setForm] = useState<Form>({ perfil: "moderado", anos: 5, inicial: "", meta: "", modo: "ml", aporte: "500" });
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [prev, setPrev] = useState<Previsao | null>(null);
  const [erroMl, setErroMl] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [real, setReal] = useState(true);

  async function rodar(f: Form) {
    setCarregando(true);
    setErro("");
    setErroMl("");
    const meses = f.anos * 12;
    const valor_inicial = Number(f.inicial) || 0;
    const meta = Number(f.meta) > 0 ? Number(f.meta) : undefined;
    try {
      if (f.modo === "ml") {
        if (historico.length === 0) throw new Error("sem-historico");
        // one call: the ml estimate feeds the monte carlo contributions
        const r = await plano({ meses_historico: historico, meses, perfil: f.perfil, valor_inicial, meta });
        setPrev(r.previsao);
        setSim(r.simulacao);
      } else {
        const aporte = Number(f.aporte) || 0;
        const [s, p] = await Promise.allSettled([
          simular({ meses, perfil: f.perfil, valor_inicial, aporte_mensal: aporte, meta }),
          historico.length ? preverAporte(historico) : Promise.reject(new Error("sem-historico")),
        ]);
        if (s.status === "rejected") throw s.reason;
        setSim(s.value);
        if (p.status === "fulfilled") setPrev(p.value);
        else {
          setPrev(null);
          setErroMl(p.reason?.message === "sem-historico" ? SEM_HISTORICO : "Não foi possível calcular a previsão.");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "sem-historico") {
        setErroMl(SEM_HISTORICO);
        setErro("Sem histórico de meses fechados para o ML. Use o aporte manual.");
      } else {
        setErro("Não consegui falar com a API de investimentos (numerus-api). No dev, ela está rodando na porta 8000?");
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    rodar(form);
    // run once with the defaults; afterwards the user re-runs with the button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    rodar(form);
  }

  const aporteUsado = form.modo === "ml" ? prev?.aporte_sugerido ?? 0 : Number(form.aporte) || 0;
  const finais = sim ? (real ? sim.final_real : sim.final_nominal) : null;

  return (
    <>
      <PageHeader eyebrow={dados.periodo} title="INVESTIMENTOS" />
      <div className="nm-content">
        <CarteiraConsolidada onUsarTotal={(total) => setForm((f) => ({ ...f, inicial: String(total) }))} />

        <h2 className="nm-eyebrow" style={{ margin: "12px 0 0", fontSize: 14 }}>[02] SIMULAÇÃO E ANÁLISE</h2>
        <Card title="SIMULAÇÃO" meta="MONTE CARLO">
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="nm-row" style={{ gap: 16 }}>
              <Campo label="PERFIL">
                <select className="nm-input" value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}>
                  {PERFIS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} — {p.descricao}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="HORIZONTE">
                <select className="nm-input" value={form.anos} onChange={(e) => setForm({ ...form, anos: Number(e.target.value) })}>
                  {HORIZONTES.map((a) => (
                    <option key={a} value={a}>{a} {a === 1 ? "ANO" : "ANOS"}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="JÁ INVESTIDO (R$)">
                <input className="nm-input" type="number" min={0} step="0.01" value={form.inicial} onChange={(e) => setForm({ ...form, inicial: e.target.value })} placeholder="0" />
              </Campo>
              <Campo label="META EM VALORES DE HOJE (R$)">
                <input className="nm-input" type="number" min={0} step="0.01" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} placeholder="Opcional" />
              </Campo>
            </div>

            <div className="nm-row" style={{ gap: 16, alignItems: "flex-end" }}>
              <Campo label="APORTE MENSAL">
                <div style={{ display: "flex", gap: 8 }}>
                  <Opcao ativa={form.modo === "ml"} onClick={() => setForm({ ...form, modo: "ml" })}>SUGERIDO PELO ML</Opcao>
                  <Opcao ativa={form.modo === "manual"} onClick={() => setForm({ ...form, modo: "manual" })}>MANUAL</Opcao>
                </div>
              </Campo>
              {form.modo === "manual" && (
                <Campo label="VALOR POR MÊS (R$)">
                  <input className="nm-input" type="number" min={0} step="0.01" value={form.aporte} onChange={(e) => setForm({ ...form, aporte: e.target.value })} />
                </Campo>
              )}
              <div>
                <Button type="submit" disabled={carregando}>{carregando ? "SIMULANDO…" : "SIMULAR"}</Button>
              </div>
            </div>
            {erro && <p style={{ margin: 0, fontWeight: 700 }}>{erro}</p>}
          </form>
        </Card>

        {sim && finais && (
          <>
            <div className="nm-row" style={{ gap: 16 }}>
              <KpiTile label={form.modo === "ml" ? "APORTE SUGERIDO / MÊS" : "APORTE / MÊS"} value={formatBRL(aporteUsado)} variant="dark" />
              <KpiTile label={`CENÁRIO CENTRAL EM ${form.anos} ${form.anos === 1 ? "ANO" : "ANOS"}`} value={formatBRL(finais.p50)} variant="accent" />
              {/* nominal vs nominal: below what was put in means a loss in that scenario */}
              {sim.final_nominal.p5 < sim.total_aportado_medio ? (
                <KpiTile label="▼ PESSIMISTA (5%) · ABAIXO DO APORTADO" value={formatBRL(finais.p5)} variant="negative" />
              ) : (
                <KpiTile label="CENÁRIO PESSIMISTA (5%)" value={formatBRL(finais.p5)} />
              )}
              {sim.prob_atingir_meta !== undefined ? (
                <KpiTile label="CHANCE DE ATINGIR A META" value={`${Math.round(sim.prob_atingir_meta * 100)}%`} />
              ) : (
                <KpiTile label="TOTAL APORTADO" value={formatBRL(sim.total_aportado_medio)} />
              )}
            </div>

            <Card title="PROJEÇÃO DO PATRIMÔNIO" meta={real ? "EM VALORES DE HOJE" : "VALORES NOMINAIS"}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <Opcao ativa={real} onClick={() => setReal(true)}>VALORES DE HOJE</Opcao>
                <Opcao ativa={!real} onClick={() => setReal(false)}>NOMINAL</Opcao>
              </div>
              <GraficoLeque faixas={real ? sim.trajetoria_real : sim.trajetoria_nominal} meta={real ? sim.meta : undefined} />
              <p style={{ margin: "12px 0 0", fontSize: 13 }}>
                {sim.n_simulacoes.toLocaleString("pt-BR")} cenários simulados. A faixa clara cobre 90% deles; a escura, os 50% centrais; a linha é o cenário mediano.
                {real && " Valores descontam a inflação simulada: é o poder de compra em reais de hoje."}
              </p>
            </Card>
          </>
        )}

        <div className="nm-cards">
          <Card title="PREVISÃO DE APORTE" meta="MACHINE LEARNING">
            {prev ? <BlocoPrevisao prev={prev} /> : <p style={{ margin: 0 }}>{erroMl || "Calculando…"}</p>}
          </Card>
          {sim && (
            <Card title="PREMISSAS">
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
                <li>
                  Renda fixa e inflação:{" "}
                  {sim.fonte_renda_fixa === "historico_bcb"
                    ? "trechos reais do histórico de CDI e IPCA (Banco Central, desde 2010), sorteados em blocos de 12 meses."
                    : `premissas fixas (CDI ${pct(sim.premissas.cdi_anual)} a.a., IPCA ${pct(sim.premissas.ipca_anual)} a.a.) — API do Banco Central indisponível.`}
                </li>
                <li>Ações: retorno médio de {pct(sim.premissas.rv_retorno_anual)} a.a. com volatilidade de {pct(sim.premissas.rv_vol_anual)}.</li>
                <li>IR descontado no resgate final (tabela regressiva na renda fixa, 15% em ações).</li>
                <li>Simulação, não promessa: rentabilidade passada não garante rentabilidade futura.</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

const SEM_HISTORICO = "Ainda não há meses fechados de transações para o modelo aprender. Conecte um banco no PAINEL ou use o aporte manual.";

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="nm-field">
      <span className="nm-eyebrow">{label}</span>
      {children}
    </label>
  );
}

function Opcao({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="nm-icon-btn"
      onClick={onClick}
      aria-pressed={ativa}
      style={{ background: ativa ? "var(--nm-black)" : "transparent", color: ativa ? "var(--nm-off-white)" : "var(--nm-black)" }}
    >
      {children}
    </button>
  );
}

function BlocoPrevisao({ prev }: { prev: Previsao }) {
  const ridge = prev.modelo === "ridge";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge dark>{ridge ? "REGRESSÃO RIDGE" : "MÉDIA MÓVEL (BASELINE)"}</Badge>
        <Badge>{prev.meses_historico} {prev.meses_historico === 1 ? "MÊS" : "MESES"} DE HISTÓRICO</Badge>
        {prev.sazonalidade && <Badge>COM SAZONALIDADE</Badge>}
      </div>
      <p style={{ margin: 0 }}>
        Sobra média até aqui: <Variacao valor={prev.sobra_historica_media} texto={formatBRLSinal(prev.sobra_historica_media)} />/mês. Aporte sugerido: <strong>{formatBRL(prev.aporte_sugerido)}</strong>/mês —
        um valor que você consegue manter na maioria dos meses (percentil 25 da previsão).
      </p>
      {prev.mae_ridge !== null && prev.mae_baseline !== null ? (
        <p style={{ margin: 0, fontSize: 13 }}>
          Validação mês a mês: erro médio de {formatBRL(prev.mae_ridge)} na regressão contra {formatBRL(prev.mae_baseline)} na média móvel.{" "}
          {ridge ? "A regressão errou menos e foi usada." : "A média móvel errou menos, então o modelo mais simples foi mantido."}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 13 }}>Com menos de 6 meses de histórico, o NUMERUS usa a média móvel — um modelo complexo decoraria o ruído.</p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["MÊS", "PESSIMISTA", "PREVISTO", "OTIMISTA"].map((h) => (
              <th key={h} style={{ textAlign: h === "MÊS" ? "left" : "right", borderBottom: "var(--nm-border-row)", padding: "6px 4px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {prev.previsoes.map((p) => (
            <tr key={p.passo}>
              <td style={{ padding: "6px 4px" }}>+{p.passo}</td>
              <td style={{ padding: "6px 4px", textAlign: "right" }}><Sobra v={p.p25} /></td>
              <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 800 }}><Sobra v={p.media} /></td>
              <td style={{ padding: "6px 4px", textAlign: "right" }}><Sobra v={p.p75} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// a forecast month with negative leftover is flagged; positive stays plain to keep the table calm
function Sobra({ v }: { v: number }) {
  return v < 0 ? <Variacao valor={v} texto={formatBRLSinal(v)} /> : <>{formatBRL(v)}</>;
}

// fan chart: p5–p95 band, p25–p75 band, median line, optional goal line
function GraficoLeque({ faixas, meta }: { faixas: Simulacao["trajetoria_real"]; meta?: number }) {
  const W = 800, H = 300, M = { t: 12, r: 16, b: 32, l: 84 };
  const n = faixas.p50.length;
  const maxY = Math.max(...faixas.p95, meta ?? 0) * 1.05 || 1;
  const x = (i: number) => M.l + (n === 1 ? 0 : (i / (n - 1)) * (W - M.l - M.r));
  const y = (v: number) => H - M.b - (v / maxY) * (H - M.t - M.b);

  const linha = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = (sup: number[], inf: number[]) =>
    linha(sup) + inf.map((_, k) => { const i = inf.length - 1 - k; return `L${x(i).toFixed(1)},${y(inf[i]).toFixed(1)}`; }).join("") + "Z";

  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const anos = Math.ceil(n / 12);
  const passoAno = anos > 10 ? 5 : anos > 5 ? 2 : 1;
  const ticksX = Array.from({ length: Math.floor(anos / passoAno) + 1 }, (_, k) => k * passoAno * 12).filter((m) => m <= n);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Projeção: cenário mediano final de ${formatBRL(faixas.p50[n - 1])}`} style={{ display: "block" }}>
      {ticksY.map((v) => (
        <g key={v}>
          <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--nm-black)" strokeOpacity={0.12} />
          <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--nm-black)">{brlCurto(v)}</text>
        </g>
      ))}
      {ticksX.map((m) => (
        <text key={m} x={x(Math.max(0, m - 1))} y={H - 10} textAnchor="middle" fontSize={12} fill="var(--nm-black)">
          {m === 0 ? "HOJE" : `${m / 12}A`}
        </text>
      ))}
      <path d={area(faixas.p95, faixas.p5)} fill="var(--nm-green)" fillOpacity={0.3} />
      <path d={area(faixas.p75, faixas.p25)} fill="var(--nm-green)" fillOpacity={0.75} />
      <path d={linha(faixas.p50)} fill="none" stroke="var(--nm-black)" strokeWidth={3} />
      {meta !== undefined && (
        <g>
          <line x1={M.l} x2={W - M.r} y1={y(meta)} y2={y(meta)} stroke="var(--nm-black)" strokeWidth={2} strokeDasharray="8 6" />
          <text x={W - M.r} y={y(meta) - 6} textAnchor="end" fontSize={12} fontWeight={800} fill="var(--nm-black)">META {brlCurto(meta)}</text>
        </g>
      )}
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--nm-black)" strokeWidth={2} />
    </svg>
  );
}
