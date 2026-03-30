import { Home, PlusCircle, Clock, User, ClipboardList, Trophy, MessageCircle, Users, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "home" | "sale" | "tasks" | "chat" | "ranking" | "history" | "profile" | "clients" | "inventory";

const tabs: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: "home",      label: "Início",   icon: Home },
  { key: "clients",   label: "Clientes", icon: Users },
  { key: "sale",      label: "Vender",   icon: PlusCircle },
  { key: "tasks",     label: "Tarefas",  icon: ClipboardList },
  { key: "ranking",   label: "Ranking",  icon: Trophy },
];

export function SellerBottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom pb-4 px-4 pointer-events-none">
      <div className="relative flex items-center justify-around h-20 max-w-md mx-auto px-2 pointer-events-auto bg-background/80 backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
        
        {tabs.map(t => {
          const isActive = active === t.key;
          const isSale = t.key === "sale";

          if (isSale) {
            return (
              <button
                key={t.key}
                onClick={() => onChange(t.key)}
                className="flex flex-col items-center justify-center flex-1 -mt-10 group"
              >
                <div className={cn(
                  "w-16 h-16 rounded-[24px] flex items-center justify-center transition-all duration-300",
                  isActive
                    ? "bg-gradient-to-tr from-primary to-accent scale-105 shadow-[0_8px_30px_rgba(var(--primary-rgb),0.6)]"
                    : "bg-card border border-white/10 group-hover:scale-105 group-hover:border-primary/50 group-hover:shadow-lg"
                )}>
                  <t.icon className={cn("h-7 w-7 transition-colors", isActive ? "text-white" : "text-primary")} />
                </div>
                <span className={cn(
                  "text-[10px] font-bold mt-1 tracking-wide transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}>
                  {t.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className="flex flex-col items-center gap-1 flex-1 py-1 transition-all group"
            >
              <div className={cn(
                "w-12 h-10 rounded-[18px] flex items-center justify-center transition-all duration-300 relative",
                isActive
                  ? "bg-primary/10"
                  : "group-hover:bg-white/5"
              )}>
                <t.icon className={cn(
                  "h-5 w-5 transition-all duration-300",
                  isActive ? "text-primary drop-shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)] scale-110" : "text-muted-foreground group-hover:text-foreground"
                )} />
              </div>
              <span className={cn(
                "text-[10px] font-bold tracking-wide transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
