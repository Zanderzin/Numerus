"""notificações por whatsapp via sandbox da twilio.

no sandbox, cada número que vai receber mensagens precisa antes enviar "join <código>" para
+1 415 523 8886 (o código aparece no console da twilio). mensagens livres funcionam por 24h depois
que o usuário fala com o sandbox; fora dessa janela, só templates aprovados.
"""
from twilio.rest import Client

from . import config

_cliente: Client | None = None


def cliente() -> Client:
    global _cliente
    if _cliente is None:
        if not (config.TWILIO_ACCOUNT_SID and config.TWILIO_AUTH_TOKEN):
            raise RuntimeError("TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN não configurados no .env")
        _cliente = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
    return _cliente


def normalizar_numero(numero: str) -> str:
    """aceita '61999998888', '+5561999998888' ou 'whatsapp:+55...' e devolve 'whatsapp:+55...'."""
    numero = numero.replace("whatsapp:", "").strip()
    digitos = "".join(c for c in numero if c.isdigit())
    if not numero.startswith("+") and len(digitos) in (10, 11):
        # número brasileiro sem código do país
        digitos = "55" + digitos
    return f"whatsapp:+{digitos}"


def enviar(para: str, mensagem: str) -> dict:
    msg = cliente().messages.create(from_=config.TWILIO_WHATSAPP_FROM, to=normalizar_numero(para), body=mensagem)
    return {"sid": msg.sid, "status": msg.status, "para": normalizar_numero(para)}


def brl(valor: float) -> str:
    """1234.5 -> 'R$ 1.234,50'"""
    return "R$ " + f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# mensagens prontas para eventos do app
def texto_progresso_meta(nome_meta: str, atual: float, alvo: float) -> str:
    pct = atual / alvo * 100 if alvo else 0
    return f"NUMERUS: sua meta \"{nome_meta}\" chegou a {pct:.0f}% ({brl(atual)} de {brl(alvo)})."


def texto_conta_vencendo(descricao: str, valor: float, vencimento: str) -> str:
    return f"NUMERUS: lembrete, \"{descricao}\" de {brl(valor)} vence em {vencimento}."
