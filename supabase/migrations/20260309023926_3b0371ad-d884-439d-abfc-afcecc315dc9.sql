
-- Conversation status enum
CREATE TYPE public.conversation_status AS ENUM ('aberta', 'em_atendimento', 'aguardando', 'finalizada');

-- Message sender type enum
CREATE TYPE public.message_sender_type AS ENUM ('cliente', 'atendente', 'ia');

-- Task priority enum
CREATE TYPE public.task_priority AS ENUM ('alta', 'media', 'baixa');

-- Conversations table
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  responsible_id UUID,
  status conversation_status NOT NULL DEFAULT 'aberta',
  last_message TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sender_type message_sender_type NOT NULL DEFAULT 'cliente',
  sender_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add priority to tasks
ALTER TABLE public.tasks ADD COLUMN priority task_priority NOT NULL DEFAULT 'media';

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversations
CREATE POLICY "Users can view conversations in tenant"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert conversations in tenant"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update conversations in tenant"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can delete conversations in tenant"
  ON public.conversations FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- RLS policies for messages
CREATE POLICY "Users can view messages in tenant"
  ON public.messages FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert messages in tenant"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Updated_at trigger for conversations
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
