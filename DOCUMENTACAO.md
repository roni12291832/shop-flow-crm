# 📋 Documentação Completa - StoreCRM

## 🎯 Objetivo do Projeto

StoreCRM é um **CRM multi-tenant para varejo** que permite gestão completa de clientes, vendas, pipeline comercial, atendimento via WhatsApp, NPS e relacionamento — tudo em uma plataforma SaaS.

---

## 🏗️ Arquitetura

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Backend | Supabase (Auth, PostgreSQL, Storage, Edge Functions) |
| Automações | N8N (webhooks, IA, follow-ups) |
| Multi-tenancy | Isolamento via `tenant_id` + RLS |

---

## 📊 Tabelas do Banco de Dados

### `tenants`
**Função:** Armazena as empresas (tenants) do SaaS.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID único do tenant |
| company_name | text | Nome da empresa |
| logo_url | text | URL do logo da empresa |
| primary_color | text | Cor primária do tema |
| secondary_color | text | Cor secundária do tema |
| plan_type | text | Plano (basic, pro, enterprise) |
| created_at | timestamp | Data de criação |

### `profiles`
**Função:** Perfis dos usuários vinculados a um tenant.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID do perfil |
| user_id | uuid | ID do usuário (auth.users) |
| tenant_id | uuid | Tenant ao qual pertence |
| name | text | Nome do usuário |
| email | text | Email do usuário |
| avatar_url | text | Foto de perfil |
| created_at | timestamp | Data de criação |

### `user_roles`
**Função:** Controle de permissões por papel (RBAC).
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID único |
| user_id | uuid | ID do usuário |
| tenant_id | uuid | Tenant ao qual pertence |
| role | enum | Papel: `admin`, `gerente`, `vendedor`, `atendimento`, `super_admin` |

### `clients`
**Função:** Base de clientes/leads do CRM.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID do cliente |
| tenant_id | uuid | Tenant dono |
| name | text | Nome do cliente |
| email | text | Email |
| phone | text | Telefone/WhatsApp |
| birth_date | date | Data de nascimento |
| gender | text | Gênero |
| city | text | Cidade |
| origin | enum | Origem: whatsapp, instagram, facebook, google, indicação, loja_física, site, outro |
| tags | text[] | Tags de segmentação |
| notes | text | Observações |
| responsible_id | uuid | Vendedor responsável |
| last_purchase | timestamp | Última compra |
| ticket_medio | numeric | Ticket médio |
| created_at | timestamp | Data de cadastro |
| updated_at | timestamp | Última atualização |

### `opportunities`
**Função:** Pipeline de vendas (funil comercial).
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID da oportunidade |
| tenant_id | uuid | Tenant |
| client_id | uuid | Cliente vinculado |
| title | text | Título da oportunidade |
| stage | enum | Estágio: `lead_recebido`, `contato_iniciado`, `cliente_interessado`, `negociacao`, `proposta_enviada`, `venda_fechada`, `perdido` |
| estimated_value | numeric | Valor estimado |
| probability | integer | Probabilidade (%) |
| responsible_id | uuid | Vendedor responsável |
| loss_reason | enum | Motivo de perda |
| loss_notes | text | Detalhes da perda |
| created_at | timestamp | Criação |
| updated_at | timestamp | Atualização |

### `sales_entries`
**Função:** Registro de vendas realizadas.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID da venda |
| tenant_id | uuid | Tenant |
| user_id | uuid | Vendedor que realizou |
| customer_id | uuid | Cliente (opcional) |
| value | numeric | Valor da venda |
| payment_method | enum | Forma: pix, crédito, débito, dinheiro, boleto, crediário |
| status | enum | Status: confirmado, pendente, cancelado |
| sold_at | timestamp | Data da venda |
| notes | text | Observações |
| created_at | timestamp | Registro |

### `goals`
**Função:** Metas de vendas por período.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID da meta |
| tenant_id | uuid | Tenant |
| user_id | uuid | Vendedor (null = meta geral) |
| target_value | numeric | Valor alvo |
| period_type | enum | Período: daily, weekly, monthly |
| start_date | date | Início |
| end_date | date | Fim |
| created_by | uuid | Quem criou |

### `tasks`
**Função:** Tarefas e atividades do CRM.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| title | text | Título |
| description | text | Descrição |
| status | enum | Status: pendente, em_andamento, concluído |
| priority | enum | Prioridade: alta, média, baixa |
| due_date | timestamp | Prazo |
| responsible_id | uuid | Responsável |
| client_id | uuid | Cliente vinculado |

### `conversations`
**Função:** Conversas de atendimento (WhatsApp/Chat).
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| client_id | uuid | Cliente |
| responsible_id | uuid | Atendente |
| status | enum | Status: aberta, em_atendimento, aguardando, finalizada |
| last_message | text | Última mensagem |
| last_message_at | timestamp | Hora da última msg |

### `messages`
**Função:** Mensagens dentro das conversas.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| conversation_id | uuid | Conversa |
| content | text | Conteúdo |
| sender_type | enum | Tipo: cliente, atendente, ia |
| sender_id | uuid | ID do remetente |

### `activities`
**Função:** Log de atividades (histórico do cliente).
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| user_id | uuid | Quem realizou |
| client_id | uuid | Cliente |
| opportunity_id | uuid | Oportunidade |
| type | text | Tipo da atividade |
| description | text | Descrição |

### `notifications`
**Função:** Notificações internas do sistema.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| user_id | uuid | Destinatário |
| title | text | Título |
| message | text | Mensagem |
| read | boolean | Lida? |

### `nps_surveys`
**Função:** Pesquisas NPS enviadas aos clientes.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| customer_id | uuid | Cliente |
| score | integer | Nota (0-10) |
| category | enum | Categoria: promotor, neutro, detrator |
| comment | text | Comentário |
| status | enum | Status: sent, responded, expired |
| triggered_by | enum | Gatilho: after_sale, after_conversation, manual, scheduled |
| unique_token | uuid | Token único para link público |

### `nps_settings`
**Função:** Configurações de NPS por tenant.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| auto_send_after_sale | boolean | Enviar após venda |
| auto_send_after_conversation | boolean | Enviar após conversa |
| delay_hours | integer | Atraso em horas |
| message_template | text | Template da mensagem |
| webhook_url | text | URL do webhook N8N |
| ask_comment_from_score | integer | Pedir comentário a partir de qual nota |

### `relationship_rules`
**Função:** Régua de relacionamento (automações).
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| name | text | Nome da regra |
| trigger_event | enum | Gatilho: after_purchase, no_purchase, birthday, manual |
| delay_days | integer | Dias de atraso |
| channel | enum | Canal: whatsapp, sms, email |
| message_template | text | Template da mensagem |
| active | boolean | Ativa? |

### `relationship_executions`
**Função:** Execuções das regras de relacionamento.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| rule_id | uuid | Regra executada |
| customer_id | uuid | Cliente |
| scheduled_for | timestamp | Agendado para |
| sent_at | timestamp | Enviado em |
| status | enum | Status: scheduled, sent, failed, cancelled |
| message_sent | text | Mensagem enviada |

### `birthday_campaigns`
**Função:** Campanhas de aniversário.
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| customer_id | uuid | Cliente |
| year | integer | Ano |
| status | text | Status |
| sent_at | timestamp | Enviado em |

### `special_dates`
**Função:** Datas comerciais especiais (Dia das Mães, Black Friday, etc).
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | ID |
| tenant_id | uuid | Tenant |
| name | text | Nome da data |
| date | date | Data |
| message_template | text | Template da mensagem |
| segment_tags | text[] | Tags de segmentação |
| active | boolean | Ativa? |

---

## 📁 Estrutura de Páginas

| Página | Rota | Função |
|--------|------|--------|
| Dashboard | `/` | Visão geral com métricas, vendas, tarefas |
| Clientes | `/clients` | CRUD completo de clientes/leads |
| Pipeline | `/pipeline` | Funil de vendas com drag & drop |
| Metas | `/goals` | Gauges de metas e ranking |
| Config. Metas | `/goals/config` | Cadastro de metas por vendedor |
| Ranking | `/ranking` | Ranking de vendedores |
| Tarefas | `/tasks` | Gestão de tarefas |
| Chat | `/chat` | Atendimento via WhatsApp |
| Relatórios | `/reports` | Relatórios e análises |
| Notificações | `/notifications` | Central de notificações |
| NPS Dashboard | `/nps` | Métricas NPS |
| NPS Config | `/nps/config` | Configurações NPS |
| NPS Público | `/nps/:token` | Página pública de avaliação |
| Datas Especiais | `/special-dates` | Calendário comercial |
| Régua Relacionamento | `/relationship-rules` | Automações de relacionamento |
| Configurações | `/settings` | Config da empresa, equipe, integrações |
| WhatsApp | `/whatsapp` | Conexão com WhatsApp |
| Modo Vendedor | `/seller` | Interface mobile para vendedores |
| Admin Panel | `/admin` | Painel super admin (multi-tenant) |
| Auth | `/auth` | Login e cadastro |

---

## 🔐 Segurança

- **RLS (Row Level Security):** Todas as tabelas usam políticas baseadas em `tenant_id`
- **RBAC:** Papéis (admin, gerente, vendedor, atendimento, super_admin) controlam acesso
- **Função `has_role()`:** Security definer para checar papéis sem recursão
- **Função `get_user_tenant_id()`:** Retorna o tenant do usuário logado
- **Storage:** Bucket `logos` público para logos das empresas

---

## 🔄 Automações N8N

| Workflow | Função |
|----------|--------|
| 01 - WhatsApp Webhook | Recebe mensagens do WhatsApp e salva no banco |
| 02 - WhatsApp Send | Envia mensagens do CRM para WhatsApp |
| 03 - AI Auto Reply | Resposta automática com IA |
| 04 - Follow-up | Dispara follow-up para leads parados |
| 05 - Novo Lead | Notifica vendedor sobre novo lead |
| 06 - Tarefa Automática | Cria tarefas baseado em eventos |
| 07 - Relatório Diário | Envia métricas diárias |
| 08 - WhatsApp Lead | Auto-criação de lead via WhatsApp |

---

## 🛠️ Como Rodar

```bash
git clone <URL_DO_REPO>
cd <PASTA_DO_PROJETO>
npm install
npm run dev
```

---

## 📦 Dependências Principais

- `react` + `react-dom` - Framework UI
- `react-router-dom` - Roteamento
- `@supabase/supabase-js` - Cliente Supabase
- `@tanstack/react-query` - Cache e fetching
- `recharts` - Gráficos
- `lucide-react` - Ícones
- `sonner` - Notificações toast
- `date-fns` - Manipulação de datas
- `zod` + `react-hook-form` - Validação de formulários
- `shadcn/ui` - Componentes UI (Radix + Tailwind)
