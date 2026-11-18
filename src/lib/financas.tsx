import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DADOS_EXEMPLO, type Dados } from "./data";
import { carregarTransacoesManuais, mesclarManuais, salvarTransacoesManuais, type TransacaoManual } from "./manuais";
import { carregarDadosPluggy, pluggyConfigurado, PERIODOS, type Periodo } from "./pluggy";

const KEY_ITENS = "numerus.pluggy.itemIds";
const KEY_ITEM_ANTIGO = "numerus.pluggy.itemId"; // single-connection key from before multi-item support
const KEY_DIAS = "numerus.pluggy.dias";

type Estado = "exemplo" | "carregando" | "conectado" | "erro";

type Financas = {
  dados: Dados;
  estado: Estado;
  erro: string | null;
  configurado: boolean; // server has pluggy credentials
  itemIds: string[]; // every connected institution
  dias: Periodo;
  setDias: (d: Periodo) => void;
  conectar: (itemId: string) => void; // adds (or refreshes) a connection
  desconectar: (itemId?: string) => void; // removes one, or all when omitted
  atualizar: () => void;
  versao: number; // bumps on every refresh, so other loaders (investments) can follow
  manuais: TransacaoManual[]; // every manual transaction, inside the window or not
  setManuais: (f: (l: TransacaoManual[]) => TransacaoManual[]) => void;
};

const Ctx = createContext<Financas | null>(null);

function lerItens(): string[] {
  try {
    const raw = localStorage.getItem(KEY_ITENS);
    if (raw) return (JSON.parse(raw) as unknown[]).filter((x): x is string => typeof x === "string");
    // migrate the old single connection
    const antigo = localStorage.getItem(KEY_ITEM_ANTIGO);
    return antigo ? [antigo] : [];
  } catch {
    return [];
  }
}

function gravarItens(ids: string[]) {
  try {
    localStorage.setItem(KEY_ITENS, JSON.stringify(ids));
    localStorage.removeItem(KEY_ITEM_ANTIGO);
  } catch {
    // storage unavailable — connections just won't survive a reload
  }
}

function lerDias(): Periodo {
  try {
    const v = Number(localStorage.getItem(KEY_DIAS));
    return (PERIODOS as readonly number[]).includes(v) ? (v as Periodo) : 30;
  } catch {
    return 30;
  }
}

export function FinancasProvider({ children }: { children: ReactNode }) {
  const [itemIds, setItemIds] = useState<string[]>(lerItens);
  const [base, setDados] = useState<Dados>(DADOS_EXEMPLO); // api or sample data, before manual entries
  const [manuais, setManuaisState] = useState<TransacaoManual[]>(carregarTransacoesManuais);
  const [estado, setEstado] = useState<Estado>(itemIds.length ? "carregando" : "exemplo");
  const [erro, setErro] = useState<string | null>(null);
  const [configurado, setConfigurado] = useState(false);
  const [versao, setVersao] = useState(0);
  const [dias, setDiasState] = useState<Periodo>(lerDias);

  const setDias = useCallback((d: Periodo) => {
    try {
      localStorage.setItem(KEY_DIAS, String(d));
    } catch {
      // ignore
    }
    setDiasState(d);
  }, []);

  useEffect(() => {
    pluggyConfigurado().then(setConfigurado);
  }, []);

  // a stable key so a new array with the same ids doesn't refetch
  const chaveItens = itemIds.join(",");

  useEffect(() => {
    const ids = chaveItens ? chaveItens.split(",") : [];
    if (ids.length === 0) {
      setDados(DADOS_EXEMPLO);
      setEstado("exemplo");
      setErro(null);
      return;
    }
    let ativo = true;
    setEstado("carregando");
    setErro(null);
    carregarDadosPluggy(ids, dias)
      .then(({ dados: d, erros }) => {
        if (!ativo) return;
        setDados(d);
        setEstado("conectado");
        // partial failure: show the data we have and say what failed
        setErro(erros.length ? `${erros.length} conexão(ões) falharam: ${erros.join(" · ")}` : null);
      })
      .catch((e: Error) => {
        if (!ativo) return;
        setDados(DADOS_EXEMPLO);
        setErro(e.message);
        setEstado("erro");
      });
    return () => {
      ativo = false;
    };
  }, [chaveItens, dias, versao]);

  const conectar = useCallback((id: string) => {
    setItemIds((atual) => {
      const novo = atual.includes(id) ? atual : [...atual, id];
      gravarItens(novo);
      return novo;
    });
    setVersao((v) => v + 1);
  }, []);

  const desconectar = useCallback((id?: string) => {
    setItemIds((atual) => {
      const novo = id ? atual.filter((x) => x !== id) : [];
      gravarItens(novo);
      return novo;
    });
    setErro(null);
  }, []);

  const atualizar = useCallback(() => setVersao((v) => v + 1), []);

  const setManuais = useCallback((f: (l: TransacaoManual[]) => TransacaoManual[]) => {
    setManuaisState((atual) => {
      const novo = f(atual);
      salvarTransacoesManuais(novo);
      return novo;
    });
  }, []);

  // every page reads this merged view, so manual entries flow into all screens and analyses
  const dados = useMemo(() => mesclarManuais(base, manuais, dias), [base, manuais, dias]);

  return (
    <Ctx.Provider value={{ dados, estado, erro, configurado, itemIds, dias, setDias, conectar, desconectar, atualizar, versao, manuais, setManuais }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFinancas(): Financas {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFinancas precisa do FinancasProvider");
  return ctx;
}
