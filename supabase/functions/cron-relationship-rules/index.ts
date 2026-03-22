import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Buscar todas as réguas ativas
    const { data: rules, error: rulesError } = await supabaseClient
      .from("relationship_rules")
      .select("*")
      .eq("active", true)
      .neq("trigger_event", "manual"); // Ignora disparos manuais agendados pela UI

    if (rulesError || !rules) {
      throw new Error("Failed to fetch rules");
    }

    let totalSent = 0;

    for (const rule of rules) {
      // 2. Definir a janela de tempo com base no trigger e delay_days
      let clientsToMessage = [];
      
      if (rule.trigger_event === "after_purchase" || rule.trigger_event === "no_purchase") {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - rule.delay_days);
        const targetDateStr = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD

        // Para after_purchase, queremos clients com last_purchase exatamente igual ao targetDate
        // Para no_purchase, queremos clients com last_purchase <= targetDate (ou seja, inativos há X dias ou mais)
        const operator = rule.trigger_event === "after_purchase" ? "eq" : "lte";

        const { data: clients } = await supabaseClient
          .from("clients")
          .select("id, name, phone, last_purchase")
          
          .filter("last_purchase", operator, targetDateStr);
          
        clientsToMessage = clients || [];
        
      } else if (rule.trigger_event === "birthday") {
        // Encontrar clientes que fazem aniversário hoje (ou daqui a X dias caso delay_days negativo)
        // Por simplicidade, assumindo delay_days = 0 para "no dia"
        // Devido a complexidade de extrair MM-DD em SQL REST, pegamos todos com data de nascimento preenchida
        // e filtramos na memória, pois a base geral de aniversariantes do dia é pequena.
        const { data: clients } = await supabaseClient
          .from("clients")
          .select("id, name, phone, birth_date")
          
          .not("birth_date", "is", null);

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (rule.delay_days || 0)); // ex: delay_days = -3 avisa 3 dias ANTES
        const targetMonth = targetDate.getMonth() + 1;
        const targetDay = targetDate.getDate();

        clientsToMessage = (clients || []).filter(c => {
          if (!c.birth_date) return false;
          const [year, month, day] = c.birth_date.split("-");
          return parseInt(month) === targetMonth && parseInt(day) === targetDay;
        });
      }

      // 3. Remover clientes que JÁ RECEBERAM essa regra recentemente (evitar spam no_purchase diário)
      if (clientsToMessage.length > 0) {
        const clientIds = clientsToMessage.map(c => c.id);
        const { data: pastExecutions } = await supabaseClient
          .from("relationship_executions")
          .select("customer_id")
          .eq("rule_id", rule.id)
          .in("customer_id", clientIds)
          .eq("status", "sent");

        const pastIds = new Set((pastExecutions || []).map(e => e.customer_id));
        clientsToMessage = clientsToMessage.filter(c => !pastIds.has(c.id));
      }

      // 4. Executar os disparos via WhatsApp
      if (clientsToMessage.length > 0) {
        // Fetch whatsapp configs for this tenant
        const { data: wpConfig } = await supabaseClient
          .from("whatsapp_instances")
          .select("*")
          
          .eq("status", "connected")
          .maybeSingle();

        for (const client of clientsToMessage) {
          if (!client.phone) continue;

          // Personalizar mensagem: {nome} = client.name
          let finalMessage = rule.message_template.replace(/\{nome\}|\{\{nome\}\}/gi, client.name.split(" ")[0]);

          let status = "failed";
          let wpResponse = null;

          if (wpConfig && rule.channel === "whatsapp") {
            try {
              const res = await fetch(`${wpConfig.api_url}/message/sendText/${wpConfig.instance_name}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "apikey": wpConfig.api_token
                },
                body: JSON.stringify({
                  number: `${client.phone}@s.whatsapp.net`,
                  text: finalMessage
                })
              });
              
              if (res.ok) {
                status = "sent";
                totalSent++;
              }
            } catch (e) {
              console.error("Erro ao disparar WP:", e);
            }
          }

          // Gravar log na tabela relationship_executions
          await supabaseClient.from("relationship_executions").insert({
            rule_id: rule.id,
            customer_id: client.id,
            status: status,
            scheduled_for: new Date().toISOString(),
            sent_at: status === "sent" ? new Date().toISOString() : null,
            message_sent: finalMessage
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, totalSent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Cron Relationship Rules Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
