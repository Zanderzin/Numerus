import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Card, ConfirmarExclusao, PageHeader } from "../components/ui";
import { formatBRL, formatBRLSinal } from "../lib/currency";
import { useFinancas } from "../lib/financas";
import { atrasada, carregarMetas, mesesAte, planejar, salvarMetas, validarMeta, type CamposMeta, type Meta, type Plano } from "../lib/metas";
import { carregarWhatsApp, notificarProgressoMeta, notificarTexto, salvarWhatsApp, simular } from "../lib/investimentos";

function mesAtual(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fmtPrazo = (p: string) => p.slice(5, 7) + "/" + p.slice(0, 4);

// progress marks that trigger a whatsapp notification
const MARCOS = [25, 50, 75, 100];

export default function Metas() {
  const { dados } = useFinancas();
  const [metas, setMetas] = useState<Meta[]>(carregarMetas);
  const [aberto, setAberto] = useState(false);

  useEffect(() => salvarMetas(metas), [metas]);

  // create or update; every plan and monte carlo below derives from `metas`, so they recompute on save
  function salvar(meta: Meta) {
    setMetas((m) => (m.some((x) => x.id === meta.id) ? m.map((x) => (x.id === meta.id ? meta : x)) : [...m, meta]));
    setAberto(false);
  }

  const remover = (id: string) => setMetas((m) => m.filter((x) => x.id !== id));
  const [whatsapp, setWhatsapp] = useState(carregarWhatsApp);

  function depositar(id: string, valor: number) {
    const meta = metas.find((x) => x.id === id);
    if (!meta) return;
    const novo = Math.max(0, meta.guardado + valor);
    setMetas((m) => m.map((x) => (x.id === id ? { ...x, guardado: novo } : x)));
    // notify only when a deposit crosses a mark, not on every deposit
    const antes = (meta.guardado / meta.alvo) * 100;
    const depois = (novo / meta.alvo) * 100;
    if (whatsapp && MARCOS.some((mk) => antes < mk && depois >= mk)) {
      notificarProgressoMeta(whatsapp, meta.nome, novo, meta.alvo).catch(() => {
        // notification is best-effort; the deposit already happened
      });
    }
  }

  // earlier goals reserve their monthly amount first
  let comprometido = 0;
  const planos = metas.map((m) => {
    const p = planejar(m, comprometido, dados);
    comprometido += p.reservado;
    return p;
  });

  return (
    <>
      <PageHeader eyebrow={dados.periodo} title="METAS" action={<Button onClick={() => setAberto((a) => !a)}>{aberto ? "CANCELAR" : "+ NOVA META"}</Button>} />
      <div className="nm-content">
        {aberto && (
          <Card title="NOVA META">
            <FormMeta onSalvar={salvar} onCancelar={() => setAberto(false)} />
          </Card>
        )}

        <CardWhatsApp numero={whatsapp} onSalvar={(n) => { setWhatsapp(n); salvarWhatsApp(n); }} />

        {metas.length === 0 && !aberto ? (
          <Card title="NENHUMA META AINDA">
            <p style={{ marginTop: 0 }}>Crie uma meta e o NUMERUS calcula quanto guardar por mês e onde cortar, a partir dos seus gastos e tetos por categoria.</p>
            <Button onClick={() => setAberto(true)}>+ CRIAR PRIMEIRA META</Button>
          </Card>
        ) : (
          <div className="nm-cards">
            {metas.map((m, i) => (
              <CardMeta key={m.id} meta={m} plano={planos[i]} onSalvar={salvar} onRemover={() => remover(m.id)} onDepositar={(v) => depositar(m.id, v)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="nm-field">
      <span className="nm-eyebrow">{label}</span>
      {children}
    </label>
  );
}

const paraCampos = (m?: Meta): CamposMeta & { obs: string } => ({
  nome: m?.nome ?? "",
  alvo: m ? String(m.alvo) : "",
  guardado: m ? String(m.guardado) : "",
  prazo: m?.prazo ?? mesAtual(12),
  aporteMensal: m?.aporteMensal ? String(m.aporteMensal) : "",
  obs: m?.obs ?? "",
});

// one form for create and edit; pre-filled when `inicial` is given
function FormMeta({ inicial, onSalvar, onCancelar }: { inicial?: Meta; onSalvar: (m: Meta) => void; onCancelar: () => void }) {
  const [f, setF] = useState(() => paraCampos(inicial));
  const [tentou, setTentou] = useState(false);
  const erros = validarMeta(f);
  const restante = Math.max(0, Number(f.alvo) - (Number(f.guardado) || 0));
  const necessario = Number(f.alvo) > 0 && f.prazo > mesAtual() ? restante / mesesAte(f.prazo) : null;
  const aporte = Number(f.aporteMensal);

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erros.length) return;
    onSalvar({
      ...inicial, // keeps any field this form doesn't know about
      id: inicial?.id ?? crypto.randomUUID(),
      nome: f.nome.trim(),
      alvo: Number(f.alvo),
      guardado: Math.max(0, Number(f.guardado) || 0),
      prazo: f.prazo,
      aporteMensal: f.aporteMensal === "" ? null : aporte,
      obs: f.obs.trim(),
    });
  }

  return (
    <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <div className="nm-row" style={{ gap: 16 }}>
        <Campo label="NOME">
          <input className="nm-input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Reserva de emergência" autoFocus />
        </Campo>
        <Campo label="VALOR ALVO (R$)">
          <input className="nm-input" type="number" min={1} step="0.01" value={f.alvo} onChange={(e) => setF({ ...f, alvo: e.target.value })} placeholder="10000" />
        </Campo>
        <Campo label="JÁ GUARDADO (R$)">
          <input className="nm-input" type="number" min={0} step="0.01" value={f.guardado} onChange={(e) => setF({ ...f, guardado: e.target.value })} placeholder="0" />
        </Campo>
      </div>
      <div className="nm-row" style={{ gap: 16 }}>
        <Campo label="PRAZO">
          <input className="nm-input" type="month" min={mesAtual(1)} value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
        </Campo>
        <Campo label="APORTE MENSAL PLANEJADO (R$, OPCIONAL)">
          <input
            className="nm-input"
            type="number"
            min={0.01}
            step="0.01"
            value={f.aporteMensal}
            onChange={(e) => setF({ ...f, aporteMensal: e.target.value })}
            placeholder={necessario !== null ? `Necessário: ${Math.ceil(necessario)}` : "Em branco = o necessário"}
          />
        </Campo>
      </div>
      <Campo label="OBSERVAÇÕES">
        <textarea className="nm-input" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} placeholder="Por que essa meta importa, detalhes, links…" />
      </Campo>
      {necessario !== null && restante > 0 && (
        <p style={{ margin: 0, fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>Para chegar no prazo: <strong>{formatBRL(necessario)}</strong>/mês.</span>
          {aporte > 0 && aporte < necessario && <Badge tom="negativo">▼ APORTE ABAIXO DO NECESSÁRIO {formatBRLSinal(aporte - necessario)}</Badge>}
        </p>
      )}
      {tentou && erros.length > 0 && (
        <ul role="alert" style={{ margin: 0, paddingLeft: 18, fontWeight: 700 }}>
          {erros.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        <Button type="submit">{inicial ? "SALVAR" : "CRIAR META"}</Button>
        <Button variant="secondary" onClick={onCancelar}>CANCELAR</Button>
      </div>
    </form>
  );
}

function CardMeta({ meta, plano, onSalvar, onRemover, onDepositar }: { meta: Meta; plano: Plano; onSalvar: (m: Meta) => void; onRemover: () => void; onDepositar: (v: number) => void }) {
  const [valor, setValor] = useState("");
  const [editando, setEditando] = useState(false);
  const pct = Math.min(100, Math.round((meta.guardado / meta.alvo) * 100));
  const concluida = plano.restante === 0;
  const vencida = atrasada(meta);
  const fundo = concluida ? "var(--color-positive)" : vencida ? "var(--color-negative)" : "transparent";
  const tinta = vencida && !concluida ? "var(--color-on-negative)" : "var(--nm-black)";

  return (
    <section style={{ border: "var(--nm-border-card)", background: "var(--nm-off-white)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderBottom: "4px solid var(--nm-black)", padding: "12px 16px", background: fundo, color: tinta }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "0.04em" }}>
          {vencida && !concluida && <span aria-label="atrasada">▼ </span>}
          {meta.nome.toUpperCase()}
        </h2>
        <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {!editando && <button className="nm-icon-btn" onClick={() => setEditando(true)} aria-label={`Editar meta ${meta.nome}`}>EDITAR</button>}
          <ConfirmarExclusao rotulo={`meta ${meta.nome}`} onConfirmar={onRemover} />
        </span>
      </header>

      {editando ? (
        <div style={{ padding: "18px 16px" }}>
          <span className="nm-eyebrow" style={{ display: "block", marginBottom: 12 }}>EDITAR META</span>
          <FormMeta
            inicial={meta}
            onSalvar={(m) => {
              onSalvar(m);
              setEditando(false);
            }}
            onCancelar={() => setEditando(false)}
          />
        </div>
      ) : (

      <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            <span>{formatBRL(meta.guardado)} / {formatBRL(meta.alvo)}</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 16, border: "var(--nm-border-row)" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: concluida ? "var(--nm-green)" : "var(--nm-black)" }} />
          </div>
          <div className="nm-eyebrow" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            PRAZO {fmtPrazo(meta.prazo)} · {vencida ? "VENCIDO" : `${plano.meses} ${plano.meses === 1 ? "MÊS" : "MESES"}`}
            {vencida && !concluida && <Badge tom="negativo">▼ ATRASADA · FALTAM {formatBRL(plano.restante)}</Badge>}
          </div>
        </div>

        {concluida ? (
          <p style={{ margin: 0, fontWeight: 800 }}>META ATINGIDA.</p>
        ) : (
          <>
            <ComoAtingir plano={plano} />
            <ChanceMeta meta={meta} plano={plano} />
          </>
        )}

        {meta.obs && (
          <div>
            <span className="nm-eyebrow">OBSERVAÇÕES</span>
            <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{meta.obs}</p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(valor);
            if (v) onDepositar(v);
            setValor("");
          }}
          style={{ display: "flex", gap: 10 }}
        >
          <input className="nm-input" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor guardado (R$)" aria-label="Valor a depositar" />
          <Button type="submit" variant="secondary" disabled={!Number(valor)}>DEPOSITAR</Button>
        </form>
      </div>
      )}
    </section>
  );
}

function ComoAtingir({ plano }: { plano: Plano }) {
  return (
    <div style={{ border: "var(--nm-border-row)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="nm-eyebrow">COMO ATINGIR</span>
        {plano.viavel ? (plano.cortes.length ? <Badge dark>COM AJUSTES</Badge> : <Badge tom="positivo">▲ NO RITMO</Badge>) : <Badge tom="negativo">▼ PRAZO APERTADO</Badge>}
      </div>

      <p style={{ margin: 0 }}>
        Guarde <strong>{formatBRL(plano.mensal)}</strong> por mês. Respeitando os tetos, sobram <strong>{formatBRL(plano.sobra)}</strong> por mês
        {plano.cortes.length === 0 ? " — isso já cobre a meta." : "."}
      </p>

      {plano.aportePlanejado !== null && plano.mesesComAporte !== null && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            Seu aporte planejado: <strong>{formatBRL(plano.aportePlanejado)}</strong>/mês → termina em {plano.mesesComAporte} {plano.mesesComAporte === 1 ? "mês" : "meses"}.
          </span>
          {plano.atrasoPrevisto ? (
            <Badge tom="negativo">▼ ATRASO PREVISTO +{plano.mesesComAporte - plano.meses} {plano.mesesComAporte - plano.meses === 1 ? "MÊS" : "MESES"}</Badge>
          ) : (
            <Badge tom="positivo">▲ DENTRO DO PRAZO</Badge>
          )}
        </div>
      )}

      {plano.cortes.length > 0 && (
        <div>
          <p style={{ margin: "0 0 6px" }}>Para fechar a conta, reduza os tetos:</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {plano.cortes.map((c) => (
              <li key={c.label}>
                <strong>{c.label}</strong>: {formatBRL(c.cap)} → {formatBRL(c.novoCap)} ({formatBRLSinal(c.novoCap - c.cap)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {!plano.viavel && plano.mesesSugeridos && (
        <p style={{ margin: 0, fontWeight: 700 }}>
          Mesmo com os cortes não fecha no prazo. Prazo realista: {plano.mesesSugeridos} meses.
        </p>
      )}

      {plano.estouros.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="nm-eyebrow">ACIMA DO TETO — VOLTAR AO TETO É O PRIMEIRO PASSO</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {plano.estouros.map((e) => (
              <Badge key={e.label} tom="negativo">▲ {e.label} {formatBRLSinal(e.excesso)}/MÊS</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// monte carlo: chance of reaching the goal if the monthly amount (planned, or else the required one) goes to the cdi
function ChanceMeta({ meta, plano }: { meta: Meta; plano: Plano }) {
  const [prob, setProb] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  const aporte = plano.aportePlanejado ?? plano.mensal;

  useEffect(() => {
    let ativo = true;
    const t = setTimeout(() => {
      simular({ meses: plano.meses, perfil: "conservador", valor_inicial: meta.guardado, aporte_mensal: aporte, meta: meta.alvo, n_simulacoes: 2000 })
        .then((r) => ativo && (setProb(r.prob_atingir_meta ?? null), setOffline(false)))
        .catch(() => ativo && setOffline(true));
    }, 300); // debounce while typing deposits
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [meta.guardado, meta.alvo, plano.meses, aporte]);

  if (offline) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span className="nm-eyebrow">CHANCE {plano.aportePlanejado !== null ? "COM SEU APORTE" : "INVESTINDO O NECESSÁRIO"} NO CDI</span>
      {prob === null ? (
        <span style={{ fontWeight: 800 }}>…</span>
      ) : (
        // green fill + black text, following the "green is fill only" rule
        <Badge tom="positivo">{Math.round(prob * 100)}%</Badge>
      )}
    </div>
  );
}

function CardWhatsApp({ numero, onSalvar }: { numero: string; onSalvar: (n: string) => void }) {
  const [valor, setValor] = useState(numero);
  const [status, setStatus] = useState("");

  async function testar() {
    setStatus("ENVIANDO…");
    try {
      await notificarTexto(valor, "NUMERUS: notificações de metas ativadas.");
      setStatus("ENVIADO. CONFIRA SEU WHATSAPP.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message.toUpperCase() : "FALHOU");
    }
  }

  return (
    <Card title="AVISOS NO WHATSAPP" meta={numero ? "ATIVO" : "DESLIGADO"}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="nm-input"
          style={{ maxWidth: 260 }}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="DDD + número, ex.: 61999998888"
          aria-label="Número do WhatsApp"
        />
        <Button variant="secondary" onClick={() => { onSalvar(valor.trim()); setStatus(valor.trim() ? "SALVO." : "DESLIGADO."); }}>SALVAR</Button>
        <Button onClick={testar} disabled={!valor.trim()}>TESTAR</Button>
        {status && <span className="nm-eyebrow">{status}</span>}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 13 }}>
        Você recebe um aviso quando uma meta passa de 25%, 50%, 75% e 100%. No sandbox da Twilio, mande antes <strong>join &lt;código&gt;</strong> para +1 415 523 8886.
      </p>
    </Card>
  );
}
