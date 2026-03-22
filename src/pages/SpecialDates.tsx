import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Cake, CalendarDays } from "lucide-react";
import { BirthdayCard } from "@/components/datas/BirthdayCard";
import { BirthdayTable } from "@/components/datas/BirthdayTable";
import { CommercialCalendar } from "@/components/datas/CommercialCalendar";
import { CampaignModal } from "@/components/datas/CampaignModal";
import { toast } from "@/hooks/use-toast";

interface ClientBirthday {
  id: string;
  name: string;
  phone: string | null;
  birth_date: string;
  last_purchase: string | null;
  ticket_medio: number | null;
}

export default function SpecialDates() {
    const [clients, setClients] = useState<ClientBirthday[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [specialDates, setSpecialDates] = useState<any[]>([]);
  const [calendarDate, setCalendarDate] = useState<Date | undefined>();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [tab, setTab] = useState("birthdays");

  const fetchAll = async () => {
    
    const [clientsRes, campaignsRes, datesRes] = await Promise.all([
      supabase.from("clients").select("id, name, phone, birth_date, last_purchase, ticket_medio").not("birth_date", "is", null),
      supabase.from("birthday_campaigns").select("customer_id, year, status").eq("year", new Date().getFullYear()),
      supabase.from("special_dates").select("*").order("date", { ascending: true }),
    ]);

    setClients((clientsRes.data as any[]) || []);
    const sent = new Set<string>();
    ((campaignsRes.data as any[]) || []).forEach(c => { if (c.status === "sent") sent.add(c.customer_id); });
    setSentIds(sent);
    setSpecialDates(datesRes.data || []);
  };

  useEffect(() => { fetchAll(); }, [tenantId]);

  const today = new Date();
  const currentMonth = today.getMonth();
  const todayMD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const getBdMD = (bd: string) => {
    const d = new Date(bd + "T12:00:00");
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const isThisWeek = (bd: string) => {
    const d = new Date(bd + "T12:00:00");
    const thisYearBd = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    const endWeek = new Date(today); endWeek.setDate(endWeek.getDate() + 7);
    return thisYearBd >= today && thisYearBd <= endWeek;
  };

  const isThisMonth = (bd: string) => new Date(bd + "T12:00:00").getMonth() === currentMonth;

  const weekBirthdays = clients.filter(c => isThisWeek(c.birth_date));
  const monthBirthdays = clients.filter(c => isThisMonth(c.birth_date))
    .sort((a, b) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate());

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const openWhatsApp = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    window.open(`https://wa.me/55${cleaned}`, "_blank");
  };

  const handleDeleteCampaign = async (id: string) => {
    await supabase.from("special_dates").delete().eq("id", id);
    toast({ title: "Campanha excluída" });
    fetchAll();
  };

  const handleToggleCampaign = async (id: string, active: boolean) => {
    await supabase.from("special_dates").update({ active }).eq("id", id);
    fetchAll();
  };

  return (
    <div className="p-4 md:p-7 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Datas Especiais</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="birthdays" className="gap-1.5"><Cake className="h-4 w-4" /> Aniversariantes</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="h-4 w-4" /> Calendário Comercial</TabsTrigger>
        </TabsList>

        <TabsContent value="birthdays" className="space-y-6 mt-4">
          {/* This Week */}
          <div>
            <h2 className="text-foreground font-bold text-base mb-3">🎂 Esta Semana</h2>
            {weekBirthdays.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {weekBirthdays.map(c => (
                  <BirthdayCard key={c.id} name={c.name} phone={c.phone} birthDate={c.birth_date}
                    avatarInitials={getInitials(c.name)} sent={sentIds.has(c.id)}
                    onSendWhatsApp={() => c.phone && openWhatsApp(c.phone)}
                    onViewProfile={() => {}} />
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
                Nenhum aniversariante esta semana
              </div>
            )}
          </div>

          {/* This Month */}
          <div>
            <h2 className="text-foreground font-bold text-base mb-3">📅 Este Mês</h2>
            <div className="bg-card border border-border rounded-xl p-4">
              <BirthdayTable
                data={monthBirthdays.map(c => ({
                  id: c.id, name: c.name, birthDate: c.birth_date, phone: c.phone,
                  lastPurchase: c.last_purchase, ticketMedio: c.ticket_medio, sent: sentIds.has(c.id),
                }))}
                onSendWhatsApp={(id) => {
                  const c = clients.find(cl => cl.id === id);
                  if (c?.phone) openWhatsApp(c.phone);
                }}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditingCampaign(null); setCampaignOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Campanha
            </Button>
          </div>
          <CommercialCalendar
            dates={specialDates}
            selectedDate={calendarDate}
            onSelectDate={setCalendarDate}
            onEdit={(d) => { setEditingCampaign(d); setCampaignOpen(true); }}
            onDelete={handleDeleteCampaign}
            onToggle={handleToggleCampaign}
          />
        </TabsContent>
      </Tabs>

      <CampaignModal open={campaignOpen} onClose={() => setCampaignOpen(false)}
        onSaved={fetchAll} editingCampaign={editingCampaign} />
    </div>
  );
}
