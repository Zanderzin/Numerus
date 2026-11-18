import { useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { aplicarSeed, contarSeed, limparSeed } from "./seed";

// dev-only card on the painel: writes the seed to localStorage and reloads,
// so the provider and the portfolio hook start from the new data
export default function PainelDev() {
  const [qtd] = useState(contarSeed);

  return (
    <Card title="DEV · DADOS DE TESTE" meta="SÓ EM npm run dev">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0 }}>
          Gera ~6 meses de transações manuais (salário, aluguel, mercado, assinaturas, aportes) e 6 investimentos manuais fictícios. Suas entradas manuais são mantidas; só as linhas de teste são trocadas.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            onClick={() => {
              aplicarSeed();
              location.reload();
            }}
          >
            {qtd ? "REGERAR DADOS DE TESTE" : "GERAR DADOS DE TESTE"}
          </Button>
          {qtd > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                limparSeed();
                location.reload();
              }}
            >
              LIMPAR DADOS DE TESTE
            </Button>
          )}
          <Badge>{qtd ? `${qtd} LINHAS DE TESTE` : "SEM DADOS DE TESTE"}</Badge>
        </div>
        <p style={{ margin: 0, fontSize: 12 }}>
          Dica: escolha <strong>180 DIAS</strong> no seletor de período para ver os 6 meses. No console: <code>numerus.seed()</code> / <code>numerus.limpar()</code>.
        </p>
      </div>
    </Card>
  );
}
