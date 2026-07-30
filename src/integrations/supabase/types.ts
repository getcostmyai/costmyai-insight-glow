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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          org_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmarks: {
        Row: {
          id: string
          measured_at: string
          model_key: string
          score: number
          source: string | null
          suite: string
          task_class: string
        }
        Insert: {
          id?: string
          measured_at?: string
          model_key: string
          score: number
          source?: string | null
          suite: string
          task_class: string
        }
        Update: {
          id?: string
          measured_at?: string
          model_key?: string
          score?: number
          source?: string | null
          suite?: string
          task_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmarks_model_key_fkey"
            columns: ["model_key"]
            isOneToOne: false
            referencedRelation: "model_catalog"
            referencedColumns: ["model_key"]
          },
        ]
      }
      host_prices: {
        Row: {
          host: string
          host_label: string
          id: string
          input_usd_per_mtok: number
          model_key: string
          output_usd_per_mtok: number
          region: string
          verified_at: string
        }
        Insert: {
          host: string
          host_label: string
          id?: string
          input_usd_per_mtok: number
          model_key: string
          output_usd_per_mtok: number
          region?: string
          verified_at?: string
        }
        Update: {
          host?: string
          host_label?: string
          id?: string
          input_usd_per_mtok?: number
          model_key?: string
          output_usd_per_mtok?: number
          region?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_prices_model_key_fkey"
            columns: ["model_key"]
            isOneToOne: false
            referencedRelation: "model_catalog"
            referencedColumns: ["model_key"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      model_catalog: {
        Row: {
          context_window: number | null
          created_at: string
          display_name: string
          is_reasoning: boolean
          model_key: string
          tier: string
          vendor: string
        }
        Insert: {
          context_window?: number | null
          created_at?: string
          display_name: string
          is_reasoning?: boolean
          model_key: string
          tier?: string
          vendor: string
        }
        Update: {
          context_window?: number | null
          created_at?: string
          display_name?: string
          is_reasoning?: boolean
          model_key?: string
          tier?: string
          vendor?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          billing_interval: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          plan_valid_until: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_valid_until?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_valid_until?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          basis: string
          computed_at: string
          from_host: string
          from_model: string
          id: string
          kind: Database["public"]["Enums"]["rec_kind"]
          min_plan: Database["public"]["Enums"]["plan_tier"]
          monthly_saving_usd: number
          note: string | null
          org_id: string
          quality_delta: number | null
          saving_pct: number
          status: Database["public"]["Enums"]["rec_status"]
          task_hint: string | null
          to_host: string | null
          to_model: string | null
        }
        Insert: {
          basis: string
          computed_at?: string
          from_host: string
          from_model: string
          id?: string
          kind: Database["public"]["Enums"]["rec_kind"]
          min_plan?: Database["public"]["Enums"]["plan_tier"]
          monthly_saving_usd?: number
          note?: string | null
          org_id: string
          quality_delta?: number | null
          saving_pct?: number
          status?: Database["public"]["Enums"]["rec_status"]
          task_hint?: string | null
          to_host?: string | null
          to_model?: string | null
        }
        Update: {
          basis?: string
          computed_at?: string
          from_host?: string
          from_model?: string
          id?: string
          kind?: Database["public"]["Enums"]["rec_kind"]
          min_plan?: Database["public"]["Enums"]["plan_tier"]
          monthly_saving_usd?: number
          note?: string | null
          org_id?: string
          quality_delta?: number | null
          saving_pct?: number
          status?: Database["public"]["Enums"]["rec_status"]
          task_hint?: string | null
          to_host?: string | null
          to_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      switch_events: {
        Row: {
          actor: string | null
          created_at: string
          detail: string | null
          event: string
          id: string
          org_id: string
          switch_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          org_id: string
          switch_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          org_id?: string
          switch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "switch_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "switch_events_switch_id_fkey"
            columns: ["switch_id"]
            isOneToOne: false
            referencedRelation: "switches"
            referencedColumns: ["id"]
          },
        ]
      }
      switches: {
        Row: {
          activated_at: string
          activated_by: string | null
          autonomous: boolean
          badge: string
          basis: string
          from_host: string
          from_model: string
          id: string
          org_id: string
          recommendation_id: string | null
          saved_usd: number
          status: Database["public"]["Enums"]["switch_status"]
          to_host: string
          to_model: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          activated_by?: string | null
          autonomous?: boolean
          badge?: string
          basis: string
          from_host: string
          from_model: string
          id?: string
          org_id: string
          recommendation_id?: string | null
          saved_usd?: number
          status?: Database["public"]["Enums"]["switch_status"]
          to_host: string
          to_model: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          activated_by?: string | null
          autonomous?: boolean
          badge?: string
          basis?: string
          from_host?: string
          from_model?: string
          id?: string
          org_id?: string
          recommendation_id?: string | null
          saved_usd?: number
          status?: Database["public"]["Enums"]["switch_status"]
          to_host?: string
          to_model?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "switches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "switches_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string
          host: string
          id: number
          idempotency_key: string | null
          input_tokens: number
          latency_ms: number | null
          model_key: string
          occurred_at: string
          org_id: string
          output_tokens: number
          status: string
          task_hint: string
        }
        Insert: {
          created_at?: string
          host: string
          id?: number
          idempotency_key?: string | null
          input_tokens?: number
          latency_ms?: number | null
          model_key: string
          occurred_at?: string
          org_id: string
          output_tokens?: number
          status?: string
          task_hint?: string
        }
        Update: {
          created_at?: string
          host?: string
          id?: number
          idempotency_key?: string | null
          input_tokens?: number
          latency_ms?: number | null
          model_key?: string
          occurred_at?: string
          org_id?: string
          output_tokens?: number
          status?: string
          task_hint?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_rollups: {
        Row: {
          bucket_start: string
          cost_usd: number
          granularity: string
          host: string
          id: string
          input_tokens: number
          model_key: string
          org_id: string
          output_tokens: number
          requests: number
          task_hint: string
        }
        Insert: {
          bucket_start: string
          cost_usd?: number
          granularity?: string
          host: string
          id?: string
          input_tokens?: number
          model_key: string
          org_id: string
          output_tokens?: number
          requests?: number
          task_hint?: string
        }
        Update: {
          bucket_start?: string
          cost_usd?: number
          granularity?: string
          host?: string
          id?: string
          input_tokens?: number
          model_key?: string
          org_id?: string
          output_tokens?: number
          requests?: number
          task_hint?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_rollups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workload_profiles: {
        Row: {
          avg_input_tokens: number
          avg_output_tokens: number
          complexity_score: number
          computed_at: string
          host: string
          id: string
          model_key: string
          monthly_cost_usd: number
          observed_tier: string
          org_id: string
          required_tier: string
          task_hint: string
        }
        Insert: {
          avg_input_tokens?: number
          avg_output_tokens?: number
          complexity_score?: number
          computed_at?: string
          host: string
          id?: string
          model_key: string
          monthly_cost_usd?: number
          observed_tier?: string
          org_id: string
          required_tier?: string
          task_hint: string
        }
        Update: {
          avg_input_tokens?: number
          avg_output_tokens?: number
          complexity_score?: number
          computed_at?: string
          host?: string
          id?: string
          model_key?: string
          monthly_cost_usd?: number
          observed_tier?: string
          org_id?: string
          required_tier?: string
          task_hint?: string
        }
        Relationships: [
          {
            foreignKeyName: "workload_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_org_manager: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      org_plan: {
        Args: { _org_id: string }
        Returns: Database["public"]["Enums"]["plan_tier"]
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "member"
      plan_tier: "compare" | "certify" | "rightsize" | "govern"
      rec_kind: "host_arbitrage" | "quality_match" | "rightsize"
      rec_status: "open" | "dismissed" | "activated" | "refused"
      switch_status: "active" | "paused" | "rolled_back"
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
      app_role: ["owner", "admin", "member"],
      plan_tier: ["compare", "certify", "rightsize", "govern"],
      rec_kind: ["host_arbitrage", "quality_match", "rightsize"],
      rec_status: ["open", "dismissed", "activated", "refused"],
      switch_status: ["active", "paused", "rolled_back"],
    },
  },
} as const
