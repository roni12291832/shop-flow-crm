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

    // Dia alvo: 7 dias atrás
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 7);
    const gteDate = targetDate.toISOString().split("T")[0] + "T00:00:00.000Z";
    
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);
    const ltDate = endDate.toISOString().split("T")[0] + "T00:00:00.000Z";

    // 1. Buscar vendas confirmadas há 7 dias
    const { data: sales, error: salesError } = await supabaseClient
      .from("sales_entries")
      .select("id, customer_id, customer:clients(name, phone)")
      .eq("status", "confirmado")
      .gte("sold_at", gteDate)
      .lt("sold_at", ltDate);

    if (salesError || !sales) {
      throw new Error("Failed to fetch sales");
    }

    let totalSent = 0;

    for (const sale of sales) {
      if (!sale.customer_id || !sale.customer?.phone) continue;

      // Check if survey already exists for this client recently to avoid spam
      const { data: existing } = await supabaseClient
        .from("nps_surveys")
        .select("id")
        .eq("client_id", sale.customer_id)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .maybeSingle();

      if (existing) continue; // Already sent NPS to this client in last 30 days

      // 2. Criar Pesquisa NPS pendente
      const { data: survey } = await supabaseClient
        .from("nps_surveys")
        .insert({
          client_id: sale.customer_id,
          status: "pending"
        }).select("id").single();

      if (!survey) continue;

      // 3. Disparar link via WhatsApp (se conectado)
      const { data: wpConfig } = await supabaseClient
        .from("whatsapp_instances")
        .select("api_url, api_token, instance_name, status")
        
        .maybeSingle();

      if (wpConfig && wpConfig.status === "connected") {
        const publicUrl = Deno.env.get("PUBLIC_URL") || "https://shop-flow-crm.netlify.app";
        const msg = `Olá ${sale.customer.name.split(" ")[0]}! 😊\n\nGostou da sua experiência conosco?\n\nAvalie de 0 a 10 acessando o link abaixo:\n${publicUrl}/nps/${survey.id}\n\nSua opinião é muito importante pra gente! 🙏`;

        try {
          const res = await fetch(`${wpConfig.api_url}/message/sendText/${wpConfig.instance_name}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": wpConfig.api_token
            },
            body: JSON.stringify({
              number: `${sale.customer.phone}@s.whatsapp.net`,
              text: msg
            })
          });
          
          if (res.ok) {
            totalSent++;
          }
        } catch (e) {
          console.error("Erro ao disparar WP NPS:", e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, totalSent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Cron NPS Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
