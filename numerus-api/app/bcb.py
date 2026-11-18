"""busca séries históricas na api sgs do banco central (gratuita, sem chave)."""
from functools import lru_cache

import httpx
import numpy as np

SGS_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial={inicio}"

# códigos sgs de séries mensais em % ao mês
SERIES = {
    "cdi": 4391,   # cdi acumulado no mês
    "ipca": 433,   # ipca variação mensal
}


@lru_cache(maxsize=8)
def serie_mensal(nome: str, inicio: str = "01/01/2010") -> tuple:
    """retorna a série como tupla de retornos decimais (0.01 = 1%). tupla para caber no cache."""
    url = SGS_URL.format(codigo=SERIES[nome], inicio=inicio)
    r = httpx.get(url, timeout=10)
    r.raise_for_status()
    valores = [float(p["valor"].replace(",", ".")) / 100 for p in r.json()]
    return tuple(valores)


def historico(nome: str) -> np.ndarray | None:
    """tenta buscar a série; devolve none se a api estiver fora (aí o monte carlo usa premissas)."""
    try:
        dados = serie_mensal(nome)
        return np.array(dados) if len(dados) >= 24 else None
    except Exception:
        return None
