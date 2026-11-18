import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, PageHeader } from "../components/ui";
import { responder, type Mensagem, type Resposta } from "../lib/assistente";
import { useFinancas } from "../lib/financas";

const SUGESTOES = ["Quanto gastei?", "Onde posso cortar?", "Como estão minhas metas?", "CDB ou Tesouro Selic?", "Como montar uma reserva de emergência?"];

const BOAS_VINDAS: Mensagem = {
  id: "inicio",
  autor: "bot",
  texto: "Olá! Sou o assistente financeiro do NUMERUS. Posso analisar seus gastos, tetos e metas, e tirar dúvidas sobre investimentos, dívidas e orçamento. Como posso ajudar?",
};

export default function Assistente() {
  const { dados } = useFinancas();
  const [mensagens, setMensagens] = useState<Mensagem[]>([BOAS_VINDAS]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [origem, setOrigem] = useState<Resposta["origem"] | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, pensando]);

  async function enviar(conteudo: string) {
    const limpo = conteudo.trim();
    if (!limpo || pensando) return;
    const historico = [...mensagens, { id: crypto.randomUUID(), autor: "user" as const, texto: limpo }];
    setMensagens(historico);
    setTexto("");
    setPensando(true);
    try {
      const resposta = await responder(historico, dados);
      setOrigem(resposta.origem);
      setMensagens((m) => [...m, { id: crypto.randomUUID(), autor: "bot", texto: resposta.texto }]);
    } catch {
      setMensagens((m) => [...m, { id: crypto.randomUUID(), autor: "bot", texto: "Não consegui responder agora. Tente de novo." }]);
    } finally {
      setPensando(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    enviar(texto);
  }

  return (
    <>
      <PageHeader
        eyebrow={dados.periodo}
        title="ASSISTENTE"
        action={<Button variant="secondary" onClick={() => setMensagens([BOAS_VINDAS])}>NOVA CONVERSA</Button>}
      />
      <div className="nm-content" style={{ flex: 1 }}>
        <div className="nm-chat">
          <div className="nm-chat-log" aria-live="polite">
            {mensagens.map((m) => (
              <div key={m.id} className={`nm-msg ${m.autor === "user" ? "nm-msg-user" : "nm-msg-bot"}`}>
                {m.autor === "bot" && <div className="nm-eyebrow" style={{ marginBottom: 4 }}>NUMERUS</div>}
                {m.texto}
              </div>
            ))}
            {pensando && (
              <div className="nm-msg nm-msg-bot nm-typing" aria-label="Assistente digitando">
                <span /><span /><span />
              </div>
            )}
            <div ref={fimRef} />
          </div>

          {mensagens.length === 1 && (
            <div className="nm-chips">
              {SUGESTOES.map((s) => (
                <button key={s} className="nm-icon-btn" onClick={() => enviar(s)}>{s.toUpperCase()}</button>
              ))}
            </div>
          )}

          <form className="nm-chat-form" onSubmit={onSubmit}>
            <input
              className="nm-input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pergunte sobre seus gastos, metas, investimentos…"
              aria-label="Mensagem"
            />
            <Button type="submit" disabled={!texto.trim() || pensando}>ENVIAR</Button>
          </form>
        </div>
        <div>
          {origem === "local" ? (
            <Badge dark>API OFFLINE · RESPOSTAS LOCAIS</Badge>
          ) : (
            <Badge>GPT-4O MINI · SOMENTE FINANÇAS</Badge>
          )}
        </div>
      </div>
    </>
  );
}
