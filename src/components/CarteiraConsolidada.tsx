import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatBRL, formatBRLSinal, formatPctSinal } from "../lib/currency";
import { resumir, rotuloTipo, TIPOS, useCarteira, type Fatia, type Investimento, type InvestimentoManual, type TipoAtivo } from "../lib/carteira";
import { Badge, Button, Card, ConfirmarExclusao, KpiTile, Variacao } from "./ui";

type Ordem = { campo: "saldo" | "rentabilidade"; desc: boolean };

const fmtData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// every investment from every connection + manual ones, in one view
export default function CarteiraConsolidada({ onUsarTotal }: { onUsarTotal?: (total: number) => void }) {
  const { lista, manuais, setManuais, estado, erro, conectado, recarregar } = useCarteira();
  const [filtroInst, setFiltroInst] = useState("todas");
  const [filtroTipo, setFiltroTipo] = useState<TipoAtivo | "todos">("todos");
  const [ordem, setOrdem] = useState<Ordem>({ campo: "saldo", desc: true });
  const [editando, setEditando] = useState<InvestimentoManual | "novo" | null>(null);

  const resumo = useMemo(() => resumir(lista), [lista]);
  const instituicoes = resumo.porInstituicao.map((f) => f.chave);

  const visiveis = useMemo(() => {
    const f = lista.filter((i) => (filtroInst === "todas" || i.instituicao === filtroInst) && (filtroTipo === "todos" || i.tipo === filtroTipo));
    const val = (i: Investimento) => (ordem.campo === "saldo" ? i.saldo : i.rentabilidade ?? -Infinity); // unknown return sorts last
    return f.sort((a, b) => (ordem.desc ? val(b) - val(a) : val(a) - val(b)));
  }, [lista, filtroInst, filtroTipo, ordem]);

  function salvar(m: InvestimentoManual) {
    setManuais((l) => (l.some((x) => x.id === m.id) ? l.map((x) => (x.id === m.id ? m : x)) : [...l, m]));
    setEditando(null);
  }

  const remover = (id: string) => setManuais((l) => l.filter((x) => x.id !== id));
  const ordenar = (campo: Ordem["campo"]) => setOrdem((o) => ({ campo, desc: o.campo === campo ? !o.desc : true }));

  const vazio = lista.length === 0 && estado !== "carregando";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="nm-eyebrow" style={{ margin: 0, fontSize: 14 }}>[01] CARTEIRA CONSOLIDADA</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {onUsarTotal && resumo.total > 0 && (
            <Button variant="secondary" onClick={() => onUsarTotal(Math.round(resumo.total * 100) / 100)}>USAR NA SIMULAÇÃO ↓</Button>
          )}
          <Button onClick={() => setEditando(editando === "novo" ? null : "novo")}>{editando === "novo" ? "CANCELAR" : "+ INVESTIMENTO MANUAL"}</Button>
        </div>
      </div>

      {editando && (
        <FormManual
          inicial={editando === "novo" ? null : editando}
          instituicoes={instituicoes}
          onSalvar={salvar}
          onCancelar={() => setEditando(null)}
        />
      )}

      {estado === "carregando" && lista.length === 0 && (
        <Card title="CARREGANDO CARTEIRA…" meta="PLUGGY">
          <p style={{ margin: 0 }} aria-live="polite">Buscando investimentos em todas as conexões…</p>
        </Card>
      )}

      {erro && (
        <Card title={estado === "erro" ? "▼ ERRO AO CARREGAR INVESTIMENTOS" : "AVISO"} meta="PLUGGY">
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tom="negativo">▼ {estado === "erro" ? "FALHOU" : "PARCIAL"}</Badge>
            <span>{erro}</span>
            <Button variant="secondary" onClick={recarregar}>TENTAR DE NOVO</Button>
          </div>
        </Card>
      )}

      {vazio && estado !== "erro" && (
        <Card title="NENHUM INVESTIMENTO AINDA">
          <p style={{ marginTop: 0 }}>
            {conectado
              ? "As instituições conectadas não retornaram investimentos. Conecte uma corretora (no sandbox: Pluggy Bank Investment) ou cadastre manualmente."
              : "Conecte suas corretoras e bancos no PAINEL para ver tudo aqui, ou cadastre manualmente os investimentos de corretoras não conectadas."}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Button onClick={() => setEditando("novo")}>+ INVESTIMENTO MANUAL</Button>
            <Link to="/app" style={{ fontWeight: 800 }}>CONECTAR NO PAINEL ↗</Link>
          </div>
        </Card>
      )}

      {lista.length > 0 && (
        <>
          <div className="nm-row" style={{ gap: 16 }}>
            <KpiTile label="PATRIMÔNIO INVESTIDO" value={formatBRL(resumo.total)} variant="dark" />
            {/* assets without a known invested amount stay out of this total and of the return */}
            <KpiTile label={lista.some((i) => i.aplicado === null) ? "TOTAL APLICADO · SÓ ATIVOS COM VALOR INFORMADO" : "TOTAL APLICADO"} value={formatBRL(resumo.aplicado)} />
            {resumo.rentabilidade === null ? (
              <KpiTile label="RENTABILIDADE TOTAL" value="—" />
            ) : (
              <KpiTile
                label={`RENTABILIDADE TOTAL · ${formatBRLSinal(resumo.rentabilidade * resumo.aplicado)}`}
                value={`${resumo.rentabilidade < 0 ? "▼" : "▲"} ${formatPctSinal(resumo.rentabilidade)}`}
                variant={resumo.rentabilidade < 0 ? "negative" : "accent"}
              />
            )}
            <KpiTile label="ATIVOS · INSTITUIÇÕES" value={`${lista.length} · ${resumo.porInstituicao.length}`} />
          </div>

          <div className="nm-cards">
            <Card title="POR INSTITUIÇÃO" meta="% DO PATRIMÔNIO">
              <Distribuicao fatias={resumo.porInstituicao} ativa={filtroInst} onClick={(k) => setFiltroInst(filtroInst === k ? "todas" : k)} />
            </Card>
            <Card title="POR TIPO DE ATIVO" meta="% DO PATRIMÔNIO">
              <Distribuicao fatias={resumo.porTipo} ativa={filtroTipo} onClick={(k) => setFiltroTipo(filtroTipo === k ? "todos" : (k as TipoAtivo))} />
            </Card>
          </div>

          <Card title="ATIVOS" meta={`${visiveis.length} DE ${lista.length} · ${formatBRL(visiveis.reduce((s, i) => s + i.saldo, 0))}`}>
            <div className="nm-row" style={{ gap: 16, alignItems: "end", marginBottom: 16 }}>
              <Campo label="INSTITUIÇÃO">
                <select className="nm-input" value={filtroInst} onChange={(e) => setFiltroInst(e.target.value)}>
                  <option value="todas">TODAS</option>
                  {instituicoes.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="TIPO">
                <select className="nm-input" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoAtivo | "todos")}>
                  <option value="todos">TODOS</option>
                  {TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </Campo>
              {(filtroInst !== "todas" || filtroTipo !== "todos") && (
                <button className="nm-icon-btn" style={{ padding: "10px 12px" }} onClick={() => { setFiltroInst("todas"); setFiltroTipo("todos"); }}>LIMPAR FILTROS</button>
              )}
            </div>

            {visiveis.length === 0 ? (
              <p style={{ margin: 0 }}>Nenhum ativo com esses filtros.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <Th>ATIVO</Th>
                      <Th>INSTITUIÇÃO</Th>
                      <Th>TIPO</Th>
                      <Th direita>APLICADO</Th>
                      <Th direita><BotaoOrdem ativo={ordem.campo === "saldo"} desc={ordem.desc} onClick={() => ordenar("saldo")}>SALDO</BotaoOrdem></Th>
                      <Th direita><BotaoOrdem ativo={ordem.campo === "rentabilidade"} desc={ordem.desc} onClick={() => ordenar("rentabilidade")}>RENTAB.</BotaoOrdem></Th>
                      <Th direita>VENCIMENTO</Th>
                      <Th direita><span className="nm-sr">AÇÕES</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((i) => {
                      const manual = i.origem === "manual" ? manuais.find((m) => m.id === i.id) : undefined;
                      return (
                        <tr key={`${i.origem}-${i.id}`} style={{ borderBottom: "1px solid var(--nm-grid)" }}>
                          <Td>
                            <span style={{ fontWeight: 800 }}>{i.nome.toUpperCase()}</span>{" "}
                            {manual && <Badge>MANUAL</Badge>}
                          </Td>
                          <Td>{i.instituicao}</Td>
                          <Td>{rotuloTipo(i.tipo)}</Td>
                          <Td direita>{i.aplicado === null ? "—" : formatBRL(i.aplicado)}</Td>
                          <Td direita><strong>{formatBRL(i.saldo)}</strong></Td>
                          <Td direita>
                            {i.rentabilidade === null ? (
                              "—"
                            ) : (
                              <span title={i.rentabilidadeFonte === "12m" ? "rentabilidade dos últimos 12 meses informada pela instituição" : "saldo atual ÷ valor aplicado"}>
                                <Variacao valor={i.rentabilidade} texto={formatPctSinal(i.rentabilidade)} />
                                {i.rentabilidadeFonte === "12m" && <span style={{ fontSize: 11, fontWeight: 700 }}> 12M</span>}
                              </span>
                            )}
                          </Td>
                          <Td direita>{i.vencimento ? fmtData(i.vencimento) : "—"}</Td>
                          <Td direita>
                            {manual && (
                              <span style={{ display: "inline-flex", gap: 6 }}>
                                <button className="nm-icon-btn" onClick={() => setEditando(manual)} aria-label={`Editar ${i.nome}`}>EDITAR</button>
                                <ConfirmarExclusao rotulo={i.nome} onConfirmar={() => remover(i.id)} />
                              </span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ margin: "12px 0 0", fontSize: 12 }}>
              Rentabilidade = saldo atual ÷ valor aplicado. Quando a instituição não informa o valor aplicado, mostramos a taxa dos últimos 12 meses (12M). Itens <strong>MANUAL</strong> foram cadastrados por você.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

// horizontal share bars, black fill; clicking a row filters the table
function Distribuicao({ fatias, ativa, onClick }: { fatias: Fatia[]; ativa: string; onClick: (chave: string) => void }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {fatias.map((f) => {
        const sel = ativa === f.chave;
        return (
          <li key={f.chave}>
            <button
              type="button"
              onClick={() => onClick(f.chave)}
              aria-pressed={sel}
              title={sel ? "remover filtro" : "filtrar a tabela"}
              style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, width: "100%" }}
            >
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, fontWeight: 700 }}>
                <span>{sel ? "▸ " : ""}{f.label}</span>
                <span>{formatBRL(f.saldo)} · {Math.round(f.pct * 100)}%</span>
              </span>
              <span style={{ display: "block", height: 14, border: "var(--nm-border-row)", background: sel ? "var(--nm-muted)" : "transparent" }}>
                <span style={{ display: "block", width: `${Math.max(1, f.pct * 100)}%`, height: "100%", background: "var(--nm-black)" }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const VAZIO_FORM = { nome: "", instituicao: "", tipo: "renda_fixa" as TipoAtivo, aplicado: "", saldo: "", vencimento: "" };

function FormManual({ inicial, instituicoes, onSalvar, onCancelar }: { inicial: InvestimentoManual | null; instituicoes: string[]; onSalvar: (m: InvestimentoManual) => void; onCancelar: () => void }) {
  const [f, setF] = useState(
    inicial
      ? { nome: inicial.nome, instituicao: inicial.instituicao, tipo: inicial.tipo, aplicado: String(inicial.aplicado), saldo: String(inicial.saldo), vencimento: inicial.vencimento ?? "" }
      : VAZIO_FORM,
  );
  const [tentou, setTentou] = useState(false);

  const erros: string[] = [];
  if (!f.nome.trim()) erros.push("Informe o nome do ativo.");
  if (!f.instituicao.trim()) erros.push("Informe a instituição.");
  if (!(Number(f.aplicado) > 0)) erros.push("Valor aplicado precisa ser maior que zero.");
  if (f.saldo === "" || !(Number(f.saldo) >= 0)) erros.push("Saldo atual não pode ser negativo.");

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erros.length) return;
    onSalvar({
      id: inicial?.id ?? crypto.randomUUID(),
      nome: f.nome.trim(),
      instituicao: f.instituicao.trim().toUpperCase(),
      tipo: f.tipo,
      aplicado: Number(f.aplicado),
      saldo: Number(f.saldo),
      vencimento: f.vencimento || null,
    });
  }

  return (
    <Card title={inicial ? "EDITAR INVESTIMENTO MANUAL" : "NOVO INVESTIMENTO MANUAL"} meta="MANUAL">
      <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        <div className="nm-row" style={{ gap: 16 }}>
          <Campo label="ATIVO">
            <input className="nm-input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: CDB 110% CDI" autoFocus />
          </Campo>
          <Campo label="INSTITUIÇÃO">
            <input className="nm-input" list="nm-instituicoes" value={f.instituicao} onChange={(e) => setF({ ...f, instituicao: e.target.value })} placeholder="Ex.: XP, BTG, NUBANK" />
            <datalist id="nm-instituicoes">
              {instituicoes.map((i) => <option key={i} value={i} />)}
            </datalist>
          </Campo>
          <Campo label="TIPO">
            <select className="nm-input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoAtivo })}>
              {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Campo>
        </div>
        <div className="nm-row" style={{ gap: 16 }}>
          <Campo label="VALOR APLICADO (R$)">
            <input className="nm-input" type="number" min={0.01} step="0.01" value={f.aplicado} onChange={(e) => setF({ ...f, aplicado: e.target.value })} placeholder="10000" />
          </Campo>
          <Campo label="SALDO ATUAL (R$)">
            <input className="nm-input" type="number" min={0} step="0.01" value={f.saldo} onChange={(e) => setF({ ...f, saldo: e.target.value })} placeholder="10450" />
          </Campo>
          <Campo label="VENCIMENTO (OPCIONAL)">
            <input className="nm-input" type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
          </Campo>
        </div>
        {tentou && erros.length > 0 && (
          <ul role="alert" style={{ margin: 0, paddingLeft: 18, fontWeight: 700 }}>
            {erros.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <Button type="submit">{inicial ? "SALVAR" : "ADICIONAR"}</Button>
          <Button variant="secondary" onClick={onCancelar}>CANCELAR</Button>
        </div>
      </form>
    </Card>
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

function Th({ children, direita }: { children: ReactNode; direita?: boolean }) {
  return <th style={{ textAlign: direita ? "right" : "left", borderBottom: "var(--nm-border-row)", padding: "8px 6px", fontSize: 12, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{children}</th>;
}

function Td({ children, direita }: { children: ReactNode; direita?: boolean }) {
  return <td style={{ textAlign: direita ? "right" : "left", padding: "8px 6px", whiteSpace: "nowrap" }}>{children}</td>;
}

// sort arrows use ↓/↑ so they aren't confused with the ▲/▼ gain/loss markers
function BotaoOrdem({ ativo, desc, onClick, children }: { ativo: boolean; desc: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ordenar por ${String(children).toLowerCase()}${ativo ? (desc ? ", maior primeiro" : ", menor primeiro") : ""}`}
      style={{ all: "unset", cursor: "pointer", fontWeight: 800, textDecoration: ativo ? "underline" : "none", textUnderlineOffset: 4 }}
    >
      {children} {ativo ? (desc ? "↓" : "↑") : "↕"}
    </button>
  );
}
