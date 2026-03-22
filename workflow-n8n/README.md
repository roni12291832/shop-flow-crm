# Workflows N8N - StoreCRM

Esta pasta contém os modelos de fluxos para integração do CRM com N8N.

## Fluxos Disponíveis

| Arquivo | Descrição |
|---------|-----------|
| `02-whatsapp-send-message.json` | Envia mensagens do vendedor/CRM para o WhatsApp do cliente |
| `03-ai-auto-reply.json` | Resposta automática com IA quando "Modo IA" está ativo no chat |
| `05-notificacao-novo-lead.json` | Cria alertas/notificações visuais no CRM para a equipe de vendas |
| `07-relatorio-diario.json` | Envia relatório diário de métricas gerais por WhatsApp pro gerente |
| `08-whatsapp-lead-auto-pipeline.json` | (Core) Recebe mensagens SMS da UAZAPI, cria cliente, abre chat e card do Kanban |
| `09-resync-offline-messages.json` | (Segurança) Roda a cada 4 horas puxando histórico perdido da UAZAPI |
| `10-lembrete-pagamento.json` | (Cobrança) Roda de manhã cobrando faturas em atraso no WhatsApp |
| `11-automacao-pipeline.json` | (Vendas) Gatilhos de 2 dias p/ Interessados e 7 dias p/ Quase Perdido |
| `12-automacao-nps.json` | (Qualidade) Webhook pesquisa de satisfação 1 a 5 e link p/ Google My Business |
| `13-automacao-relacionamento.json` | (Marketing) Ação de aniversário com cupom e pós-venda (30 dias) |

## Como Configurar

1. Importe cada arquivo `.json` no seu N8N
2. Configure as credenciais do Supabase (URL + Service Role Key)
3. Configure a API do WhatsApp Business (Evolution API ou Z-API)
4. Configure a API de IA (OpenAI ou similar)
5. Ative os webhooks no N8N e copie as URLs para o CRM

## Variáveis de Ambiente N8N

```
SUPABASE_URL=https://pirtuvrirozyrurodgtn.supabase.co
SUPABASE_SERVICE_KEY=sua_service_role_key
WHATSAPP_API_URL=sua_url_evolution_api
WHATSAPP_API_KEY=sua_api_key
OPENAI_API_KEY=sua_chave_openai
```
