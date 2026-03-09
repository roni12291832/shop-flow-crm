import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Send,
  Phone,
  Search,
  Bot,
  Paperclip,
  Mic,
  Image as ImageIcon,
  FileText,
  ArrowRightLeft,
  User,
} from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  aberta: { label: "Aberta", color: "bg-primary/10 text-primary" },
  em_atendimento: { label: "Em Atendimento", color: "bg-warning/10 text-warning" },
  aguardando_cliente: { label: "Aguardando", color: "bg-muted text-muted-foreground" },
  finalizada: { label: "Finalizada", color: "bg-success/10 text-success" },
};

interface Conversation {
  id: string;
  clientName: string;
  lastMessage: string;
  status: string;
  time: string;
  unread: number;
}

interface Message {
  id: string;
  content: string;
  sender: "client" | "agent" | "ai";
  time: string;
}

// Demo data for layout - will be replaced with real WhatsApp integration via N8N
const demoConversations: Conversation[] = [
  { id: "1", clientName: "Maria Silva", lastMessage: "Olá, quero saber sobre o produto X", status: "em_atendimento", time: "14:32", unread: 2 },
  { id: "2", clientName: "João Santos", lastMessage: "Obrigado pela informação!", status: "aguardando_cliente", time: "13:15", unread: 0 },
  { id: "3", clientName: "Ana Costa", lastMessage: "Qual o preço?", status: "aberta", time: "12:00", unread: 1 },
];

const demoMessages: Message[] = [
  { id: "1", content: "Olá, quero saber sobre o produto X", sender: "client", time: "14:30" },
  { id: "2", content: "Olá Maria! Claro, o produto X está disponível. Posso te ajudar com mais detalhes?", sender: "agent", time: "14:31" },
  { id: "3", content: "Sim, qual o preço e prazo de entrega?", sender: "client", time: "14:32" },
];

export default function Chat() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>("1");
  const [messageInput, setMessageInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [aiMode, setAiMode] = useState(false);

  const filteredConversations = demoConversations.filter((c) =>
    c.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-screen flex animate-fade-in">
      {/* Conversation List */}
      <div className="w-80 border-r border-border flex flex-col bg-card">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Atendimento</h2>
            <Badge variant="secondary">{demoConversations.length}</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredConversations.map((conv) => {
              const statusConfig = STATUS_LABELS[conv.status] || STATUS_LABELS.aberta;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.id)}
                  className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                    selectedConversation === conv.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate">{conv.clientName}</span>
                    <span className="text-[10px] text-muted-foreground">{conv.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-1.5">{conv.lastMessage}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={`text-[10px] ${statusConfig.color}`}>
                      {statusConfig.label}
                    </Badge>
                    {conv.unread > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-white">
                  M
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Maria Silva</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> (11) 99999-9999
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={aiMode ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setAiMode(!aiMode)}
                >
                  <Bot className="h-4 w-4" />
                  {aiMode ? "IA Ativa" : "Ativar IA"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowRightLeft className="h-4 w-4" /> Transferir
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="max-w-2xl mx-auto space-y-4">
                {demoMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "client" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        msg.sender === "client"
                          ? "bg-muted text-foreground rounded-bl-md"
                          : msg.sender === "ai"
                          ? "bg-accent/20 text-foreground rounded-br-md border border-accent/30"
                          : "bg-primary text-primary-foreground rounded-br-md"
                      }`}
                    >
                      {msg.sender === "ai" && (
                        <span className="text-[10px] font-medium text-accent flex items-center gap-1 mb-1">
                          <Bot className="h-3 w-3" /> Resposta IA
                        </span>
                      )}
                      <p className="text-sm">{msg.content}</p>
                      <span className={`text-[10px] mt-1 block ${msg.sender === "client" ? "text-muted-foreground" : "opacity-70"}`}>
                        {msg.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t border-border bg-card">
              <div className="flex items-center gap-2 max-w-2xl mx-auto">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Mic className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                <Input
                  className="flex-1"
                  placeholder="Digite uma mensagem..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setMessageInput("")}
                />
                <Button size="icon" className="h-9 w-9">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">Central de Atendimento</p>
              <p className="text-sm">Selecione uma conversa para começar</p>
              <p className="text-xs mt-4 max-w-sm">
                A integração com WhatsApp será feita via N8N. Configure seus webhooks para receber e enviar mensagens automaticamente.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
