import os
from pathlib import Path

from dotenv import load_dotenv

# local: numerus-api/.env first, then the repo root .env (where the pluggy keys already live).
# on vercel the project env vars are already in the environment and nothing is overridden.
load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# openai
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# twilio (sandbox do whatsapp)
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
# número fixo do sandbox da twilio
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
# quando true, valida a assinatura dos webhooks da twilio
TWILIO_VALIDAR_ASSINATURA = os.getenv("TWILIO_VALIDAR_ASSINATURA", "false").lower() == "true"

# limites de uso do assistente (protege o crédito da api)
LIMITE_MSGS_POR_HORA = int(os.getenv("LIMITE_MSGS_POR_HORA", "30"))
MAX_TOKENS_RESPOSTA = int(os.getenv("MAX_TOKENS_RESPOSTA", "400"))
MAX_HISTORICO = int(os.getenv("MAX_HISTORICO", "6"))

# origens liberadas para o front (separadas por vírgula)
CORS_ORIGENS = [o.strip() for o in os.getenv("CORS_ORIGENS", "*").split(",")]

# pluggy (agregador bancário, sandbox)
PLUGGY_CLIENT_ID = os.getenv("PLUGGY_CLIENT_ID", "")
PLUGGY_CLIENT_SECRET = os.getenv("PLUGGY_CLIENT_SECRET", "")
