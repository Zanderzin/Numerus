from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from twilio.request_validator import RequestValidator
from twilio.twiml.messaging_response import MessagingResponse

from . import assistente, config, montecarlo, previsao, whatsapp

app = FastAPI(title="NUMERUS API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGENS, allow_methods=["*"], allow_headers=["*"])


# ---------- modelos de entrada ----------
class Mes(BaseModel):
    mes: str = Field(..., examples=["2026-01"], pattern=r"^\d{4}-\d{2}$")
    receita: float
    despesa: float


class Transacao(BaseModel):
    data: str = Field(..., examples=["2026-01-15"])
    valor: float
    tipo: str = Field(..., examples=["despesa"])


class EntradaPrevisao(BaseModel):
    meses: list[Mes] | None = None
    transacoes: list[Transacao] | None = None
    horizonte: int = Field(6, ge=1, le=24)


class EntradaSimulacao(BaseModel):
    meses: int = Field(..., ge=1, le=600)
    perfil: str = "moderado"
    valor_inicial: float = Field(0, ge=0)
    aporte_mensal: float = Field(0, ge=0)
    aporte_desvio: float = Field(0, ge=0)
    aportes_previstos: list[float] | None = None
    meta: float | None = Field(None, gt=0)
    descontar_ir: bool = True
    n_simulacoes: int = Field(5000, ge=100, le=20000)
    semente: int | None = None
    premissas: dict | None = None


class EntradaMeta(BaseModel):
    meta: float = Field(..., gt=0)
    meses: int = Field(..., ge=1, le=600)
    perfil: str = "moderado"
    valor_inicial: float = Field(0, ge=0)
    confianca: float = Field(0.5, gt=0, lt=1)


class EntradaPlano(BaseModel):
    """previsão de ml + monte carlo em uma chamada."""
    meses_historico: list[Mes] | None = None
    transacoes: list[Transacao] | None = None
    meses: int = Field(..., ge=1, le=600)
    perfil: str = "moderado"
    valor_inicial: float = Field(0, ge=0)
    meta: float | None = Field(None, gt=0)


class EntradaChat(BaseModel):
    mensagem: str = Field(..., max_length=2000)
    historico: list[dict] | None = None
    contexto: dict | None = None
    usuario_id: str = "anonimo"


class EntradaWhatsApp(BaseModel):
    para: str = Field(..., examples=["61999998888"])
    mensagem: str | None = None
    # atalhos para mensagens prontas
    tipo: str | None = Field(None, examples=["progresso_meta", "conta_vencendo"])
    dados: dict | None = None


# ---------- rotas ----------
@app.get("/saude")
def saude():
    return {"ok": True, "openai": bool(config.OPENAI_API_KEY), "twilio": bool(config.TWILIO_ACCOUNT_SID)}


def _meses_de(meses, transacoes):
    if meses:
        return [m.model_dump() for m in meses]
    if transacoes:
        return previsao.agregar_transacoes([t.model_dump() for t in transacoes])
    raise HTTPException(422, "envie 'meses' ou 'transacoes'")


@app.post("/investimentos/previsao-aporte")
def previsao_aporte(e: EntradaPrevisao):
    try:
        return previsao.prever_sobra(_meses_de(e.meses, e.transacoes), e.horizonte)
    except ValueError as err:
        raise HTTPException(422, str(err))


@app.post("/investimentos/monte-carlo")
def monte_carlo(e: EntradaSimulacao):
    try:
        return montecarlo.simular(montecarlo.ParametrosSimulacao(**e.model_dump(exclude_none=True)))
    except ValueError as err:
        raise HTTPException(422, str(err))


@app.post("/investimentos/aporte-para-meta")
def aporte_para_meta(e: EntradaMeta):
    try:
        return montecarlo.aporte_para_meta(**e.model_dump())
    except ValueError as err:
        raise HTTPException(422, str(err))


@app.post("/investimentos/plano")
def plano(e: EntradaPlano):
    """o ml estima quanto o usuário consegue aportar; o monte carlo projeta até onde isso chega."""
    try:
        prev = previsao.prever_sobra(_meses_de(e.meses_historico, e.transacoes), horizonte=min(e.meses, 12))
        aportes = [max(0.0, p["p25"]) for p in prev["previsoes"]]
        sim = montecarlo.simular(montecarlo.ParametrosSimulacao(
            meses=e.meses, perfil=e.perfil, valor_inicial=e.valor_inicial,
            aportes_previstos=aportes, aporte_desvio=prev["desvio_mensal"] * 0.5,
            meta=e.meta,
        ))
        return {"previsao": prev, "simulacao": sim}
    except ValueError as err:
        raise HTTPException(422, str(err))


@app.post("/assistente/chat")
def chat(e: EntradaChat):
    try:
        return assistente.responder(e.mensagem, e.historico, e.contexto, e.usuario_id)
    except RuntimeError as err:
        raise HTTPException(503, str(err))


@app.post("/notificacoes/whatsapp")
def notificar(e: EntradaWhatsApp):
    d = e.dados or {}
    if e.tipo == "progresso_meta":
        texto = whatsapp.texto_progresso_meta(d["nome"], float(d["atual"]), float(d["alvo"]))
    elif e.tipo == "conta_vencendo":
        texto = whatsapp.texto_conta_vencendo(d["descricao"], float(d["valor"]), d["vencimento"])
    elif e.mensagem:
        texto = e.mensagem
    else:
        raise HTTPException(422, "envie 'mensagem' ou um 'tipo' com 'dados'")
    try:
        return whatsapp.enviar(e.para, texto)
    except RuntimeError as err:
        raise HTTPException(503, str(err))


@app.post("/webhooks/twilio")
async def webhook_twilio(request: Request):
    """mensagens recebidas no whatsapp do sandbox são respondidas pelo assistente financeiro."""
    form = dict(await request.form())
    if config.TWILIO_VALIDAR_ASSINATURA:
        validador = RequestValidator(config.TWILIO_AUTH_TOKEN)
        if not validador.validate(str(request.url), form, request.headers.get("X-Twilio-Signature", "")):
            raise HTTPException(403, "assinatura inválida")
    remetente = form.get("From", "anonimo")
    try:
        texto = assistente.responder(form.get("Body", ""), usuario_id=remetente)["resposta"]
    except RuntimeError:
        texto = "O assistente está indisponível no momento."
    resp = MessagingResponse()
    resp.message(texto[:1500])
    return Response(content=str(resp), media_type="application/xml")
