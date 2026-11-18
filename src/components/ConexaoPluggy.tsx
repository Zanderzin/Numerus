import { useState } from "react";
import { PluggyConnect } from "react-pluggy-connect";
import { useFinancas } from "../lib/financas";
import { criarConnectToken, rotuloPeriodo } from "../lib/pluggy";
import SeletorPeriodo from "./SeletorPeriodo";
import { Badge, Button, Card } from "./ui";
import { formatBRL } from "../lib/currency";

// connect several institutions through the pluggy connect widget (sandbox),
// then refresh / reconnect / remove each one
export default function ConexaoPluggy() {
  const { estado, erro, configurado, itemIds, dados, dias, conectar, desconectar, atualizar } = useFinancas();
  const [token, setToken] = useState<string | null>(null);
  const [itemUpdate, setItemUpdate] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erroWidget, setErroWidget] = useState<string | null>(null);

  // `update` = item id to reconnect; omitted opens a brand-new connection
  async function abrir(update?: string) {
    setAbrindo(true);
    setErroWidget(null);
    try {
      setToken(await criarConnectToken(update));
      setItemUpdate(update ?? null);
    } catch (e) {
      setErroWidget(e instanceof Error ? e.message : String(e));
    } finally {
      setAbrindo(false);
    }
  }

  const conectado = estado === "conectado";
  const nomes = new Map((dados.conexoes ?? []).map((c) => [c.id, c.instituicao]));

  return (
    <Card title="CONEXÕES BANCÁRIAS" meta={`PLUGGY · SANDBOX · ${itemIds.length}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Badge dark={conectado} tom={estado === "erro" ? "negativo" : undefined}>
            {estado === "carregando" ? "CARREGANDO…" : conectado ? "CONECTADO" : estado === "erro" ? "▼ ERRO" : "DADOS DE EXEMPLO"}
          </Badge>
          {conectado && <span style={{ fontWeight: 700 }}>{dados.transacoes.length} gastos · últimos {rotuloPeriodo(dias).toLowerCase()}</span>}
          <span style={{ marginLeft: "auto" }}><SeletorPeriodo /></span>
        </div>

        {!configurado && (
          <p style={{ margin: 0 }}>
            Para conectar, crie o arquivo <code>.env</code> com <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code> (veja <code>.env.example</code>) e reinicie o <code>npm run dev</code>.
          </p>
        )}

        {configurado && (
          <p style={{ margin: 0, fontSize: 13 }}>
            Sandbox: usuário <code>user-ok</code>, senha <code>password-ok</code> (código <code>123456</code> se pedir). Dá para conectar vários conectores — ex.:{" "}
            <strong>Pluggy Bank</strong>, <strong>Pluggy Bank Investment</strong> (carteira de investimentos) e <strong>Pluggy Bank Business</strong>.
          </p>
        )}

        {itemIds.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "var(--nm-border-row)" }}>
            {itemIds.map((id) => {
              const contas = dados.contas.filter((c) => c.itemId === id);
              return (
                <li key={id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--nm-grid)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <strong>{(nomes.get(id) ?? (estado === "carregando" ? "CARREGANDO…" : "CONEXÃO SEM RESPOSTA")).toUpperCase()}</strong>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="nm-icon-btn" onClick={() => abrir(id)} disabled={!configurado || abrindo}>RECONECTAR</button>
                      <button className="nm-icon-btn" onClick={() => desconectar(id)} aria-label={`Remover conexão ${nomes.get(id) ?? id}`}>REMOVER</button>
                    </span>
                  </div>
                  {contas.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                      <span>{c.nome} · {c.tipo === "CREDIT" ? "CARTÃO" : "CONTA"}</span>
                      <span style={{ fontWeight: 800 }}>{formatBRL(c.saldo)}</span>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}

        {(erro || erroWidget) && (
          <p style={{ margin: 0 }}><Badge tom="negativo">▼ ERRO</Badge> {erroWidget ?? erro}</p>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button onClick={() => abrir()} disabled={!configurado || abrindo}>
            {abrindo ? "ABRINDO…" : itemIds.length ? "+ CONECTAR OUTRA INSTITUIÇÃO" : "CONECTAR BANCO"}
          </Button>
          {itemIds.length > 0 && (
            <>
              <Button variant="secondary" onClick={atualizar} disabled={estado === "carregando"}>ATUALIZAR DADOS</Button>
              <Button variant="secondary" onClick={() => desconectar()}>DESCONECTAR TODAS</Button>
            </>
          )}
        </div>
      </div>

      {token && (
        <PluggyConnect
          connectToken={token}
          includeSandbox
          language="pt"
          updateItem={itemUpdate ?? undefined}
          onSuccess={({ item }) => {
            setToken(null);
            conectar(item.id);
          }}
          onError={({ message }) => setErroWidget(message)}
          onClose={() => setToken(null)}
        />
      )}
    </Card>
  );
}
