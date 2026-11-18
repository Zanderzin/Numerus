# NUMERUS API

Backend do NUMERUS com três módulos: **Investimentos** (previsão de aporte com ML + simulação de Monte Carlo), **Assistente** (GPT-4o mini restrito a finanças) e **Notificações** (WhatsApp via sandbox da Twilio).

## Rodando

```bash
python -m venv .venv && source .venv/bin/activate   # windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # preencha as chaves
uvicorn app.main:app --reload
```

Documentação interativa: http://localhost:8000/docs · Testes: `pytest -q` (rodam sem rede e sem chaves).

## Rotas

| Rota | O que faz |
|---|---|
| `POST /investimentos/previsao-aporte` | prevê a sobra mensal do usuário a partir do histórico (`meses` ou `transacoes`) |
| `POST /investimentos/monte-carlo` | simula o patrimônio: faixas p5–p95 por mês, nominal e real, e probabilidade de bater a meta |
| `POST /investimentos/aporte-para-meta` | aporte mensal necessário para atingir a meta com X% de confiança |
| `POST /investimentos/plano` | previsão + Monte Carlo numa chamada só (o ML alimenta os aportes da simulação) |
| `POST /assistente/chat` | chat financeiro (`mensagem`, `historico`, `contexto`, `usuario_id`) |
| `POST /notificacoes/whatsapp` | envia mensagem livre ou pronta (`tipo`: `progresso_meta`, `conta_vencendo`) |
| `POST /webhooks/twilio` | quem manda mensagem para o sandbox recebe resposta do assistente |

## Decisões de método

**Previsão de aporte (ML).** O alvo é a sobra mensal (receita − despesa). Uma regressão Ridge (lags 1–3, média móvel de 3 meses, tendência e sazonalidade a partir de 15 meses) é comparada com um baseline de média móvel por **validação walk-forward**, que respeita a ordem temporal. O modelo só é usado se tiver MAE menor que o baseline; com menos de 6 meses de histórico, usa só o baseline. O aporte sugerido é o **percentil 25** da previsão: um valor sustentável na maioria dos meses.

**Monte Carlo.** CDI e IPCA são reamostrados **juntos**, em blocos de 12 meses, do histórico do Banco Central (API SGS, séries 4391 e 433). Isso preserva a correlação entre juros e inflação e a persistência dos ciclos de juros. A renda variável usa retornos lognormais com premissas explícitas (12% a.a., volatilidade de 25%), que podem ser ajustadas em `premissas`. Perfis: conservador 100% RF, moderado 70/30, arrojado 40/60, com rebalanceamento mensal. O IR é aproximado no resgate final (tabela regressiva na RF, 15% na RV). A meta é comparada em **valores reais**. No `/plano`, a incerteza da previsão de aporte entra na simulação, então o resultado combina o risco de mercado com o risco do próprio usuário.

**Assistente.** Funciona em camadas: Moderation API (gratuita) → classificador que decide se a pergunta é sobre finanças (se não for, o código recusa sem chamar o chat) → prompt de sistema restritivo → limites de custo (`max_tokens`, histórico curto, mensagens por hora). Mensagens com papel `system` vindas do front são descartadas.

## Configurar o sandbox da Twilio

1. Crie uma conta em twilio.com e abra **Messaging → Try it out → Send a WhatsApp message**.
2. No seu WhatsApp, mande `join <código>` para **+1 415 523 8886**. O código aparece nessa página. Cada número que for receber mensagens precisa fazer isso.
3. Copie o **Account SID** e o **Auth Token** para o `.env`.
4. Teste:
   ```bash
   curl -X POST localhost:8000/notificacoes/whatsapp -H "Content-Type: application/json" \
     -d '{"para":"61999998888","tipo":"progresso_meta","dados":{"nome":"Viagem","atual":2500,"alvo":5000}}'
   ```
5. (Opcional) Para conversar com o assistente pelo WhatsApp, exponha a API com `ngrok http 8000` e cole `https://<seu-ngrok>/webhooks/twilio` em **"When a message comes in"** nas configurações do sandbox.

No sandbox, mensagens livres só chegam até 24h depois da última mensagem do usuário para o número.

## Chamando do front

```js
const API = "http://localhost:8000";

// aba investimentos: plano completo
const plano = await fetch(`${API}/investimentos/plano`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ meses_historico: historico, meses: 60, perfil: "moderado", meta: 50000 }),
}).then(r => r.json());
// plano.simulacao.trajetoria_real.{p5,p25,p50,p75,p95} -> gráfico de leque
// plano.simulacao.prob_atingir_meta, plano.previsao.aporte_sugerido

// aba assistente: envie o plano como contexto para respostas personalizadas
const { resposta } = await fetch(`${API}/assistente/chat`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mensagem, historico: msgs, contexto: { plano: plano.previsao }, usuario_id }),
}).then(r => r.json());
```

A chave da OpenAI fica só no `.env` do backend. Nunca coloque no front.
