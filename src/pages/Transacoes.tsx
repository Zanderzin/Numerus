import { useState, type FormEvent, type ReactNode } from "react";
import SeletorPeriodo from "../components/SeletorPeriodo";
import { Badge, Button, Card, ConfirmarExclusao, PageHeader } from "../components/ui";
import { formatBRL } from "../lib/currency";
import { useFinancas } from "../lib/financas";
import { isoLocal, validarTransacao, type CamposTransacao, type TipoTransacao, type TransacaoManual } from "../lib/manuais";

const fmtData = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const hojeIso = () => isoLocal(new Date());

const TIPOS: { id: TipoTransacao; label: string }[] = [
  { id: "despesa", label: "DESPESA" },
  { id: "receita", label: "RECEITA" },
  { id: "aporte", label: "APORTE (INVESTIMENTO)" },
];

// every spend in the period (api + manual), newest first, filterable by category
export default function Transacoes() {
  const { dados, manuais, setManuais } = useFinancas();
  const [filtro, setFiltro] = useState("todas");
  const [origem, setOrigem] = useState<"todas" | "api" | "manual">("todas");
  const [editando, setEditando] = useState<TransacaoManual | "nova" | null>(null);
  const labels = new Map(dados.categorias.map((c) => [c.id, c.label]));
  const porId = new Map(manuais.map((m) => [m.id, m]));

  const lista = dados.transacoes
    .filter((t) => (filtro === "todas" || t.categoria === filtro) && (origem === "todas" || t.source === origem))
    .sort((a, b) => b.data.localeCompare(a.data));
  const total = lista.reduce((s, t) => s + t.valor, 0);

  // income and investment transfers aren't spends, so they get their own list
  const outrasManuais = manuais.filter((m) => m.tipo !== "despesa").sort((a, b) => b.data.localeCompare(a.data));

  function salvar(t: TransacaoManual) {
    setManuais((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [...l, t]));
    setEditando(null);
  }
  const remover = (id: string) => setManuais((l) => l.filter((x) => x.id !== id));

  return (
    <>
      <PageHeader
        eyebrow={dados.periodo}
        title="TRANSAÇÕES"
        action={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <SeletorPeriodo />
            <Button onClick={() => setEditando(editando === "nova" ? null : "nova")}>{editando === "nova" ? "CANCELAR" : "+ TRANSAÇÃO MANUAL"}</Button>
          </div>
        }
      />
      <div className="nm-content">
        {editando && (
          <Card title={editando === "nova" ? "NOVA TRANSAÇÃO MANUAL" : "EDITAR TRANSAÇÃO MANUAL"} meta="MANUAL">
            <FormTransacao
              key={editando === "nova" ? "nova" : editando.id}
              inicial={editando === "nova" ? null : editando}
              contas={[...new Set([...dados.contas.map((c) => c.nome), ...manuais.map((m) => m.conta)])]}
              categorias={dados.categorias.map((c) => ({ id: c.id, label: c.label }))}
              onSalvar={salvar}
              onCancelar={() => setEditando(null)}
            />
          </Card>
        )}

        <div className="nm-row" style={{ alignItems: "end" }}>
          <label className="nm-field" style={{ flex: "0 1 260px" }}>
            <span className="nm-eyebrow">CATEGORIA</span>
            <select className="nm-input" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todas">TODAS</option>
              {dados.categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="nm-field" style={{ flex: "0 1 200px" }}>
            <span className="nm-eyebrow">ORIGEM</span>
            <select className="nm-input" value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}>
              <option value="todas">TODAS</option>
              <option value="api">BANCO (API)</option>
              <option value="manual">MANUAL</option>
            </select>
          </label>
          {dados.origem === "pluggy" ? <Badge dark>VIA PLUGGY</Badge> : dados.origem === "manual" ? <Badge dark>SÓ MANUAIS</Badge> : <Badge>DADOS DE EXEMPLO</Badge>}
        </div>

        <Card title="GASTOS" meta={`${lista.length} · ${formatBRL(total)}`}>
          {lista.length === 0 ? (
            <p style={{ margin: 0 }}>Nenhum gasto neste período.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {lista.map((t) => {
                const manual = t.source === "manual" ? porId.get(t.id) : undefined;
                return (
                  <li key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--nm-grid)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ background: "var(--nm-black)", color: "var(--nm-off-white)", fontWeight: 800, padding: "2px 6px", fontSize: 12 }}>{fmtData(t.data)}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.descricao}</span>
                      <Badge>{labels.get(t.categoria) ?? "OUTROS"}</Badge>
                      {manual && <Badge dark>MANUAL</Badge>}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{formatBRL(t.valor)}</span>
                      {manual && <AcoesManual t={manual} onEditar={() => setEditando(manual)} onRemover={() => remover(manual.id)} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {outrasManuais.length > 0 && (
          <Card title="RECEITAS E APORTES MANUAIS" meta={`${outrasManuais.length} · TODOS OS PERÍODOS`}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {outrasManuais.map((t) => (
                <li key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--nm-grid)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ background: "var(--nm-black)", color: "var(--nm-off-white)", fontWeight: 800, padding: "2px 6px", fontSize: 12 }}>{fmtData(t.data)}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.descricao.toUpperCase()}</span>
                    <Badge>{t.tipo === "receita" ? "RECEITA" : "APORTE"}</Badge>
                    <span style={{ fontSize: 12 }}>{t.conta}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{t.tipo === "receita" ? "+" : ""}{formatBRL(t.valor)}</span>
                    <AcoesManual t={t} onEditar={() => setEditando(t)} onRemover={() => remover(t.id)} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

function AcoesManual({ t, onEditar, onRemover }: { t: TransacaoManual; onEditar: () => void; onRemover: () => void }) {
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button className="nm-icon-btn" onClick={onEditar} aria-label={`Editar ${t.descricao}`}>EDITAR</button>
      <ConfirmarExclusao rotulo={t.descricao} onConfirmar={onRemover} />
    </span>
  );
}

function FormTransacao({
  inicial,
  contas,
  categorias,
  onSalvar,
  onCancelar,
}: {
  inicial: TransacaoManual | null;
  contas: string[];
  categorias: { id: string; label: string }[];
  onSalvar: (t: TransacaoManual) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<CamposTransacao>(
    inicial
      ? { data: inicial.data, descricao: inicial.descricao, valor: String(inicial.valor), tipo: inicial.tipo, categoria: inicial.categoria, conta: inicial.conta }
      : { data: hojeIso(), descricao: "", valor: "", tipo: "despesa", categoria: categorias[0]?.id ?? "outros", conta: contas[0] ?? "CARTEIRA" },
  );
  const [tentou, setTentou] = useState(false);
  const erros = validarTransacao(f);

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erros.length) return;
    onSalvar({
      id: inicial?.id ?? `manual-${crypto.randomUUID()}`,
      data: f.data,
      descricao: f.descricao.trim(),
      valor: Number(f.valor),
      tipo: f.tipo,
      categoria: f.tipo === "despesa" ? f.categoria : "outros",
      conta: f.conta.trim().toUpperCase(),
      source: "manual",
    });
  }

  return (
    <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <div className="nm-row" style={{ gap: 16 }}>
        <Campo label="TIPO">
          <select className="nm-input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoTransacao })}>
            {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Campo>
        <Campo label="DATA">
          <input className="nm-input" type="date" max={hojeIso()} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
        </Campo>
        <Campo label="VALOR (R$)">
          <input className="nm-input" type="number" min={0.01} step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="120,00" />
        </Campo>
      </div>
      <div className="nm-row" style={{ gap: 16 }}>
        <Campo label="DESCRIÇÃO">
          <input className="nm-input" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Supermercado" autoFocus />
        </Campo>
        {f.tipo === "despesa" && (
          <Campo label="CATEGORIA">
            <select className="nm-input" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Campo>
        )}
        <Campo label="CONTA">
          <input className="nm-input" list="nm-contas" value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })} placeholder="Ex.: NUBANK" />
          <datalist id="nm-contas">
            {contas.map((c) => <option key={c} value={c} />)}
          </datalist>
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
