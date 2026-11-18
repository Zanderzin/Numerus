"""previsão da sobra mensal do usuário (receita - despesa), usada como aporte nas metas.

decisões de método:
- o alvo é a sobra mensal, não receita e despesa separadas: é a grandeza que vira aporte.
- usuários têm poucos meses de histórico, então modelos complexos sobreajustam. comparamos uma
  regressão ridge (lags, média móvel, tendência e sazonalidade quando há 15+ meses) contra um
  baseline de média móvel de 3 meses.
- a escolha é feita por validação walk-forward (treina até o mês t, prevê t+1, avança), que respeita
  a ordem temporal. validação cruzada comum vazaria o futuro para o treino.
- o modelo só vence se tiver mae menor que o baseline; com menos de 6 meses usamos só o baseline.
- a incerteza vem dos erros fora da amostra da validação e cresce com a raiz do horizonte.
- o aporte sugerido é o percentil 25 da previsão: um valor que o usuário consegue manter na
  maioria dos meses, em vez da média, que falharia metade das vezes.
"""
from collections import defaultdict

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MIN_MESES_MODELO = 6
Z_P25 = 0.674


def agregar_transacoes(transacoes: list[dict]) -> list[dict]:
    """transações [{data: 'aaaa-mm-dd', valor, tipo: 'receita'|'despesa'}] -> totais por mês."""
    por_mes = defaultdict(lambda: {"receita": 0.0, "despesa": 0.0})
    for t in transacoes:
        mes = str(t["data"])[:7]
        tipo = t["tipo"].lower()
        if tipo not in ("receita", "despesa"):
            raise ValueError(f"tipo inválido: {t['tipo']}")
        por_mes[mes][tipo] += abs(float(t["valor"]))
    return [{"mes": m, **v} for m, v in sorted(por_mes.items())]


def _features(y: np.ndarray, t: int, usar_sazonal: bool, mes_inicial: int) -> list[float]:
    """features para prever y[t] usando só y[:t]."""
    f = [y[t - 1], y[t - 2], y[t - 3], y[t - 3:t].mean(), float(t)]
    if usar_sazonal:
        mes = (mes_inicial + t) % 12
        f += [np.sin(2 * np.pi * mes / 12), np.cos(2 * np.pi * mes / 12)]
    return f


def _novo_modelo():
    return make_pipeline(StandardScaler(), Ridge(alpha=1.0))


def _walk_forward(y: np.ndarray, usar_sazonal: bool, mes_inicial: int, inicio: int):
    """devolve erros fora da amostra do baseline e do ridge."""
    erros_base, erros_ridge = [], []
    for t in range(inicio, len(y)):
        erros_base.append(y[t] - y[t - 3:t].mean())
        X = np.array([_features(y, i, usar_sazonal, mes_inicial) for i in range(3, t)])
        modelo = _novo_modelo().fit(X, y[3:t])
        pred = modelo.predict(np.array([_features(y, t, usar_sazonal, mes_inicial)]))[0]
        erros_ridge.append(y[t] - pred)
    return np.array(erros_base), np.array(erros_ridge)


def prever_sobra(meses: list[dict], horizonte: int = 6) -> dict:
    """meses: [{mes: 'aaaa-mm', receita, despesa}] em ordem cronológica."""
    if not meses:
        raise ValueError("é preciso pelo menos 1 mês de histórico")
    meses = sorted(meses, key=lambda d: d["mes"])
    y = np.array([float(d["receita"]) - float(d["despesa"]) for d in meses])
    n = len(y)
    mes_inicial = int(meses[0]["mes"][5:7]) - 1

    if n < MIN_MESES_MODELO:
        media = float(y[-3:].mean())
        desvio = float(y.std(ddof=1)) if n > 1 else abs(media) * 0.15
        previsoes = [media] * horizonte
        info = {"modelo": "baseline_media_movel", "motivo": f"menos de {MIN_MESES_MODELO} meses de histórico",
                "mae_baseline": None, "mae_ridge": None}
    else:
        usar_sazonal = n >= 15
        # o ridge precisa de algumas linhas de treino antes de começar a validar
        inicio = max(5, n // 2)
        e_base, e_ridge = _walk_forward(y, usar_sazonal, mes_inicial, inicio)
        mae_b, mae_r = float(np.abs(e_base).mean()), float(np.abs(e_ridge).mean())

        if mae_r < mae_b:
            X = np.array([_features(y, i, usar_sazonal, mes_inicial) for i in range(3, n)])
            modelo = _novo_modelo().fit(X, y[3:])
            serie = list(y)
            previsoes = []
            # previsão recursiva: cada previsão vira lag da próxima
            for _ in range(horizonte):
                arr = np.array(serie)
                p = float(modelo.predict(np.array([_features(arr, len(arr), usar_sazonal, mes_inicial)]))[0])
                previsoes.append(p)
                serie.append(p)
            desvio = float(e_ridge.std(ddof=1))
            nome = "ridge"
        else:
            previsoes = [float(y[-3:].mean())] * horizonte
            desvio = float(e_base.std(ddof=1))
            nome = "baseline_media_movel"
        info = {"modelo": nome, "motivo": "menor mae na validação walk-forward",
                "mae_baseline": round(mae_b, 2), "mae_ridge": round(mae_r, 2),
                "sazonalidade": usar_sazonal}

    desvios = [desvio * np.sqrt(h + 1) for h in range(horizonte)]
    media_prev = float(np.mean(previsoes))
    aporte_sugerido = max(0.0, media_prev - Z_P25 * desvio)

    return {
        **info,
        "meses_historico": n,
        "sobra_historica_media": round(float(y.mean()), 2),
        "previsoes": [
            {"passo": h + 1, "media": round(p, 2), "p25": round(p - Z_P25 * d, 2), "p75": round(p + Z_P25 * d, 2)}
            for h, (p, d) in enumerate(zip(previsoes, desvios))
        ],
        "desvio_mensal": round(desvio, 2),
        "aporte_sugerido": round(aporte_sugerido, 2),
    }
