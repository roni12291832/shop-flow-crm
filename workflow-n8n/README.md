# Workflows N8N - StoreCRM

Esta pasta contém os modelos de fluxos para integração do CRM com N8N.

## Fluxos Disponíveis

| Arquivo | Descrição |
|---------|-----------|
| `01-whatsapp-webhook-receiver.json` | Recebe mensagens do WhatsApp via webhook e salva no banco |
| `02-whatsapp-send-message.json` | Envia mensagens do CRM para o WhatsApp do cliente |
| `03-ai-auto-reply.json` | Resposta automática com IA quando modo IA está ativo |
| `04-followup-automatico.json` | Verifica leads parados e dispara follow-up automático |
| `05-notificacao-novo-lead.json` | Notifica vendedores quando novo lead é recebido |
| `06-tarefa-automatica.json` | Cria tarefas automaticamente baseado em eventos |
| `07-relatorio-diario.json` | Envia relatório diário de métricas por email/WhatsApp |

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
