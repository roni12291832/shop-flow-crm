import { Home, PlusCircle, Clock, User, ClipboardList, Trophy, MessageCircle, Users, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "home" | "sale" | "tasks" | "chat" | "ranking" | "history" | "profile" | "clients" | "inventory";

const tabs: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: "home", label: "Início", icon: Home },
  { key: "clients", label: "Clientes", icon: Users },
  { key: "chat", label: "Chat", icon: MessageCircle },
  { key: "sale", label: "Vender", icon: PlusCircle },
  { key: "inventory", label: "Estoque", icon: Package },
  { key: "tasks", label: "Tarefas", icon: ClipboardList },
  { key: "ranking", label: "Ranking", icon: Trophy },
  { key: "history", label: "Hist.", icon: Clock },
  { key: "profile", label: "Perfil", icon: User },
];

export function SellerBottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-1">
        {tabs.map(t => {
          const isActive = active === t.key;
          const isSale = t.key === "sale";
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={cn(
                "flex flex-col items-center gap-0.5 transition-all flex-1 py-2",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              {isSale ? (
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center -mt-6 shadow-lg transition-all",
                  isActive ? "bg-primary text-primary-foreground scale-110" : "bg-primary/80 text-primary-foreground"
                )}>
                  <t.icon className="h-6 w-6" />
                </div>
              ) : (
                <t.icon className={cn("h-4 w-4", isActive && "scale-110")} />
              )}
              <span className={cn("text-[9px] font-medium", isSale && "mt-1")}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
