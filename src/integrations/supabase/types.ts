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
      backup_export_runs: {
        Row: {
          bytes: number | null
          counts_match: boolean | null
          destination: string | null
          error: string | null
          finished_at: string | null
          id: string
          object_key: string | null
          ok: boolean | null
          pruned_keys: number
          row_counts: Json | null
          started_at: string
          statements: number | null
          target_row_counts: Json | null
          triggers_ok: boolean | null
        }
        Insert: {
          bytes?: number | null
          counts_match?: boolean | null
          destination?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          object_key?: string | null
          ok?: boolean | null
          pruned_keys?: number
          row_counts?: Json | null
          started_at?: string
          statements?: number | null
          target_row_counts?: Json | null
          triggers_ok?: boolean | null
        }
        Update: {
          bytes?: number | null
          counts_match?: boolean | null
          destination?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          object_key?: string | null
          ok?: boolean | null
          pruned_keys?: number
          row_counts?: Json | null
          started_at?: string
          statements?: number | null
          target_row_counts?: Json | null
          triggers_ok?: boolean | null
        }
        Relationships: []
      }
      benchmark_margins: {
        Row: {
          created_at: string
          id: string
          is_fixture: boolean
          margin: number
          method: string
          source_run_id: string | null
          suite: string
          synced_at: string
          task_class: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_fixture?: boolean
          margin: number
          method?: string
          source_run_id?: string | null
          suite: string
          synced_at?: string
          task_class: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_fixture?: boolean
          margin?: number
          method?: string
          source_run_id?: string | null
          suite?: string
          synced_at?: string
          task_class?: string
          updated_at?: string
        }
        Relationships: []
      }
      benchmarks: {
        Row: {
          id: string
          is_fixture: boolean
          measured_at: string
          model_key: string
          sample_size: number | null
          score: number
          source: string | null
          source_run_id: string | null
          suite: string
          synced_at: string
          task_class: string
        }
        Insert: {
          id?: string
          is_fixture?: boolean
          measured_at?: string
          model_key: string
          sample_size?: number | null
          score: number
          source?: string | null
          source_run_id?: string | null
          suite: string
          synced_at?: string
          task_class: string
        }
        Update: {
          id?: string
          is_fixture?: boolean
          measured_at?: string
          model_key?: string
          sample_size?: number | null
          score?: number
          source?: string | null
          source_run_id?: string | null
          suite?: string
          synced_at?: string
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
      billing_captures: {
        Row: {
          captured_at: string
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          invoiced_usd: number
          is_synthetic: boolean
          org_id: string
          period_end: string
          period_start: string
          provider: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          invoiced_usd: number
          is_synthetic?: boolean
          org_id: string
          period_end: string
          period_start: string
          provider: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          invoiced_usd?: number
          is_synthetic?: boolean
          org_id?: string
          period_end?: string
          period_start?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_captures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_reconciliations: {
        Row: {
          capture_id: string
          computed_at: string
          created_at: string
          delta_pct: number
          delta_usd: number
          estimated_usd: number
          id: string
          invoiced_usd: number
          note: string | null
          org_id: string
          superseded_at: string | null
          supersedes_id: string | null
          verdict: string
        }
        Insert: {
          capture_id: string
          computed_at?: string
          created_at?: string
          delta_pct: number
          delta_usd: number
          estimated_usd: number
          id?: string
          invoiced_usd: number
          note?: string | null
          org_id: string
          superseded_at?: string | null
          supersedes_id?: string | null
          verdict?: string
        }
        Update: {
          capture_id?: string
          computed_at?: string
          created_at?: string
          delta_pct?: number
          delta_usd?: number
          estimated_usd?: number
          id?: string
          invoiced_usd?: number
          note?: string | null
          org_id?: string
          superseded_at?: string | null
          supersedes_id?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_reconciliations_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "billing_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_reconciliations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_reconciliations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_ledger: {
        Row: {
          clawback_of: string | null
          clawback_reason: string | null
          commission_usd: number
          created_at: string
          environment: string
          id: string
          invoice_id: string
          org_id: string
          paid_at: string | null
          partner_id: string
          payout_id: string | null
          period_end: string | null
          period_start: string | null
          rate_pct: number
          revenue_usd: number
          status: Database["public"]["Enums"]["commission_status"]
          stripe_subscription_id: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          clawback_of?: string | null
          clawback_reason?: string | null
          commission_usd: number
          created_at?: string
          environment?: string
          id?: string
          invoice_id: string
          org_id: string
          paid_at?: string | null
          partner_id: string
          payout_id?: string | null
          period_end?: string | null
          period_start?: string | null
          rate_pct: number
          revenue_usd: number
          status?: Database["public"]["Enums"]["commission_status"]
          stripe_subscription_id?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          clawback_of?: string | null
          clawback_reason?: string | null
          commission_usd?: number
          created_at?: string
          environment?: string
          id?: string
          invoice_id?: string
          org_id?: string
          paid_at?: string | null
          partner_id?: string
          payout_id?: string | null
          period_end?: string | null
          period_start?: string | null
          rate_pct?: number
          revenue_usd?: number
          status?: Database["public"]["Enums"]["commission_status"]
          stripe_subscription_id?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_ledger_clawback_of_fkey"
            columns: ["clawback_of"]
            isOneToOne: false
            referencedRelation: "commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "partner_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      host_prices: {
        Row: {
          external_id: string | null
          host: string
          host_label: string
          id: string
          input_usd_per_mtok: number
          is_active: boolean
          is_fixture: boolean
          last_seen_at: string
          latency_measured_at: string | null
          latency_scope: string | null
          latency_source_run_id: string | null
          median_latency_ms: number | null
          median_ttft_ms: number | null
          missed_syncs: number
          model_key: string
          output_tps: number | null
          output_usd_per_mtok: number
          price_source: string
          region: string
          source: string | null
          source_priority: number
          source_run_id: string | null
          throughput_tps: number | null
          verified_at: string
        }
        Insert: {
          external_id?: string | null
          host: string
          host_label: string
          id?: string
          input_usd_per_mtok: number
          is_active?: boolean
          is_fixture?: boolean
          last_seen_at?: string
          latency_measured_at?: string | null
          latency_scope?: string | null
          latency_source_run_id?: string | null
          median_latency_ms?: number | null
          median_ttft_ms?: number | null
          missed_syncs?: number
          model_key: string
          output_tps?: number | null
          output_usd_per_mtok: number
          price_source?: string
          region?: string
          source?: string | null
          source_priority?: number
          source_run_id?: string | null
          throughput_tps?: number | null
          verified_at?: string
        }
        Update: {
          external_id?: string | null
          host?: string
          host_label?: string
          id?: string
          input_usd_per_mtok?: number
          is_active?: boolean
          is_fixture?: boolean
          last_seen_at?: string
          latency_measured_at?: string | null
          latency_scope?: string | null
          latency_source_run_id?: string | null
          median_latency_ms?: number | null
          median_ttft_ms?: number | null
          missed_syncs?: number
          model_key?: string
          output_tps?: number | null
          output_usd_per_mtok?: number
          price_source?: string
          region?: string
          source?: string | null
          source_priority?: number
          source_run_id?: string | null
          throughput_tps?: number | null
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
      intelligence_leads: {
        Row: {
          created_at: string
          dedupe_key: string
          detector: string
          editor_note: string | null
          evidence: Json
          first_seen_at: string
          id: string
          last_seen_at: string
          severity: string
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          detector: string
          editor_note?: string | null
          evidence?: Json
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          severity?: string
          status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          detector?: string
          editor_note?: string | null
          evidence?: Json
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          severity?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_config: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
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
      model_aliases: {
        Row: {
          alias: string
          created_at: string
          model_key: string
          source: string
        }
        Insert: {
          alias: string
          created_at?: string
          model_key: string
          source?: string
        }
        Update: {
          alias?: string
          created_at?: string
          model_key?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_aliases_model_key_fkey"
            columns: ["model_key"]
            isOneToOne: false
            referencedRelation: "model_catalog"
            referencedColumns: ["model_key"]
          },
        ]
      }
      model_catalog: {
        Row: {
          context_window: number | null
          created_at: string
          display_name: string
          endpoints_synced_at: string | null
          external_id: string | null
          first_seen_at: string
          is_active: boolean
          is_reasoning: boolean
          last_seen_at: string
          modality: string
          model_key: string
          source: string
          tier: string
          updated_at: string
          vendor: string
        }
        Insert: {
          context_window?: number | null
          created_at?: string
          display_name: string
          endpoints_synced_at?: string | null
          external_id?: string | null
          first_seen_at?: string
          is_active?: boolean
          is_reasoning?: boolean
          last_seen_at?: string
          modality?: string
          model_key: string
          source?: string
          tier?: string
          updated_at?: string
          vendor: string
        }
        Update: {
          context_window?: number | null
          created_at?: string
          display_name?: string
          endpoints_synced_at?: string | null
          external_id?: string | null
          first_seen_at?: string
          is_active?: boolean
          is_reasoning?: boolean
          last_seen_at?: string
          modality?: string
          model_key?: string
          source?: string
          tier?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      monthly_kpi_snapshot: {
        Row: {
          frozen_at: string
          id: string
          month: string
          note: string | null
          payload: Json
          superseded_at: string | null
          supersedes_id: string | null
        }
        Insert: {
          frozen_at?: string
          id?: string
          month: string
          note?: string | null
          payload: Json
          superseded_at?: string | null
          supersedes_id?: string | null
        }
        Update: {
          frozen_at?: string
          id?: string
          month?: string
          note?: string | null
          payload?: Json
          superseded_at?: string | null
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_kpi_snapshot_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "monthly_kpi_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          created_at: string
          created_by: string | null
          host: string | null
          id: string
          is_synthetic: boolean
          max_latency_ms: number | null
          model_key: string | null
          objective: Database["public"]["Enums"]["objective_kind"]
          org_id: string
          quality_floor_score: number | null
          task_hint: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          host?: string | null
          id?: string
          is_synthetic?: boolean
          max_latency_ms?: number | null
          model_key?: string | null
          objective?: Database["public"]["Enums"]["objective_kind"]
          org_id: string
          quality_floor_score?: number | null
          task_hint?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          host?: string | null
          id?: string
          is_synthetic?: boolean
          max_latency_ms?: number | null
          model_key?: string | null
          objective?: Database["public"]["Enums"]["objective_kind"]
          org_id?: string
          quality_floor_score?: number | null
          task_hint?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objectives_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_profiles: {
        Row: {
          benchmark_prompt_dismissed_at: string | null
          created_at: string
          customer_facing: boolean | null
          headcount_band: string | null
          industry: string
          maturity: Database["public"]["Enums"]["deployment_maturity"] | null
          org_id: string
          primer_seen_at: string | null
          quality_flag: string | null
          revenue_band: string | null
          updated_at: string
          use_case: Database["public"]["Enums"]["ai_use_case"]
          use_case_other: string | null
        }
        Insert: {
          benchmark_prompt_dismissed_at?: string | null
          created_at?: string
          customer_facing?: boolean | null
          headcount_band?: string | null
          industry: string
          maturity?: Database["public"]["Enums"]["deployment_maturity"] | null
          org_id: string
          primer_seen_at?: string | null
          quality_flag?: string | null
          revenue_band?: string | null
          updated_at?: string
          use_case: Database["public"]["Enums"]["ai_use_case"]
          use_case_other?: string | null
        }
        Update: {
          benchmark_prompt_dismissed_at?: string | null
          created_at?: string
          customer_facing?: boolean | null
          headcount_band?: string | null
          industry?: string
          maturity?: Database["public"]["Enums"]["deployment_maturity"] | null
          org_id?: string
          primer_seen_at?: string | null
          quality_flag?: string | null
          revenue_band?: string | null
          updated_at?: string
          use_case?: Database["public"]["Enums"]["ai_use_case"]
          use_case_other?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          autonomous_enabled: boolean
          billing_interval: string
          created_at: string
          created_by: string | null
          id: string
          is_synthetic: boolean
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          plan_valid_until: string | null
          referred_at: string | null
          referred_by_partner_id: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          autonomous_enabled?: boolean
          billing_interval?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_synthetic?: boolean
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_valid_until?: string | null
          referred_at?: string | null
          referred_by_partner_id?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          autonomous_enabled?: boolean
          billing_interval?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_synthetic?: boolean
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_valid_until?: string | null
          referred_at?: string | null
          referred_by_partner_id?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_applications: {
        Row: {
          active_clients_bucket: string
          company: string
          created_at: string
          email: string
          escalated: boolean
          first_name: string
          id: string
          last_name: string
          notified_at: string | null
          notify_error: string | null
          phone: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          routed_path: Database["public"]["Enums"]["partner_application_path"]
          starting_soon_bucket: string
          status: Database["public"]["Enums"]["partner_application_status"]
          updated_at: string
        }
        Insert: {
          active_clients_bucket: string
          company: string
          created_at?: string
          email: string
          escalated?: boolean
          first_name: string
          id?: string
          last_name: string
          notified_at?: string | null
          notify_error?: string | null
          phone: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          routed_path: Database["public"]["Enums"]["partner_application_path"]
          starting_soon_bucket: string
          status?: Database["public"]["Enums"]["partner_application_status"]
          updated_at?: string
        }
        Update: {
          active_clients_bucket?: string
          company?: string
          created_at?: string
          email?: string
          escalated?: boolean
          first_name?: string
          id?: string
          last_name?: string
          notified_at?: string | null
          notify_error?: string | null
          phone?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          routed_path?: Database["public"]["Enums"]["partner_application_path"]
          starting_soon_bucket?: string
          status?: Database["public"]["Enums"]["partner_application_status"]
          updated_at?: string
        }
        Relationships: []
      }
      partner_payouts: {
        Row: {
          amount_payout_currency: number | null
          amount_usd: number
          created_at: string
          created_by: string | null
          environment: string
          error: string | null
          fx_detail: Json | null
          fx_rate: number | null
          id: string
          line_count: number
          partner_id: string
          payout_currency: string
          status: string
          stripe_destination_account: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_payout_currency?: number | null
          amount_usd: number
          created_at?: string
          created_by?: string | null
          environment: string
          error?: string | null
          fx_detail?: Json | null
          fx_rate?: number | null
          id?: string
          line_count?: number
          partner_id: string
          payout_currency?: string
          status?: string
          stripe_destination_account?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_payout_currency?: number | null
          amount_usd?: number
          created_at?: string
          created_by?: string | null
          environment?: string
          error?: string | null
          fx_detail?: Json | null
          fx_rate?: number | null
          id?: string
          line_count?: number
          partner_id?: string
          payout_currency?: string
          status?: string
          stripe_destination_account?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_tier_audit: {
        Row: {
          actor: string | null
          created_at: string
          earned_tier: number
          from_tier: number | null
          id: string
          partner_id: string
          reason: string
          to_tier: number | null
        }
        Insert: {
          actor?: string | null
          created_at?: string
          earned_tier: number
          from_tier?: number | null
          id?: string
          partner_id: string
          reason: string
          to_tier?: number | null
        }
        Update: {
          actor?: string | null
          created_at?: string
          earned_tier?: number
          from_tier?: number | null
          id?: string
          partner_id?: string
          reason?: string
          to_tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_tier_audit_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_tiers: {
        Row: {
          created_at: string
          min_lifetime_referred_usd: number
          name: string
          rate_pct: number
          tier: number
        }
        Insert: {
          created_at?: string
          min_lifetime_referred_usd: number
          name: string
          rate_pct: number
          tier: number
        }
        Update: {
          created_at?: string
          min_lifetime_referred_usd?: number
          name?: string
          rate_pct?: number
          tier?: number
        }
        Relationships: []
      }
      partner_users: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          role: Database["public"]["Enums"]["partner_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          role?: Database["public"]["Enums"]["partner_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          role?: Database["public"]["Enums"]["partner_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_users_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          contact_email: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          referral_code: string
          status: Database["public"]["Enums"]["partner_status"]
          stripe_connect_account_id: string | null
          stripe_connect_environment: string | null
          stripe_connect_status: string
          stripe_connect_updated_at: string | null
          tier_override: number | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          referral_code: string
          status?: Database["public"]["Enums"]["partner_status"]
          stripe_connect_account_id?: string | null
          stripe_connect_environment?: string | null
          stripe_connect_status?: string
          stripe_connect_updated_at?: string | null
          tier_override?: number | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          referral_code?: string
          status?: Database["public"]["Enums"]["partner_status"]
          stripe_connect_account_id?: string | null
          stripe_connect_environment?: string | null
          stripe_connect_status?: string
          stripe_connect_updated_at?: string | null
          tier_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_tier_override_fkey"
            columns: ["tier_override"]
            isOneToOne: false
            referencedRelation: "partner_tiers"
            referencedColumns: ["tier"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          autonomous_switching: boolean
          billing_reconciliation: boolean
          created_at: string
          host_arbitrage: boolean
          manual_switching: boolean
          max_seats: number | null
          objective_selection: boolean
          plan: Database["public"]["Enums"]["plan_tier"]
          quality_match: boolean
          rightsize: boolean
          updated_at: string
        }
        Insert: {
          autonomous_switching?: boolean
          billing_reconciliation?: boolean
          created_at?: string
          host_arbitrage?: boolean
          manual_switching?: boolean
          max_seats?: number | null
          objective_selection?: boolean
          plan: Database["public"]["Enums"]["plan_tier"]
          quality_match?: boolean
          rightsize?: boolean
          updated_at?: string
        }
        Update: {
          autonomous_switching?: boolean
          billing_reconciliation?: boolean
          created_at?: string
          host_arbitrage?: boolean
          manual_switching?: boolean
          max_seats?: number | null
          objective_selection?: boolean
          plan?: Database["public"]["Enums"]["plan_tier"]
          quality_match?: boolean
          rightsize?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      price_history: {
        Row: {
          change_kind: string
          host: string
          id: string
          input_usd_per_mtok: number | null
          model_key: string
          observed_at: string
          output_usd_per_mtok: number | null
          pct_change: number | null
          prev_input_usd_per_mtok: number | null
          prev_output_usd_per_mtok: number | null
          price_source: string
          region: string
          sync_run_id: string
        }
        Insert: {
          change_kind: string
          host: string
          id?: string
          input_usd_per_mtok?: number | null
          model_key: string
          observed_at?: string
          output_usd_per_mtok?: number | null
          pct_change?: number | null
          prev_input_usd_per_mtok?: number | null
          prev_output_usd_per_mtok?: number | null
          price_source: string
          region?: string
          sync_run_id: string
        }
        Update: {
          change_kind?: string
          host?: string
          id?: string
          input_usd_per_mtok?: number | null
          model_key?: string
          observed_at?: string
          output_usd_per_mtok?: number | null
          pct_change?: number | null
          prev_input_usd_per_mtok?: number | null
          prev_output_usd_per_mtok?: number | null
          price_source?: string
          region?: string
          sync_run_id?: string
        }
        Relationships: []
      }
      pricing_snapshots: {
        Row: {
          created_at: string
          error_detail: string | null
          feed: string
          finished_at: string | null
          id: string
          is_fixture: boolean
          models_upserted: number
          price_changes: number
          rows_upserted: number
          run_id: string | null
          status: string
          synced_at: string
        }
        Insert: {
          created_at?: string
          error_detail?: string | null
          feed: string
          finished_at?: string | null
          id?: string
          is_fixture?: boolean
          models_upserted?: number
          price_changes?: number
          rows_upserted?: number
          run_id?: string | null
          status?: string
          synced_at?: string
        }
        Update: {
          created_at?: string
          error_detail?: string | null
          feed?: string
          finished_at?: string | null
          id?: string
          is_fixture?: boolean
          models_upserted?: number
          price_changes?: number
          rows_upserted?: number
          run_id?: string | null
          status?: string
          synced_at?: string
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
          is_synthetic: boolean
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
          is_synthetic?: boolean
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
          is_synthetic?: boolean
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
      routing_rules: {
        Row: {
          basis: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          from_host: string
          from_model: string
          id: string
          is_synthetic: boolean
          org_id: string
          source: Database["public"]["Enums"]["routing_source"]
          state: Database["public"]["Enums"]["routing_state"]
          switch_id: string | null
          task_hint: string | null
          to_host: string
          to_model: string
          updated_at: string
        }
        Insert: {
          basis?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          from_host: string
          from_model: string
          id?: string
          is_synthetic?: boolean
          org_id: string
          source?: Database["public"]["Enums"]["routing_source"]
          state?: Database["public"]["Enums"]["routing_state"]
          switch_id?: string | null
          task_hint?: string | null
          to_host: string
          to_model: string
          updated_at?: string
        }
        Update: {
          basis?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          from_host?: string
          from_model?: string
          id?: string
          is_synthetic?: boolean
          org_id?: string
          source?: Database["public"]["Enums"]["routing_source"]
          state?: Database["public"]["Enums"]["routing_state"]
          switch_id?: string | null
          task_hint?: string | null
          to_host?: string
          to_model?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_rules_switch_id_fkey"
            columns: ["switch_id"]
            isOneToOne: false
            referencedRelation: "switches"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          org_id: string
          plan: Database["public"]["Enums"]["plan_tier"]
          price_id: string
          product_id: string | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          org_id: string
          plan: Database["public"]["Enums"]["plan_tier"]
          price_id: string
          product_id?: string | null
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          org_id?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          price_id?: string
          product_id?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
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
          is_synthetic: boolean
          org_id: string
          switch_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          is_synthetic?: boolean
          org_id: string
          switch_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          is_synthetic?: boolean
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
          is_synthetic: boolean
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
          is_synthetic?: boolean
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
          is_synthetic?: boolean
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
      sync_runs: {
        Row: {
          created_at: string
          detail: Json | null
          error: string | null
          finished_at: string | null
          id: string
          job: string
          ok: boolean | null
          outcome: string | null
          rows_written: number | null
          started_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job: string
          ok?: boolean | null
          outcome?: string | null
          rows_written?: number | null
          started_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job?: string
          ok?: boolean | null
          outcome?: string | null
          rows_written?: number | null
          started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          envelope_skeleton: Json | null
          host: string
          id: number
          idempotency_key: string | null
          input_tokens: number
          is_synthetic: boolean
          latency_ms: number | null
          model_key: string
          occurred_at: string
          org_id: string
          output_tokens: number
          parse_status: string
          parser_revision: number | null
          reparsed_at: string | null
          status: string
          task_hint: string
        }
        Insert: {
          created_at?: string
          envelope_skeleton?: Json | null
          host: string
          id?: number
          idempotency_key?: string | null
          input_tokens?: number
          is_synthetic?: boolean
          latency_ms?: number | null
          model_key: string
          occurred_at?: string
          org_id: string
          output_tokens?: number
          parse_status?: string
          parser_revision?: number | null
          reparsed_at?: string | null
          status?: string
          task_hint?: string
        }
        Update: {
          created_at?: string
          envelope_skeleton?: Json | null
          host?: string
          id?: number
          idempotency_key?: string | null
          input_tokens?: number
          is_synthetic?: boolean
          latency_ms?: number | null
          model_key?: string
          occurred_at?: string
          org_id?: string
          output_tokens?: number
          parse_status?: string
          parser_revision?: number | null
          reparsed_at?: string | null
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
          is_synthetic: boolean
          model_key: string
          org_id: string
          output_p50: number | null
          output_p95: number | null
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
          is_synthetic?: boolean
          model_key: string
          org_id: string
          output_p50?: number | null
          output_p95?: number | null
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
          is_synthetic?: boolean
          model_key?: string
          org_id?: string
          output_p50?: number | null
          output_p95?: number | null
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
          is_synthetic: boolean
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
          is_synthetic?: boolean
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
          is_synthetic?: boolean
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
      current_prices: {
        Row: {
          external_id: string | null
          host: string | null
          host_label: string | null
          id: string | null
          input_usd_per_mtok: number | null
          is_fixture: boolean | null
          last_seen_at: string | null
          latency_measured_at: string | null
          latency_scope: string | null
          median_latency_ms: number | null
          median_ttft_ms: number | null
          model_key: string | null
          output_tps: number | null
          output_usd_per_mtok: number | null
          price_source: string | null
          region: string | null
          source_priority: number | null
          throughput_tps: number | null
          verified_at: string | null
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
    }
    Functions: {
      accept_invite: { Args: { _invite_id: string }; Returns: string }
      accrue_commission: {
        Args: {
          _environment?: string
          _invoice_id: string
          _org_id: string
          _period_end?: string
          _period_start?: string
          _revenue_usd: number
          _subscription_id?: string
        }
        Returns: string
      }
      apply_switch: {
        Args: { _autonomous?: boolean; _rec_id: string }
        Returns: string
      }
      attach_referral: {
        Args: { _code: string; _org_id: string }
        Returns: string
      }
      backup_export_counts: { Args: never; Returns: Json }
      backup_export_sql: { Args: never; Returns: string }
      benchmark_ask_threshold: { Args: never; Returns: number }
      benchmark_cut: {
        Args: { _industry?: string; _revenue_band?: string; _use_case?: string }
        Returns: {
          company_count: number
          p25_usd: number
          p50_usd: number
          p75_usd: number
        }[]
      }
      benchmark_eligible_companies: { Args: never; Returns: number }
      benchmark_k_floor: { Args: never; Returns: number }
      claim_partner_membership: { Args: never; Returns: string }
      clawback_commission: {
        Args: { _environment?: string; _invoice_id: string; _reason: string }
        Returns: Json
      }
      create_organization: { Args: { _name: string }; Returns: string }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_org_manager: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      is_partner_member: { Args: { _partner_id: string }; Returns: boolean }
      is_partner_owner: { Args: { _partner_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      org_entitled_to: {
        Args: {
          _org_id: string
          _required: Database["public"]["Enums"]["plan_tier"]
        }
        Returns: boolean
      }
      org_has_active_subscription: {
        Args: { _env?: string; _org_id: string }
        Returns: boolean
      }
      org_is_synthetic: { Args: { _org_id: string }; Returns: boolean }
      org_plan: {
        Args: { _org_id: string }
        Returns: Database["public"]["Enums"]["plan_tier"]
      }
      partner_badge: {
        Args: { _code: string }
        Returns: {
          joined_at: string
          partner_name: string
          rate_pct: number
          tier: number
          tier_name: string
        }[]
      }
      partner_commission_rate: {
        Args: { _partner_id: string }
        Returns: number
      }
      partner_earned_tier: { Args: { _partner_id: string }; Returns: number }
      partner_effective_tier: { Args: { _partner_id: string }; Returns: number }
      partner_lifetime_revenue: {
        Args: { _partner_id: string }
        Returns: number
      }
      partner_referrals: {
        Args: { _partner_id: string }
        Returns: {
          id: string
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          referred_at: string
        }[]
      }
      partner_set_connect_account: {
        Args: {
          _account_id: string
          _environment: string
          _partner_id: string
          _status: string
        }
        Returns: undefined
      }
      partner_set_connect_status_by_account: {
        Args: { _account_id: string; _status: string }
        Returns: string
      }
      partner_summary: {
        Args: { _partner_id: string }
        Returns: {
          earned_tier: number
          effective_tier: number
          lifetime_revenue_usd: number
          rate_pct: number
        }[]
      }
      payout_begin: {
        Args: { _actor?: string; _environment: string; _partner_id: string }
        Returns: Json
      }
      payout_fail: {
        Args: { _error: string; _payout_id: string }
        Returns: undefined
      }
      payout_record_fx: {
        Args: {
          _amount: number
          _currency: string
          _detail: Json
          _payout_id: string
          _rate: number
        }
        Returns: undefined
      }
      payout_settle: {
        Args: { _payout_id: string; _transfer_id: string }
        Returns: undefined
      }
      plan_rank: {
        Args: { _plan: Database["public"]["Enums"]["plan_tier"] }
        Returns: number
      }
      provision_partner_from_application: {
        Args: { _application_id: string }
        Returns: Json
      }
      schema_filter_state: { Args: { _predicates: Json }; Returns: Json }
      set_org_plan: {
        Args: {
          _org_id: string
          _plan: Database["public"]["Enums"]["plan_tier"]
        }
        Returns: Database["public"]["Enums"]["plan_tier"]
      }
      set_partner_tier_override: {
        Args: { _partner_id: string; _reason: string; _tier: number }
        Returns: number
      }
      set_switch_state: {
        Args: {
          _reason?: string
          _status: Database["public"]["Enums"]["switch_status"]
          _switch_id: string
        }
        Returns: Database["public"]["Enums"]["switch_status"]
      }
      system_apply_switch: { Args: { _rec_id: string }; Returns: string }
      system_upsert_recommendation: {
        Args: {
          _basis: string
          _from_host: string
          _from_model: string
          _kind: Database["public"]["Enums"]["rec_kind"]
          _min_plan: Database["public"]["Enums"]["plan_tier"]
          _monthly_saving: number
          _note?: string
          _org_id: string
          _quality_delta?: number
          _saving_pct: number
          _task_hint: string
          _to_host: string
          _to_model: string
        }
        Returns: string
      }
      upsert_recommendation: {
        Args: {
          _basis: string
          _from_host: string
          _from_model: string
          _kind: Database["public"]["Enums"]["rec_kind"]
          _min_plan: Database["public"]["Enums"]["plan_tier"]
          _monthly_saving: number
          _note?: string
          _org_id: string
          _quality_delta?: number
          _saving_pct: number
          _task_hint: string
          _to_host: string
          _to_model: string
        }
        Returns: string
      }
    }
    Enums: {
      ai_use_case: "customer_facing" | "internal" | "both" | "other"
      app_role: "owner" | "admin" | "member"
      commission_status: "pending" | "approved" | "paid" | "clawed_back"
      deployment_maturity: "pilot" | "production"
      objective_kind: "cost" | "latency" | "quality_floor"
      partner_application_path: "meeting" | "async"
      partner_application_status:
        | "pending"
        | "reviewed"
        | "approved"
        | "rejected"
      partner_role: "owner" | "member"
      partner_status: "pending" | "active" | "suspended"
      plan_tier: "compare" | "certify" | "rightsize" | "govern"
      rec_kind: "host_arbitrage" | "quality_match" | "rightsize"
      rec_status: "open" | "dismissed" | "activated" | "refused"
      routing_source: "manual" | "autonomous"
      routing_state: "active" | "paused" | "rolled_back"
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
      ai_use_case: ["customer_facing", "internal", "both", "other"],
      app_role: ["owner", "admin", "member"],
      commission_status: ["pending", "approved", "paid", "clawed_back"],
      deployment_maturity: ["pilot", "production"],
      objective_kind: ["cost", "latency", "quality_floor"],
      partner_application_path: ["meeting", "async"],
      partner_application_status: [
        "pending",
        "reviewed",
        "approved",
        "rejected",
      ],
      partner_role: ["owner", "member"],
      partner_status: ["pending", "active", "suspended"],
      plan_tier: ["compare", "certify", "rightsize", "govern"],
      rec_kind: ["host_arbitrage", "quality_match", "rightsize"],
      rec_status: ["open", "dismissed", "activated", "refused"],
      routing_source: ["manual", "autonomous"],
      routing_state: ["active", "paused", "rolled_back"],
      switch_status: ["active", "paused", "rolled_back"],
    },
  },
} as const
