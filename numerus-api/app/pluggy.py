"""cliente da api pluggy (roda só no servidor).

o client secret nunca chega ao navegador: o front recebe apenas connect tokens
de curta duração e dados já buscados. antes isso vivia num middleware do vite
(server/pluggy.ts), que não existe num deploy estático; agora é parte da api.

rotas (prefixo /api/pluggy):
  GET  /status                     → { configurado }
  POST /connect-token              → { accessToken }          corpo: { itemId? }
  GET  /dados?itemId&from&to       → { item, contas, transacoes }
  GET  /investimentos?itemId       → { item, investimentos }
"""
import time

import httpx
from fastapi import APIRouter, Body, Query
from fastapi.responses import JSONResponse

from . import config

API = "https://api.pluggy.ai"

router = APIRouter(prefix="/api/pluggy", tags=["pluggy"])

_cache: dict = {"api_key": None, "expira": 0.0}


def _configurado() -> bool:
    return bool(config.PLUGGY_CLIENT_ID and config.PLUGGY_CLIENT_SECRET)


def _api_key(cliente: httpx.Client) -> str:
    if _cache["api_key"] and _cache["expira"] > time.time():
        return _cache["api_key"]
    r = cliente.post(f"{API}/auth", json={"clientId": config.PLUGGY_CLIENT_ID, "clientSecret": config.PLUGGY_CLIENT_SECRET})
    if r.status_code >= 400:
        raise RuntimeError(f"Pluggy /auth falhou ({r.status_code}). Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.")
    # a api key dura 2h; renova um pouco antes
    _cache.update(api_key=r.json()["apiKey"], expira=time.time() + 110 * 60)
    return _cache["api_key"]


def _pluggy(cliente: httpx.Client, metodo: str, caminho: str, **kw):
    r = cliente.request(metodo, f"{API}{caminho}", headers={"X-API-KEY": _api_key(cliente)}, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"Pluggy {caminho.split('?')[0]} falhou ({r.status_code}): {r.text}")
    return r.json()


def _transacoes(cliente: httpx.Client, account_id: str, de: str, ate: str) -> list:
    """GET /v2/transactions com paginação por cursor; `next` pode vir como caminho, query ou cursor puro."""
    filtros = {"accountId": account_id, "dateFrom": de, "dateTo": ate}
    todas: list = []
    caminho: str | None = "/v2/transactions?" + str(httpx.QueryParams(filtros))
    for _ in range(50):
        if not caminho:
            break
        r = _pluggy(cliente, "GET", caminho)
        todas.extend(r["results"])
        nxt = r.get("next")
        if not nxt:
            caminho = None
        elif nxt.startswith("/"):
            caminho = nxt
        elif nxt.startswith("?"):
            caminho = "/v2/transactions" + nxt
        else:
            caminho = "/v2/transactions?" + str(httpx.QueryParams({**filtros, "after": nxt}))
    return todas


def _investimentos(cliente: httpx.Client, item_id: str) -> list:
    """GET /investments com paginação por número de página."""
    todos: list = []
    pagina, total = 1, 1
    while pagina <= total and pagina <= 20:
        r = _pluggy(cliente, "GET", "/investments", params={"itemId": item_id, "pageSize": 500, "page": pagina})
        todos.extend(r["results"])
        total = r.get("totalPages") or 1
        pagina += 1
    return todos


def _instituicao(cliente: httpx.Client, item_id: str) -> dict:
    """o nome da instituição vem do conector do item (ex.: "XP", "Nubank")."""
    item = _pluggy(cliente, "GET", f"/items/{item_id}")
    conector = item.get("connector") or {}
    return {"id": item["id"], "instituicao": conector.get("name") or "INSTITUIÇÃO", "imagem": conector.get("imageUrl")}


# o front lê `erro` no topo do corpo (não em `detail`), como no middleware antigo
def _erro(status: int, msg: str) -> JSONResponse:
    return JSONResponse({"erro": msg}, status_code=status)


SEM_CONFIG = "Pluggy não configurado. Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET."


@router.get("/status")
def status():
    return {"configurado": _configurado()}


@router.post("/connect-token")
def connect_token(corpo: dict = Body(default={})):
    if not _configurado():
        return _erro(503, SEM_CONFIG)
    item_id = corpo.get("itemId") if isinstance(corpo, dict) else None
    try:
        with httpx.Client(timeout=30) as c:
            r = _pluggy(c, "POST", "/connect_token", json={"itemId": item_id} if isinstance(item_id, str) else {})
        return {"accessToken": r["accessToken"]}
    except RuntimeError as err:
        return _erro(502, str(err))


@router.get("/dados")
def dados(item_id: str = Query(..., alias="itemId"), de: str = Query(..., alias="from"), ate: str = Query(..., alias="to")):
    if not _configurado():
        return _erro(503, SEM_CONFIG)
    try:
        with httpx.Client(timeout=60) as c:
            item = _instituicao(c, item_id)
            contas = _pluggy(c, "GET", "/accounts", params={"itemId": item_id})["results"]
            transacoes = [t for conta in contas for t in _transacoes(c, conta["id"], de, ate)]
        return {"item": item, "contas": contas, "transacoes": transacoes}
    except RuntimeError as err:
        return _erro(502, str(err))


@router.get("/investimentos")
def investimentos(item_id: str = Query(..., alias="itemId")):
    if not _configurado():
        return _erro(503, SEM_CONFIG)
    try:
        with httpx.Client(timeout=60) as c:
            return {"item": _instituicao(c, item_id), "investimentos": _investimentos(c, item_id)}
    except RuntimeError as err:
        return _erro(502, str(err))
