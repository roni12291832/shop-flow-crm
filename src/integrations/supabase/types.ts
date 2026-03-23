export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          id: string
          platform: string
          account_id: string
          account_name: string | null
          access_token: string | null
          refresh_token: string | null
          token_expiry: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          platform: string
          account_id: string
          account_name?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expiry?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          platform?: string
          account_id?: string
          account_name?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expiry?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      ad_campaigns: {
        Row: {
          id: string
          ad_account_id: string
          platform_campaign_id: string
          name: string
          status: string | null
          objective: string | null
          budget_daily: number
          budget_total: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ad_account_id: string
          platform_campaign_id: string
          name: string
          status?: string | null
          objective?: string | null
          budget_daily?: number
          budget_total?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ad_account_id?: string
          platform_campaign_id?: string
          name?: string
          status?: string | null
          objective?: string | null
          budget_daily?: number
          budget_total?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_metrics: {
        Row: {
          id: string
          campaign_id: string
          date: string
          impressions: number
          clicks: number
          ctr: number
          cpc: number
          cpm: number
          spend: number
          conversions: number
          conversion_value: number
          roas: number
          reach: number
          frequency: number
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          date: string
          impressions?: number
          clicks?: number
          ctr?: number
          cpc?: number
          cpm?: number
          spend?: number
          conversions?: number
          conversion_value?: number
          roas?: number
          reach?: number
          frequency?: number
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          date?: string
          impressions?: number
          clicks?: number
          ctr?: number
          cpc?: number
          cpm?: number
          spend?: number
          conversions?: number
          conversion_value?: number
          roas?: number
          reach?: number
          frequency?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          opportunity_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opportunity_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opportunity_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      birthday_campaigns: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          sent_at: string | null
          status: string
          year: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          sent_at?: string | null
          status?: string
          year: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          sent_at?: string | null
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "birthday_campaigns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          birth_date: string | null
          city: string | null
          created_at: string
          email: string | null
          gender: string | null
          id: string
          last_purchase: string | null
          name: string
          notes: string | null
          origin: Database["public"]["Enums"]["lead_origin"] | null
          phone: string | null
          responsible_id: string | null
          tags: string[] | null
          ticket_medio: number | null
          score: number | null
          temperature: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gender?: string | null
          id?: string
          last_purchase?: string | null
          name: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"] | null
          phone?: string | null
          responsible_id?: string | null
          tags?: string[] | null
          ticket_medio?: number | null
          score?: number | null
          temperature?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gender?: string | null
          id?: string
          last_purchase?: string | null
          name?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"] | null
          phone?: string | null
          responsible_id?: string | null
          tags?: string[] | null
          ticket_medio?: number | null
          score?: number | null
          temperature?: string | null
          updated_at?: string
        }
        Relationships: [
        ]
      }
      conversations: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string | null
          responsible_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          period_type: Database["public"]["Enums"]["goal_period_type"]
          start_date: string
          target_value: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          period_type?: Database["public"]["Enums"]["goal_period_type"]
          start_date: string
          target_value?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          period_type?: Database["public"]["Enums"]["goal_period_type"]
          start_date?: string
          target_value?: number
          user_id?: string | null
        }
        Relationships: [
        ]
      }
      inventory_movements: {
        Row: {
          id: string
          product_id: string
          type: Database["public"]["Enums"]["inventory_movement_type"]
          quantity: number
          unit_cost: number
          reference_type: string | null
          reference_id: string | null
          notes: string | null
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          type: Database["public"]["Enums"]["inventory_movement_type"]
          quantity: number
          unit_cost?: number
          reference_type?: string | null
          reference_id?: string | null
          notes?: string | null
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          type?: Database["public"]["Enums"]["inventory_movement_type"]
          quantity?: number
          unit_cost?: number
          reference_type?: string | null
          reference_id?: string | null
          notes?: string | null
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          id: string
          name: string
          sku: string | null
          description: string | null
          category: string | null
          cost_price: number
          sell_price: number
          current_stock: number
          min_stock: number
          unit: string
          image_url: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          sku?: string | null
          description?: string | null
          category?: string | null
          cost_price?: number
          sell_price?: number
          current_stock?: number
          min_stock?: number
          unit?: string
          image_url?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          sku?: string | null
          description?: string | null
          category?: string | null
          cost_price?: number
          sell_price?: number
          current_stock?: number
          min_stock?: number
          unit?: string
          image_url?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean | null
          title?: string
          user_id?: string
        }
        Relationships: [
        ]
      }
      nps_settings: {
        Row: {
          ask_comment_from_score: number
          auto_send_after_conversation: boolean
          auto_send_after_sale: boolean
          created_at: string
          delay_hours: number
          id: string
          message_template: string | null
          webhook_url: string | null
        }
        Insert: {
          ask_comment_from_score?: number
          auto_send_after_conversation?: boolean
          auto_send_after_sale?: boolean
          created_at?: string
          delay_hours?: number
          id?: string
          message_template?: string | null
          webhook_url?: string | null
        }
        Update: {
          ask_comment_from_score?: number
          auto_send_after_conversation?: boolean
          auto_send_after_sale?: boolean
          created_at?: string
          delay_hours?: number
          id?: string
          message_template?: string | null
          webhook_url?: string | null
        }
        Relationships: [
        ]
      }
      nps_surveys: {
        Row: {
          category: Database["public"]["Enums"]["nps_category"] | null
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          reference_id: string | null
          responded_at: string | null
          score: number | null
          sent_at: string | null
          status: Database["public"]["Enums"]["nps_status"]
          triggered_by: Database["public"]["Enums"]["nps_trigger"]
          unique_token: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["nps_category"] | null
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          reference_id?: string | null
          responded_at?: string | null
          score?: number | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["nps_status"]
          triggered_by?: Database["public"]["Enums"]["nps_trigger"]
          unique_token?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["nps_category"] | null
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          reference_id?: string | null
          responded_at?: string | null
          score?: number | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["nps_status"]
          triggered_by?: Database["public"]["Enums"]["nps_trigger"]
          unique_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_surveys_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          client_id: string
          created_at: string
          estimated_value: number | null
          id: string
          loss_notes: string | null
          loss_reason: Database["public"]["Enums"]["loss_reason"] | null
          probability: number | null
          responsible_id: string | null
          stage: Database["public"]["Enums"]["pipeline_stage"]
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          estimated_value?: number | null
          id?: string
          loss_notes?: string | null
          loss_reason?: Database["public"]["Enums"]["loss_reason"] | null
          probability?: number | null
          responsible_id?: string | null
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          estimated_value?: number | null
          id?: string
          loss_notes?: string | null
          loss_reason?: Database["public"]["Enums"]["loss_reason"] | null
          probability?: number | null
          responsible_id?: string | null
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
        ]
      }
      relationship_executions: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          message_sent: string | null
          n8n_execution_id: string | null
          rule_id: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["execution_status"]
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          message_sent?: string | null
          n8n_execution_id?: string | null
          rule_id: string
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          message_sent?: string | null
          n8n_execution_id?: string | null
          rule_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
        }
        Relationships: [
          {
            foreignKeyName: "relationship_executions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "relationship_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_rules: {
        Row: {
          active: boolean
          channel: Database["public"]["Enums"]["rule_channel"]
          created_at: string
          delay_days: number
          id: string
          message_template: string
          name: string
          trigger_event: Database["public"]["Enums"]["rule_trigger_event"]
        }
        Insert: {
          active?: boolean
          channel?: Database["public"]["Enums"]["rule_channel"]
          created_at?: string
          delay_days?: number
          id?: string
          message_template?: string
          name: string
          trigger_event?: Database["public"]["Enums"]["rule_trigger_event"]
        }
        Update: {
          active?: boolean
          channel?: Database["public"]["Enums"]["rule_channel"]
          created_at?: string
          delay_days?: number
          id?: string
          message_template?: string
          name?: string
          trigger_event?: Database["public"]["Enums"]["rule_trigger_event"]
        }
        Relationships: [
        ]
      }
      sales_entries: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          sold_at: string
          status: Database["public"]["Enums"]["sale_status"]
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          sold_at?: string
          status?: Database["public"]["Enums"]["sale_status"]
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          sold_at?: string
          status?: Database["public"]["Enums"]["sale_status"]
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      special_dates: {
        Row: {
          active: boolean
          created_at: string
          date: string
          id: string
          message_template: string | null
          name: string
          segment_tags: string[] | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          date: string
          id?: string
          message_template?: string | null
          name: string
          segment_tags?: string[] | null
        }
        Update: {
          active?: boolean
          created_at?: string
          date?: string
          id?: string
          message_template?: string | null
          name?: string
          segment_tags?: string[] | null
        }
        Relationships: [
        ]
      }
      tasks: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          responsible_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
        ]
      }
      whatsapp_instances: {
        Row: {
          id: string
          api_url: string
          api_token: string
          instance_name: string
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          api_url: string
          api_token: string
          instance_name: string
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          api_url?: string
          api_token?: string
          instance_name?: string
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gerente" | "vendedor" | "atendimento" | "super_admin"
      conversation_status:
        | "aberta"
        | "em_atendimento"
        | "aguardando"
        | "finalizada"
      execution_status: "scheduled" | "sent" | "failed" | "cancelled"
      goal_period_type: "daily" | "weekly" | "monthly"
      inventory_movement_type: "entrada" | "saida" | "ajuste"
      lead_origin:
        | "whatsapp"
        | "instagram"
        | "facebook"
        | "google"
        | "indicacao"
        | "loja_fisica"
        | "site"
        | "outro"
      loss_reason:
        | "preco"
        | "cliente_desistiu"
        | "concorrencia"
        | "sem_resposta"
        | "outro"
      message_sender_type: "cliente" | "atendente" | "ia"
      nps_category: "promotor" | "neutro" | "detrator"
      nps_status: "sent" | "responded" | "expired"
      nps_trigger: "after_sale" | "after_conversation" | "manual" | "scheduled"
      payment_method:
        | "pix"
        | "credito"
        | "debito"
        | "dinheiro"
        | "boleto"
        | "crediario"
      pipeline_stage:
        | "lead_novo"
        | "contato_iniciado"
        | "interessado"
        | "comprador"
        | "perdido"
        | "desqualificado"
      rule_channel: "whatsapp" | "sms" | "email"
      rule_trigger_event:
        | "after_purchase"
        | "no_purchase"
        | "birthday"
        | "manual"
      sale_status: "confirmado" | "pendente" | "cancelado"
      task_priority: "alta" | "media" | "baixa"
      task_status: "pendente" | "em_andamento" | "concluido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gerente", "vendedor", "atendimento", "super_admin"],
      conversation_status: [
        "aberta",
        "em_atendimento",
        "aguardando",
        "finalizada",
      ],
      execution_status: ["scheduled", "sent", "failed", "cancelled"],
      goal_period_type: ["daily", "weekly", "monthly"],
      inventory_movement_type: ["entrada", "saida", "ajuste"],
      lead_origin: [
        "whatsapp",
        "instagram",
        "facebook",
        "google",
        "indicacao",
        "loja_fisica",
        "site",
        "outro",
      ],
      loss_reason: [
        "preco",
        "cliente_desistiu",
        "concorrencia",
        "sem_resposta",
        "outro",
      ],
      message_sender_type: ["cliente", "atendente", "ia"],
      nps_category: ["promotor", "neutro", "detrator"],
      nps_status: ["sent", "responded", "expired"],
      nps_trigger: ["after_sale", "after_conversation", "manual", "scheduled"],
      payment_method: [
        "pix",
        "credito",
        "debito",
        "dinheiro",
        "boleto",
        "crediario",
      ],
      pipeline_stage: [
        "lead_recebido",
        "contato_iniciado",
        "cliente_interessado",
        "negociacao",
        "proposta_enviada",
        "venda_fechada",
        "perdido",
      ],
      rule_channel: ["whatsapp", "sms", "email"],
      rule_trigger_event: [
        "after_purchase",
        "no_purchase",
        "birthday",
        "manual",
      ],
      sale_status: ["confirmado", "pendente", "cancelado"],
      task_priority: ["alta", "media", "baixa"],
      task_status: ["pendente", "em_andamento", "concluido"],
    },
  },
} as const
