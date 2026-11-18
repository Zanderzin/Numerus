"""simulação de monte carlo do patrimônio investido.

decisões de método:
- renda fixa (cdi) e inflação (ipca) são reamostradas juntas por bootstrap em blocos de 12 meses
  do histórico do banco central. sortear os mesmos meses para as duas séries preserva a correlação
  entre juros e inflação, e os blocos preservam a persistência dos ciclos de juros (o cdi não muda
  aleatoriamente mês a mês).
- renda variável usa retornos lognormais com premissas explícitas (retorno e volatilidade anuais),
  porque não há série mensal de ibovespa no sgs e o histórico curto é muito sensível ao período.
- se a api do bcb estiver fora, a renda fixa e a inflação caem para premissas paramétricas.
- o aporte mensal pode ter incerteza (média e desvio vindos do modelo de previsão de sobra),
  então a simulação propaga tanto o risco do mercado quanto o risco do próprio usuário.
"""
from dataclasses import dataclass, field

import numpy as np

from . import bcb

PERFIS = {
    "conservador": {"rf": 1.0, "rv": 0.0},
    "moderado": {"rf": 0.7, "rv": 0.3},
    "arrojado": {"rf": 0.4, "rv": 0.6},
}

# premissas usadas quando não há histórico ou para renda variável
PREMISSAS = {
    "cdi_anual": 0.105,
    "cdi_vol_mensal": 0.0015,
    "ipca_anual": 0.045,
    "ipca_vol_mensal": 0.003,
    "rv_retorno_anual": 0.12,
    "rv_vol_anual": 0.25,
}

PERCENTIS = [5, 25, 50, 75, 95]


@dataclass
class ParametrosSimulacao:
    meses: int
    perfil: str = "moderado"
    valor_inicial: float = 0.0
    aporte_mensal: float = 0.0
    aporte_desvio: float = 0.0          # incerteza do aporte (vem da previsão de ml)
    aportes_previstos: list[float] | None = None  # aporte específico por mês (opcional)
    meta: float | None = None
    descontar_ir: bool = True
    n_simulacoes: int = 5000
    semente: int | None = None
    premissas: dict = field(default_factory=dict)


def _bootstrap_blocos(series: list[np.ndarray], n_sim: int, meses: int, bloco: int, rng) -> list[np.ndarray]:
    """sorteia blocos contíguos com os mesmos índices para todas as séries."""
    n = len(series[0])
    n_blocos = int(np.ceil(meses / bloco))
    inicios = rng.integers(0, n - bloco + 1, size=(n_sim, n_blocos))
    idx = (inicios[:, :, None] + np.arange(bloco)[None, None, :]).reshape(n_sim, -1)[:, :meses]
    return [s[idx] for s in series]


def _retornos_rf_e_inflacao(n_sim, meses, prem, rng):
    cdi_hist, ipca_hist = bcb.historico("cdi"), bcb.historico("ipca")
    if cdi_hist is not None and ipca_hist is not None:
        n = min(len(cdi_hist), len(ipca_hist))
        cdi, ipca = _bootstrap_blocos([cdi_hist[-n:], ipca_hist[-n:]], n_sim, meses, 12, rng)
        return cdi, ipca, "historico_bcb"
    cdi_m = (1 + prem["cdi_anual"]) ** (1 / 12) - 1
    ipca_m = (1 + prem["ipca_anual"]) ** (1 / 12) - 1
    cdi = rng.normal(cdi_m, prem["cdi_vol_mensal"], (n_sim, meses))
    ipca = rng.normal(ipca_m, prem["ipca_vol_mensal"], (n_sim, meses))
    return cdi, ipca, "premissas"


def _retornos_rv(n_sim, meses, prem, rng):
    # converte retorno e volatilidade anuais em parâmetros mensais de log-retorno
    mu_log = np.log(1 + prem["rv_retorno_anual"]) / 12
    sigma = prem["rv_vol_anual"] / np.sqrt(12)
    return np.exp(rng.normal(mu_log - sigma**2 / 2, sigma, (n_sim, meses))) - 1


def _aliquota_ir_rf(meses: int) -> float:
    # tabela regressiva da renda fixa
    if meses <= 6:
        return 0.225
    if meses <= 12:
        return 0.20
    if meses <= 24:
        return 0.175
    return 0.15


def simular(p: ParametrosSimulacao) -> dict:
    if p.perfil not in PERFIS:
        raise ValueError(f"perfil inválido: {p.perfil}")
    if p.meses < 1 or p.meses > 600:
        raise ValueError("meses deve estar entre 1 e 600")

    prem = {**PREMISSAS, **(p.premissas or {})}
    rng = np.random.default_rng(p.semente)
    n, m = p.n_simulacoes, p.meses
    pesos = PERFIS[p.perfil]

    cdi, ipca, fonte = _retornos_rf_e_inflacao(n, m, prem, rng)
    rv = _retornos_rv(n, m, prem, rng)
    # rebalanceamento mensal: retorno da carteira é a média ponderada
    ret_carteira = pesos["rf"] * cdi + pesos["rv"] * rv

    # aportes: por mês previsto ou constante, com ruído se houver desvio
    if p.aportes_previstos:
        prev = list(p.aportes_previstos)[:m]
        # depois do horizonte previsto, repete o último valor
        base = np.array(prev + [prev[-1]] * (m - len(prev)), dtype=float)
    else:
        base = np.full(m, p.aporte_mensal)
    aportes = base[None, :] + rng.normal(0, p.aporte_desvio, (n, m)) if p.aporte_desvio > 0 else np.tile(base, (n, 1))
    aportes = np.clip(aportes, 0, None)

    saldo = np.full(n, p.valor_inicial, dtype=float)
    trajetoria = np.empty((n, m))
    for t in range(m):
        # aporte no início do mês, rendimento ao longo do mês
        saldo = (saldo + aportes[:, t]) * (1 + ret_carteira[:, t])
        trajetoria[:, t] = saldo

    total_aportado = p.valor_inicial + aportes.sum(axis=1)
    if p.descontar_ir:
        # aproximação: ir só no resgate final, sobre o ganho, com alíquota ponderada pelo perfil
        aliquota = pesos["rf"] * _aliquota_ir_rf(m) + pesos["rv"] * 0.15
        ganho = np.clip(trajetoria[:, -1] - total_aportado, 0, None)
        trajetoria[:, -1] -= ganho * aliquota

    # valores reais: divide pela inflação acumulada da mesma trajetória
    inflacao_acum = np.cumprod(1 + ipca, axis=1)
    trajetoria_real = trajetoria / inflacao_acum

    def faixa(arr):
        q = np.percentile(arr, PERCENTIS, axis=0)
        return {f"p{pc}": np.round(q[i], 2).tolist() for i, pc in enumerate(PERCENTIS)}

    final = trajetoria[:, -1]
    final_real = trajetoria_real[:, -1]
    resultado = {
        "fonte_renda_fixa": fonte,
        "perfil": p.perfil,
        "meses": m,
        "n_simulacoes": n,
        "total_aportado_medio": round(float(total_aportado.mean()), 2),
        "final_nominal": {f"p{pc}": round(float(np.percentile(final, pc)), 2) for pc in PERCENTIS},
        "final_real": {f"p{pc}": round(float(np.percentile(final_real, pc)), 2) for pc in PERCENTIS},
        "trajetoria_nominal": faixa(trajetoria),
        "trajetoria_real": faixa(trajetoria_real),
        "premissas": prem,
    }
    if p.meta:
        # meta comparada em valores de hoje (reais), que é o que o usuário entende
        resultado["meta"] = p.meta
        resultado["prob_atingir_meta"] = round(float((final_real >= p.meta).mean()), 4)
    return resultado


def aporte_para_meta(meta: float, meses: int, perfil: str = "moderado", valor_inicial: float = 0.0,
                     confianca: float = 0.5, n_simulacoes: int = 2000, semente: int | None = 42) -> dict:
    """busca binária do aporte mensal que atinge a meta (em valores reais) com a confiança pedida."""
    lo, hi = 0.0, max(meta / max(meses, 1) * 2, 100.0)
    # garante que o limite superior atinge a meta
    while simular(ParametrosSimulacao(meses, perfil, valor_inicial, hi, meta=meta,
                                      n_simulacoes=n_simulacoes, semente=semente))["prob_atingir_meta"] < confianca:
        hi *= 2
        if hi > meta * 10:
            break
    for _ in range(25):
        mid = (lo + hi) / 2
        prob = simular(ParametrosSimulacao(meses, perfil, valor_inicial, mid, meta=meta,
                                           n_simulacoes=n_simulacoes, semente=semente))["prob_atingir_meta"]
        lo, hi = (mid, hi) if prob < confianca else (lo, mid)
    return {"meta": meta, "meses": meses, "perfil": perfil, "confianca": confianca,
            "aporte_mensal_necessario": float(np.ceil(hi * 100) / 100)}
