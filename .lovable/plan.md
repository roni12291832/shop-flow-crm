

# Plano de Melhorias do CRM StoreCRM

Depois de analisar todo o codebase, identifiquei melhorias concretas organizadas por prioridade.

---

## 1. Chat/WhatsApp -- Conectar ao banco de dados (hoje usa dados mockados)

O `Chat.tsx` usa `demoConversations` hardcoded. Precisa de uma tabela `conversations` e `messages` no banco para funcionar de verdade.

- Criar migration com tabelas `conversations` (client_id, responsible_id, status, tenant_id, last_message, updated_at) e `messages` (conversation_id, content, sender_type, sender_id, created_at)
- Habilitar realtime nas duas tabelas
- Reescrever `Chat.tsx` para carregar conversas e mensagens do banco, enviar mensagens reais, e atualizar em tempo real via subscription

## 2. Clientes -- Detalhes e edição

- Criar modal/drawer de detalhe do cliente ao clicar em "Ver" (hoje o botao nao faz nada)
- Incluir: editar dados, ver historico de atividades, oportunidades vinculadas, tarefas
- Adicionar funcao de deletar cliente

## 3. Pipeline -- Registro de perda com motivo

- Ao mover para "Perdido", abrir dialog pedindo `loss_reason` e `loss_notes` (campos ja existem na tabela)
- Adicionar dialog de editar oportunidade (valor, titulo, responsavel)

## 4. Dashboard -- Filtro por periodo

- Adicionar date range picker no topo do dashboard para filtrar metricas por periodo (mes atual, ultimos 7 dias, customizado)
- As queries ja existem mas sempre carregam tudo

## 5. Sidebar -- Mostrar role real e badge de notificacoes dinamico

- No `AppSidebar`, o role esta hardcoded "Gerente" -- trocar para usar o role real do `AuthContext`
- O badge "3" no WhatsApp e o "5" nas notificacoes do topbar estao hardcoded -- conectar a contagens reais do banco

## 6. Tarefas -- Prioridade

- A tabela `tasks` nao tem coluna `priority` -- adicionar via migration
- Adicionar campo de prioridade (alta/media/baixa) no form de criacao e na listagem
- Adicionar ordenacao por prioridade e data

## 7. Layout responsivo mobile

- Sidebar nao colapsa em mobile -- adicionar sheet/drawer com menu hamburger
- Dashboard grid de 5 colunas quebra em telas menores -- usar responsive grid (grid-cols-2 md:grid-cols-3 lg:grid-cols-5)

## 8. Notificacoes em tempo real

- Habilitar realtime na tabela `notifications`
- Adicionar subscription no `AppLayout` para mostrar toast quando chega notificacao nova
- Atualizar contador de notificacoes nao lidas no topbar dinamicamente

## 9. Settings -- Convidar membros da equipe

- Adicionar funcionalidade de convite por email na aba "Equipe" (hoje so lista)
- Permitir admin alterar role de um membro

## 10. Exportacao PDF nos relatorios

- Hoje so exporta CSV -- adicionar exportacao PDF usando biblioteca como jsPDF ou html2canvas

---

## Ordem de implementacao sugerida

1. Chat com banco real + realtime (maior impacto, modulo core esta mockado)
2. Sidebar responsiva + badges dinamicos (UX basica quebrada)
3. Detalhe do cliente + edicao
4. Pipeline com motivo de perda
5. Prioridade nas tarefas
6. Dashboard com filtro de periodo
7. Notificacoes realtime
8. Settings com convite de equipe
9. Exportacao PDF

---

## Detalhes tecnicos

**Migration necessaria:**
- Tabela `conversations` e `messages` com RLS por tenant_id
- Coluna `priority` na tabela `tasks` (enum: alta, media, baixa)
- Publicacao realtime para `conversations`, `messages`, `notifications`

**Componentes novos:**
- `ClientDetailDrawer` -- drawer lateral com historico completo
- `LossReasonDialog` -- dialog para registrar motivo de perda
- `MobileSidebar` -- sidebar colapsavel usando Sheet do shadcn
- `DateRangePicker` -- filtro de periodo para dashboard/relatorios

