import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MessageSquare, Cake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BirthdayClient {
  id: string;
  name: string;
  phone: string | null;
  birth_date: string;
}

export function BirthdayDashboardWidget() {
    const [todayBirthdays, setTodayBirthdays] = useState<BirthdayClient[]>([]);
  const [weekCount, setWeekCount] = useState(0);

  useEffect(() => {
        const fetchBirthdays = async () => {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, phone, birth_date")
        
        .not("birth_date", "is", null);

      if (!clients) return;

      const today = new Date();
      const todayMD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const endWeek = new Date(today);
      endWeek.setDate(endWeek.getDate() + 7);

      const todayList: BirthdayClient[] = [];
      let weekTotal = 0;

      (clients as any[]).forEach(c => {
        if (!c.birth_date) return;
        const bd = new Date(c.birth_date + "T12:00:00");
        const cMD = `${String(bd.getMonth() + 1).padStart(2, "0")}-${String(bd.getDate()).padStart(2, "0")}`;
        if (cMD === todayMD) todayList.push(c);

        // Check if within next 7 days (month-day comparison)
        const thisYearBd = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
        if (thisYearBd < today) thisYearBd.setFullYear(today.getFullYear() + 1);
        if (thisYearBd >= today && thisYearBd <= endWeek) weekTotal++;
      });

      setTodayBirthdays(todayList);
      setWeekCount(weekTotal);
    };
    fetchBirthdays();
  }, [tenantId]);

  const openWhatsApp = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    window.open(`https://wa.me/55${cleaned}`, "_blank");
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cake className="h-5 w-5 text-primary" />
          <span className="text-foreground font-bold text-base">Aniversariantes Hoje</span>
        </div>
        {weekCount > 0 && (
          <Badge variant="secondary" className="text-[10px]">{weekCount} esta semana</Badge>
        )}
      </div>

      {todayBirthdays.length > 0 ? (
        <div className="space-y-3">
          {todayBirthdays.slice(0, 4).map(c => (
            <div key={c.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                  {c.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm text-foreground">{c.name}</span>
              </div>
              {c.phone && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openWhatsApp(c.phone!)}>
                  <MessageSquare className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          {todayBirthdays.length > 4 && (
            <span className="text-muted-foreground text-xs">+{todayBirthdays.length - 4} mais</span>
          )}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-4 text-sm">Nenhum aniversariante hoje</div>
      )}
    </div>
  );
}
