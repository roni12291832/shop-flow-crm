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

    // This endpoint can be called as a Webhook by Supabase DB Trigger (when a message is inserted)
    // payload: { type: 'INSERT', table: 'messages', record: { ... } }
    const { record } = await req.json();

    if (!record || !record.id) {
      return new Response(JSON.stringify({ error: "No record provided" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Only reply if the message is from a client
    if (record.sender_type !== "cliente") {
      return new Response(JSON.stringify({ message: "Not a client message, skipped." }), { headers: corsHeaders });
    }

    // Check if conversation should be handled by AI
    // For this exact implementation, we reply if the conversation is "aberta" (not em_atendimento)
    const { data: conv, error: convError } = await supabaseClient
      .from("conversations")
      .select("status, client_id, responsible_id, client:clients(name, phone)")
      .eq("id", record.conversation_id)
      .single();

    if (convError || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 400, headers: corsHeaders });
    }

    if (conv.status !== "aberta" && conv.status !== "aguardando") {
      // Human is already attending, or it's finished. Don't reply via AI.
      return new Response(JSON.stringify({ message: "Human is attending, skipping AI reply." }), { headers: corsHeaders });
    }

    // Fetch previous 5 messages for context
    const { data: history } = await supabaseClient
      .from("messages")
      .select("content, sender_type")
      .eq("conversation_id", record.conversation_id)
      .order("created_at", { ascending: false })
      .limit(5);

    const historyMessages = (history || []).reverse().map(m => ({
      role: m.sender_type === "cliente" ? "user" : "assistant",
      content: m.content
    }));

    // Call OpenAI
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const { data: tenantData } = await supabaseClient
      .from("tenants")
      .select("company_name")
      .eq("id", conv.)
      .single();

    const systemPrompt = `Você é o Jarvis, assistente virtual inteligente da empresa ${tenantData?.company_name || "Nossa Loja"}.
Seu objetivo é atender e qualificar o lead que entrou em contato.
Você deve ser amigável, educado, e objetivo. Responda de forma humanizada.
Se você não souber a resposta, diga que vai transferir para um atendente humano.
Cliente: ${conv.client?.name || "Cliente"}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...historyMessages],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const openAiData = await res.json();
    const reply = openAiData.choices[0].message.content;

    // Insert reply into DB
    await supabaseClient.from("messages").insert({
      conversation_id: record.conversation_id,
      sender_type: "ia",
      content: reply
    });

    // Update conversation last_message
    await supabaseClient.from("conversations").update({
      last_message: reply,
      last_message_at: new Date().toISOString()
    }).eq("id", record.conversation_id);

    // Send via WhatsApp UZAPI if the user has connection active!
    const { data: wpConfig } = await supabaseClient
      .from("whatsapp_instances")
      .select("api_url, api_token, instance_name, status")
      
      .maybeSingle();

    if (wpConfig && wpConfig.status === "connected" && conv.client?.phone) {
      await fetch(`${wpConfig.api_url}/message/sendText/${wpConfig.instance_name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": wpConfig.api_token
        },
        body: JSON.stringify({
          number: `${conv.client.phone}@s.whatsapp.net`,
          text: reply
        })
      });
    }

    return new Response(JSON.stringify({ success: true, reply }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error processing AI reply:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
