import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Bot, Send } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  aberta: "hsl(var(--chart-1))",
  "em atendimento": "hsl(var(--chart-2))",
  aguardando: "hsl(var(--chart-3))",
  finalizada: "hsl(var(--muted-foreground))",
};

const demoConversations = [
  { id: "1", name: "João Silva", msg: "Oi, quero saber sobre o produto X", time: "2min", status: "aberta", unread: 3 },
  { id: "2", name: "Maria Fernanda", msg: "Quando chega o pedido?", time: "15min", status: "em atendimento", unread: 1 },
  { id: "3", name: "Roberto Alves", msg: "Qual o prazo de entrega?", time: "1h", status: "aguardando", unread: 0 },
  { id: "4", name: "Carla Pinto", msg: "Obrigada pelo atendimento!", time: "2h", status: "finalizada", unread: 0 },
  { id: "5", name: "Lucas Mendes", msg: "Tem parcelamento?", time: "3h", status: "aberta", unread: 2 },
];

export default function Chat() {
  const [active, setActive] = useState(0);
  const [msg, setMsg] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = demoConversations.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const conv = demoConversations[active];

  return (
    <div className="flex h-[calc(100vh-60px)] animate-fade-in">
      {/* Sidebar conversas */}
      <div className="w-[280px] border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-10 bg-background border-border text-[13px]" placeholder="Buscar conversa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c, i) => {
            const color = STATUS_COLORS[c.status] || STATUS_COLORS.finalizada;
            return (
              <div key={c.id} onClick={() => setActive(i)} className={`px-4 py-3.5 cursor-pointer flex items-center gap-2.5 border-b border-border/20 transition-colors ${active === i ? "bg-border/60" : "hover:bg-border/30"}`}>
                <div className="relative">
                  <div className="w-[38px] h-[38px] rounded-full gradient-primary flex items-center justify-center text-[11px] font-bold text-white">
                    {c.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  {c.unread > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center">{c.unread}</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <span className="text-foreground font-semibold text-[13px]">{c.name}</span>
                    <span className="text-muted-foreground text-[11px]">{c.time}</span>
                  </div>
                  <div className="text-muted-foreground text-[12px] truncate">{c.msg}</div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: color + "22", color }}>{c.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex justify-between items-center bg-card">
          <div>
            <div className="text-foreground font-bold">{conv.name}</div>
            <div className="text-muted-foreground text-[12px]">{conv.status}</div>
          </div>
          <div className="flex gap-2">
            <Button variant={aiMode ? "default" : "outline"} size="sm" className="gap-1.5 text-[12px]" onClick={() => setAiMode(!aiMode)}>
              <Bot className="h-4 w-4" /> {aiMode ? "IA Ativa" : "Ativar IA"}
            </Button>
            <Button variant="outline" size="sm" className="text-[12px]">Transferir</Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-3">
          {aiMode && (
            <div className="bg-primary/10 border border-primary/30 rounded-[10px] px-3.5 py-2.5 text-primary text-[12px] text-center">
              🤖 IA assumiu a conversa — respondendo automaticamente via N8N
            </div>
          )}
          <div className="self-start bg-border rounded-xl rounded-bl-md px-3.5 py-2.5 max-w-[70%]">
            <span className="text-foreground text-[13px]">{conv.msg}</span>
            <div className="text-muted-foreground text-[10px] mt-1">{conv.time}</div>
          </div>
          <div className="self-end bg-primary rounded-xl rounded-br-md px-3.5 py-2.5 max-w-[70%]">
            <span className="text-primary-foreground text-[13px]">Olá! Tudo bem? Posso te ajudar com isso. Qual produto você tem interesse?</span>
            <div className="text-primary-foreground/60 text-[10px] mt-1">agora ✓✓</div>
          </div>
        </div>

        {/* Input */}
        <div className="px-4 py-3.5 border-t border-border flex gap-2.5 items-center bg-card">
          <button className="bg-background border border-border rounded-lg p-2 text-muted-foreground hover:text-foreground transition-colors">📎</button>
          <button className="bg-background border border-border rounded-lg p-2 text-muted-foreground hover:text-foreground transition-colors">🎤</button>
          <Input className="flex-1 bg-background border-border text-[13px]" placeholder="Digite uma mensagem..." value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && setMsg("")} />
          <Button size="sm" className="gap-1.5"><Send className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Client info panel */}
      <div className="w-[220px] border-l border-border p-4 overflow-y-auto bg-card">
        <div className="text-center mb-4">
          <div className="w-[52px] h-[52px] rounded-full gradient-primary mx-auto mb-2 flex items-center justify-center text-white font-bold">
            {conv.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="text-foreground font-bold text-sm">{conv.name}</div>
        </div>
        {[["Ticket Médio", "R$ 2.800"], ["Última Compra", "15 dias"], ["Total Compras", "3"], ["Origem", "WhatsApp"]].map(([k, v]) => (
          <div key={k} className="mb-3">
            <div className="text-muted-foreground text-[11px] uppercase tracking-wider mb-0.5">{k}</div>
            <div className="text-foreground text-[13px] font-semibold">{v}</div>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full mt-2 text-[12px] border-primary/40 text-primary hover:bg-primary/10">+ Criar Tarefa</Button>
        <Button variant="outline" size="sm" className="w-full mt-2 text-[12px] border-accent/40 text-accent hover:bg-accent/10">+ Criar Oportunidade</Button>
      </div>
    </div>
  );
}
