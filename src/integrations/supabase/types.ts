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
      activities: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          opportunity_id: string | null
          tenant_id: string
          type: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opportunity_id?: string | null
          tenant_id: string
          type: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opportunity_id?: string | null
          tenant_id?: string
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
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          id: string
          last_purchase: string | null
          name: string
          notes: string | null
          origin: Database["public"]["Enums"]["lead_origin"] | null
          phone: string | null
          responsible_id: string | null
          tags: string[] | null
          tenant_id: string
          ticket_medio: number | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_purchase?: string | null
          name: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"] | null
          phone?: string | null
          responsible_id?: string | null
          tags?: string[] | null
          tenant_id: string
          ticket_medio?: number | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_purchase?: string | null
          name?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"] | null
          phone?: string | null
          responsible_id?: string | null
          tags?: string[] | null
          tenant_id?: string
          ticket_medio?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          tenant_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
          tenant_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean | null
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          tenant_id: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "relationship_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          trigger_event?: Database["public"]["Enums"]["rule_trigger_event"]
        }
        Relationships: [
          {
            foreignKeyName: "relationship_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "sales_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          company_name: string
          created_at: string
          id: string
          logo_url: string | null
          plan_type: string | null
          primary_color: string | null
          secondary_color: string | null
        }
        Insert: {
          company_name: string
          created_at?: string
          id?: string
          logo_url?: string | null
          plan_type?: string | null
          primary_color?: string | null
          secondary_color?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          plan_type?: string | null
          primary_color?: string | null
          secondary_color?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gerente" | "vendedor" | "atendimento"
      conversation_status:
        | "aberta"
        | "em_atendimento"
        | "aguardando"
        | "finalizada"
      execution_status: "scheduled" | "sent" | "failed" | "cancelled"
      goal_period_type: "daily" | "weekly" | "monthly"
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
      payment_method:
        | "pix"
        | "credito"
        | "debito"
        | "dinheiro"
        | "boleto"
        | "crediario"
      pipeline_stage:
        | "lead_recebido"
        | "contato_iniciado"
        | "cliente_interessado"
        | "negociacao"
        | "proposta_enviada"
        | "venda_fechada"
        | "perdido"
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
      app_role: ["admin", "gerente", "vendedor", "atendimento"],
      conversation_status: [
        "aberta",
        "em_atendimento",
        "aguardando",
        "finalizada",
      ],
      execution_status: ["scheduled", "sent", "failed", "cancelled"],
      goal_period_type: ["daily", "weekly", "monthly"],
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
