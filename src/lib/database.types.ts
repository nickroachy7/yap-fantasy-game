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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      card_instances: {
        Row: {
          acquired_at: string
          card_id: string
          career_fp: number
          committed_at: string | null
          committed_for: number | null
          committed_to: string | null
          id: string
          is_held: boolean | null
          lineup_starts: number
          pack_opening_id: string | null
          settled_fp: number
          sold_at: string | null
          sold_for: number | null
          source: Database["public"]["Enums"]["acquisition_source"]
          tier: Database["public"]["Enums"]["card_tier"]
          user_id: string
          wiped_at: string | null
          wiped_by_run: string | null
        }
        Insert: {
          acquired_at?: string
          card_id: string
          career_fp?: number
          committed_at?: string | null
          committed_for?: number | null
          committed_to?: string | null
          id?: string
          is_held?: boolean | null
          lineup_starts?: number
          pack_opening_id?: string | null
          settled_fp?: number
          sold_at?: string | null
          sold_for?: number | null
          source?: Database["public"]["Enums"]["acquisition_source"]
          tier?: Database["public"]["Enums"]["card_tier"]
          user_id: string
          wiped_at?: string | null
          wiped_by_run?: string | null
        }
        Update: {
          acquired_at?: string
          card_id?: string
          career_fp?: number
          committed_at?: string | null
          committed_for?: number | null
          committed_to?: string | null
          id?: string
          is_held?: boolean | null
          lineup_starts?: number
          pack_opening_id?: string | null
          settled_fp?: number
          sold_at?: string | null
          sold_for?: number | null
          source?: Database["public"]["Enums"]["acquisition_source"]
          tier?: Database["public"]["Enums"]["card_tier"]
          user_id?: string
          wiped_at?: string | null
          wiped_by_run?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_instances_committed_to_fkey"
            columns: ["committed_to"]
            isOneToOne: false
            referencedRelation: "card_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_instances_committed_to_fkey"
            columns: ["committed_to"]
            isOneToOne: false
            referencedRelation: "my_sets"
            referencedColumns: ["set_id"]
          },
          {
            foreignKeyName: "card_instances_pack_opening_fkey"
            columns: ["pack_opening_id"]
            isOneToOne: false
            referencedRelation: "pack_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_instances_wiped_by_run_fkey"
            columns: ["wiped_by_run"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      card_set_ladder_defaults: {
        Row: {
          family: string
          reward_coins: number
          threshold_pct: number
        }
        Insert: {
          family: string
          reward_coins: number
          threshold_pct: number
        }
        Update: {
          family?: string
          reward_coins?: number
          threshold_pct?: number
        }
        Relationships: []
      }
      card_set_members: {
        Row: {
          card_id: string
          set_id: string
        }
        Insert: {
          card_id: string
          set_id: string
        }
        Update: {
          card_id?: string
          set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_set_members_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_set_members_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_set_members_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "card_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_set_members_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "my_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      card_set_milestones: {
        Row: {
          reward_coins: number
          set_id: string
          threshold_pct: number
        }
        Insert: {
          reward_coins: number
          set_id: string
          threshold_pct: number
        }
        Update: {
          reward_coins?: number
          set_id?: string
          threshold_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "card_set_milestones_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "card_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_set_milestones_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "my_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      card_sets: {
        Row: {
          code: string
          commit_payout_pct: number
          created_at: string
          family: string
          id: string
          is_active: boolean
          min_tier: Database["public"]["Enums"]["card_tier"] | null
          name: string
          opens_on: string | null
          required_count: number
          season: number
          sort_order: number
          subtitle: string | null
        }
        Insert: {
          code: string
          commit_payout_pct?: number
          created_at?: string
          family: string
          id?: string
          is_active?: boolean
          min_tier?: Database["public"]["Enums"]["card_tier"] | null
          name: string
          opens_on?: string | null
          required_count: number
          season: number
          sort_order?: number
          subtitle?: string | null
        }
        Update: {
          code?: string
          commit_payout_pct?: number
          created_at?: string
          family?: string
          id?: string
          is_active?: boolean
          min_tier?: Database["public"]["Enums"]["card_tier"] | null
          name?: string
          opens_on?: string | null
          required_count?: number
          season?: number
          sort_order?: number
          subtitle?: string | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          created_at: string
          id: string
          is_mintable: boolean
          player_id: string
          rarity: Database["public"]["Enums"]["rarity"]
          rarity_source: string
          rarity_updated_at: string
          season: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_mintable?: boolean
          player_id: string
          rarity?: Database["public"]["Enums"]["rarity"]
          rarity_source?: string
          rarity_updated_at?: string
          season: number
        }
        Update: {
          created_at?: string
          id?: string
          is_mintable?: boolean
          player_id?: string
          rarity?: Database["public"]["Enums"]["rarity"]
          rarity_source?: string
          rarity_updated_at?: string
          season?: number
        }
        Relationships: [
          {
            foreignKeyName: "cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_balances: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coins_ledger: {
        Row: {
          amount: number
          created_at: string
          id: string
          idempotency_key: string | null
          reason: Database["public"]["Enums"]["coin_reason"]
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          reason: Database["public"]["Enums"]["coin_reason"]
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          reason?: Database["public"]["Enums"]["coin_reason"]
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contest_format_slots: {
        Row: {
          display_order: number
          eligible_positions: string[]
          format_code: string
          slot: string
        }
        Insert: {
          display_order: number
          eligible_positions: string[]
          format_code: string
          slot: string
        }
        Update: {
          display_order?: number
          eligible_positions?: string[]
          format_code?: string
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_format_slots_format_code_fkey"
            columns: ["format_code"]
            isOneToOne: false
            referencedRelation: "contest_formats"
            referencedColumns: ["code"]
          },
        ]
      }
      contest_formats: {
        Row: {
          code: string
          description: string | null
          name: string
          slot_count: number
        }
        Insert: {
          code: string
          description?: string | null
          name: string
          slot_count: number
        }
        Update: {
          code?: string
          description?: string | null
          name?: string
          slot_count?: number
        }
        Relationships: []
      }
      contest_templates: {
        Row: {
          blurb: string | null
          code: string
          entry_fee_coins: number
          format_code: string
          hearts_at_risk: number
          hearts_on_win: number
          is_active: boolean
          max_entrants: number | null
          name: string
          payout_curve: Database["public"]["Enums"]["contest_payout_curve"]
          podium_coins: number
          podium_places: number
          prize_pool_bps: number
          sort_order: number
          target_points: number | null
          win_condition: Database["public"]["Enums"]["contest_win_condition"]
          win_pct: number | null
          win_rank: number | null
        }
        Insert: {
          blurb?: string | null
          code: string
          entry_fee_coins?: number
          format_code: string
          hearts_at_risk?: number
          hearts_on_win?: number
          is_active?: boolean
          max_entrants?: number | null
          name: string
          payout_curve?: Database["public"]["Enums"]["contest_payout_curve"]
          podium_coins?: number
          podium_places?: number
          prize_pool_bps?: number
          sort_order: number
          target_points?: number | null
          win_condition: Database["public"]["Enums"]["contest_win_condition"]
          win_pct?: number | null
          win_rank?: number | null
        }
        Update: {
          blurb?: string | null
          code?: string
          entry_fee_coins?: number
          format_code?: string
          hearts_at_risk?: number
          hearts_on_win?: number
          is_active?: boolean
          max_entrants?: number | null
          name?: string
          payout_curve?: Database["public"]["Enums"]["contest_payout_curve"]
          podium_coins?: number
          podium_places?: number
          prize_pool_bps?: number
          sort_order?: number
          target_points?: number | null
          win_condition?: Database["public"]["Enums"]["contest_win_condition"]
          win_pct?: number | null
          win_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contest_templates_format_code_fkey"
            columns: ["format_code"]
            isOneToOne: false
            referencedRelation: "contest_formats"
            referencedColumns: ["code"]
          },
        ]
      }
      contests: {
        Row: {
          code: string
          created_at: string
          entry_fee_coins: number
          format_code: string
          hearts_at_risk: number
          hearts_on_win: number
          id: string
          kind: Database["public"]["Enums"]["contest_kind"]
          max_entrants: number | null
          name: string
          payout_curve: Database["public"]["Enums"]["contest_payout_curve"]
          podium_coins: number
          podium_places: number
          prize_pool_bps: number
          season: number
          season_type: number
          target_points: number | null
          week: number
          win_condition: Database["public"]["Enums"]["contest_win_condition"]
          win_pct: number | null
          win_rank: number | null
        }
        Insert: {
          code: string
          created_at?: string
          entry_fee_coins?: number
          format_code: string
          hearts_at_risk?: number
          hearts_on_win?: number
          id?: string
          kind: Database["public"]["Enums"]["contest_kind"]
          max_entrants?: number | null
          name: string
          payout_curve?: Database["public"]["Enums"]["contest_payout_curve"]
          podium_coins?: number
          podium_places?: number
          prize_pool_bps?: number
          season: number
          season_type: number
          target_points?: number | null
          week: number
          win_condition?: Database["public"]["Enums"]["contest_win_condition"]
          win_pct?: number | null
          win_rank?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          entry_fee_coins?: number
          format_code?: string
          hearts_at_risk?: number
          hearts_on_win?: number
          id?: string
          kind?: Database["public"]["Enums"]["contest_kind"]
          max_entrants?: number | null
          name?: string
          payout_curve?: Database["public"]["Enums"]["contest_payout_curve"]
          podium_coins?: number
          podium_places?: number
          prize_pool_bps?: number
          season?: number
          season_type?: number
          target_points?: number | null
          week?: number
          win_condition?: Database["public"]["Enums"]["contest_win_condition"]
          win_pct?: number | null
          win_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contests_format_code_fkey"
            columns: ["format_code"]
            isOneToOne: false
            referencedRelation: "contest_formats"
            referencedColumns: ["code"]
          },
        ]
      }
      dfs_salary_snapshots: {
        Row: {
          captured_at: string
          id: string
          player_id: string
          position: string | null
          provider: string
          salary: number
          season: number
          season_type: number
          slate_id: number | null
          week: number | null
        }
        Insert: {
          captured_at?: string
          id?: string
          player_id: string
          position?: string | null
          provider?: string
          salary: number
          season: number
          season_type?: number
          slate_id?: number | null
          week?: number | null
        }
        Update: {
          captured_at?: string
          id?: string
          player_id?: string
          position?: string | null
          provider?: string
          salary?: number
          season?: number
          season_type?: number
          slate_id?: number | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dfs_salary_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "dfs_salary_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_points: {
        Row: {
          computed_at: string
          points: number
          rules_version: number
          stat_line_id: string
        }
        Insert: {
          computed_at?: string
          points?: number
          rules_version: number
          stat_line_id: string
        }
        Update: {
          computed_at?: string
          points?: number
          rules_version?: number
          stat_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_points_rules_version_fkey"
            columns: ["rules_version"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "fantasy_points_stat_line_id_fkey"
            columns: ["stat_line_id"]
            isOneToOne: false
            referencedRelation: "stat_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      game_config: {
        Row: {
          description: string
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          description: string
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      games: {
        Row: {
          external_id: number
          home_score: number | null
          home_team_id: string | null
          id: string
          season: number
          season_type: number
          starts_at: string | null
          status: string | null
          status_state: string | null
          updated_at: string
          visitor_score: number | null
          visitor_team_id: string | null
          week: number | null
        }
        Insert: {
          external_id: number
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          season: number
          season_type?: number
          starts_at?: string | null
          status?: string | null
          status_state?: string | null
          updated_at?: string
          visitor_score?: number | null
          visitor_team_id?: string | null
          week?: number | null
        }
        Update: {
          external_id?: number
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          season?: number
          season_type?: number
          starts_at?: string | null
          status?: string | null
          status_state?: string | null
          updated_at?: string
          visitor_score?: number | null
          visitor_team_id?: string | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "games_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_visitor_team_id_fkey"
            columns: ["visitor_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_slots: {
        Row: {
          bonus_coins: number | null
          card_instance_id: string
          coin_multiplier: number | null
          coins_awarded: number | null
          id: string
          lineup_id: string
          points: number
          position_rank: number | null
          slot: string
          tier_at_award: Database["public"]["Enums"]["card_tier"] | null
          was_week_mvp: boolean | null
        }
        Insert: {
          bonus_coins?: number | null
          card_instance_id: string
          coin_multiplier?: number | null
          coins_awarded?: number | null
          id?: string
          lineup_id: string
          points?: number
          position_rank?: number | null
          slot: string
          tier_at_award?: Database["public"]["Enums"]["card_tier"] | null
          was_week_mvp?: boolean | null
        }
        Update: {
          bonus_coins?: number | null
          card_instance_id?: string
          coin_multiplier?: number | null
          coins_awarded?: number | null
          id?: string
          lineup_id?: string
          points?: number
          position_rank?: number | null
          slot?: string
          tier_at_award?: Database["public"]["Enums"]["card_tier"] | null
          was_week_mvp?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "lineup_slots_card_instance_id_fkey"
            columns: ["card_instance_id"]
            isOneToOne: false
            referencedRelation: "card_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_slots_card_instance_id_fkey"
            columns: ["card_instance_id"]
            isOneToOne: false
            referencedRelation: "card_prices"
            referencedColumns: ["card_instance_id"]
          },
          {
            foreignKeyName: "lineup_slots_card_instance_id_fkey"
            columns: ["card_instance_id"]
            isOneToOne: false
            referencedRelation: "my_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_slots_card_instance_id_fkey"
            columns: ["card_instance_id"]
            isOneToOne: false
            referencedRelation: "my_lost_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_slots_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
        ]
      }
      lineups: {
        Row: {
          contest_id: string
          finalized_at: string | null
          id: string
          run_id: string | null
          scored_at: string | null
          season: number
          season_type: number
          submitted_at: string
          total_points: number
          user_id: string
          week: number
        }
        Insert: {
          contest_id: string
          finalized_at?: string | null
          id?: string
          run_id?: string | null
          scored_at?: string | null
          season: number
          season_type?: number
          submitted_at?: string
          total_points?: number
          user_id: string
          week: number
        }
        Update: {
          contest_id?: string
          finalized_at?: string | null
          id?: string
          run_id?: string | null
          scored_at?: string | null
          season?: number
          season_type?: number
          submitted_at?: string
          total_points?: number
          user_id?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineups_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_openings: {
        Row: {
          coins_spent: number
          id: string
          opened_at: string
          pack_id: string
          user_id: string
        }
        Insert: {
          coins_spent: number
          id?: string
          opened_at?: string
          pack_id: string
          user_id: string
        }
        Update: {
          coins_spent?: number
          id?: string
          opened_at?: string
          pack_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pack_openings_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["id"]
          },
        ]
      }
      packs: {
        Row: {
          card_count: number
          code: string
          coin_cost: number
          created_at: string
          daily_limit: number | null
          guaranteed_positions: Json
          id: string
          is_active: boolean
          name: string
          odds: Json
          once_per_user: boolean
        }
        Insert: {
          card_count: number
          code: string
          coin_cost: number
          created_at?: string
          daily_limit?: number | null
          guaranteed_positions?: Json
          id?: string
          is_active?: boolean
          name: string
          odds: Json
          once_per_user?: boolean
        }
        Update: {
          card_count?: number
          code?: string
          coin_cost?: number
          created_at?: string
          daily_limit?: number | null
          guaranteed_positions?: Json
          id?: string
          is_active?: boolean
          name?: string
          odds?: Json
          once_per_user?: boolean
        }
        Relationships: []
      }
      player_season_stats: {
        Row: {
          games_played: number | null
          player_id: string
          postseason: boolean
          raw: Json
          season: number
          synced_at: string
        }
        Insert: {
          games_played?: number | null
          player_id: string
          postseason?: boolean
          raw?: Json
          season: number
          synced_at?: string
        }
        Update: {
          games_played?: number | null
          player_id?: string
          postseason?: boolean
          raw?: Json
          season?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_values: {
        Row: {
          best_ppg: number | null
          blended_ppg: number | null
          current_games: number
          current_ppg: number | null
          player_id: string
          pos_pool: number | null
          pos_rank: number | null
          position_abbreviation: string | null
          prior_games: number | null
          prior_ppg: number | null
          replacement_ppg: number | null
          season: number
          source: string
          source_season: number | null
          updated_at: string
          value_score: number
        }
        Insert: {
          best_ppg?: number | null
          blended_ppg?: number | null
          current_games?: number
          current_ppg?: number | null
          player_id: string
          pos_pool?: number | null
          pos_rank?: number | null
          position_abbreviation?: string | null
          prior_games?: number | null
          prior_ppg?: number | null
          replacement_ppg?: number | null
          season: number
          source?: string
          source_season?: number | null
          updated_at?: string
          value_score?: number
        }
        Update: {
          best_ppg?: number | null
          blended_ppg?: number | null
          current_games?: number
          current_ppg?: number | null
          player_id?: string
          pos_pool?: number | null
          pos_rank?: number | null
          position_abbreviation?: string | null
          prior_games?: number | null
          prior_ppg?: number | null
          replacement_ppg?: number | null
          season?: number
          source?: string
          source_season?: number | null
          updated_at?: string
          value_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          age: number | null
          college: string | null
          experience: string | null
          external_id: number
          first_name: string
          full_name: string | null
          height: string | null
          id: string
          injury_comment: string | null
          injury_status: string | null
          injury_updated_at: string | null
          is_active: boolean
          jersey_number: string | null
          last_name: string
          position: string | null
          position_abbreviation: string | null
          team_id: string | null
          updated_at: string
          weight: string | null
        }
        Insert: {
          age?: number | null
          college?: string | null
          experience?: string | null
          external_id: number
          first_name: string
          full_name?: string | null
          height?: string | null
          id?: string
          injury_comment?: string | null
          injury_status?: string | null
          injury_updated_at?: string | null
          is_active?: boolean
          jersey_number?: string | null
          last_name: string
          position?: string | null
          position_abbreviation?: string | null
          team_id?: string | null
          updated_at?: string
          weight?: string | null
        }
        Update: {
          age?: number | null
          college?: string | null
          experience?: string | null
          external_id?: number
          first_name?: string
          full_name?: string | null
          height?: string | null
          id?: string
          injury_comment?: string | null
          injury_status?: string | null
          injury_updated_at?: string | null
          is_active?: boolean
          jersey_number?: string | null
          last_name?: string
          position?: string | null
          position_abbreviation?: string | null
          team_id?: string | null
          updated_at?: string
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      position_bonus_tiers: {
        Row: {
          label: string
          max_rank: number
          reward_coins: number
        }
        Insert: {
          label: string
          max_rank: number
          reward_coins: number
        }
        Update: {
          label?: string
          max_rank?: number
          reward_coins?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_key: string
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_key?: string
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_key?: string
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projections: {
        Row: {
          collected_at: string | null
          game_id: string | null
          id: string
          ingested_at: string
          player_id: string
          points_by_format: Json
          projected_points: number | null
          provider_position: string | null
          raw: Json
          season: number
          season_type: number
          week: number
        }
        Insert: {
          collected_at?: string | null
          game_id?: string | null
          id?: string
          ingested_at?: string
          player_id: string
          points_by_format?: Json
          projected_points?: number | null
          provider_position?: string | null
          raw?: Json
          season: number
          season_type?: number
          week: number
        }
        Update: {
          collected_at?: string | null
          game_id?: string | null
          id?: string
          ingested_at?: string
          player_id?: string
          points_by_format?: Json
          projected_points?: number | null
          provider_position?: string | null
          raw?: Json
          season?: number
          season_type?: number
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "projections_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "projections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      run_carry_ladder: {
        Row: {
          card_slots: number
          min_wins: number
        }
        Insert: {
          card_slots: number
          min_wins: number
        }
        Update: {
          card_slots?: number
          min_wins?: number
        }
        Relationships: []
      }
      run_contest_results: {
        Row: {
          contest_id: string
          hearts_delta: number
          lineup_id: string
          result: string
          run_id: string
          settled_at: string
          user_id: string
        }
        Insert: {
          contest_id: string
          hearts_delta: number
          lineup_id: string
          result: string
          run_id: string
          settled_at?: string
          user_id: string
        }
        Update: {
          contest_id?: string
          hearts_delta?: number
          lineup_id?: string
          result?: string
          run_id?: string
          settled_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_contest_results_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_contest_results_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_contest_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          ended_at: string | null
          ended_reason: string | null
          hearts: number
          id: string
          losses: number
          max_hearts: number
          peak_hearts: number
          settled_at: string | null
          started_at: string
          user_id: string
          wins: number
        }
        Insert: {
          ended_at?: string | null
          ended_reason?: string | null
          hearts: number
          id?: string
          losses?: number
          max_hearts: number
          peak_hearts: number
          settled_at?: string | null
          started_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          ended_at?: string | null
          ended_reason?: string | null
          hearts?: number
          id?: string
          losses?: number
          max_hearts?: number
          peak_hearts?: number
          settled_at?: string | null
          started_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      scoring_rules: {
        Row: {
          created_at: string
          is_active: boolean
          name: string
          rules: Json
          version: number
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          name: string
          rules: Json
          version: number
        }
        Update: {
          created_at?: string
          is_active?: boolean
          name?: string
          rules?: Json
          version?: number
        }
        Relationships: []
      }
      set_milestone_claims: {
        Row: {
          committed_at_claim: number
          completed_at: string
          reward_coins: number
          set_id: string
          threshold_pct: number
          user_id: string
        }
        Insert: {
          committed_at_claim: number
          completed_at?: string
          reward_coins: number
          set_id: string
          threshold_pct: number
          user_id: string
        }
        Update: {
          committed_at_claim?: number
          completed_at?: string
          reward_coins?: number
          set_id?: string
          threshold_pct?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "set_completions_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "card_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_completions_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "my_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      stat_lines: {
        Row: {
          game_id: string
          id: string
          ingested_at: string
          player_id: string
          raw: Json
          season: number
          season_type: number
          team_id: string | null
          week: number | null
        }
        Insert: {
          game_id: string
          id?: string
          ingested_at?: string
          player_id: string
          raw?: Json
          season: number
          season_type?: number
          team_id?: string | null
          week?: number | null
        }
        Update: {
          game_id?: string
          id?: string
          ingested_at?: string
          player_id?: string
          raw?: Json
          season?: number
          season_type?: number
          team_id?: string | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stat_lines_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_lines_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "stat_lines_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_lines_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sweep_log: {
        Row: {
          duration_ms: number | null
          id: number
          ingest_body: Json | null
          ingest_error: string | null
          ingest_request_id: number | null
          ingest_status: number | null
          ingest_timed_out: boolean | null
          outcome: string
          ran_at: string
          scored: Json | null
          season: number | null
          season_type: number | null
          week: number | null
        }
        Insert: {
          duration_ms?: number | null
          id?: never
          ingest_body?: Json | null
          ingest_error?: string | null
          ingest_request_id?: number | null
          ingest_status?: number | null
          ingest_timed_out?: boolean | null
          outcome: string
          ran_at?: string
          scored?: Json | null
          season?: number | null
          season_type?: number | null
          week?: number | null
        }
        Update: {
          duration_ms?: number | null
          id?: never
          ingest_body?: Json | null
          ingest_error?: string | null
          ingest_request_id?: number | null
          ingest_status?: number | null
          ingest_timed_out?: boolean | null
          outcome?: string
          ran_at?: string
          scored?: Json | null
          season?: number | null
          season_type?: number | null
          week?: number | null
        }
        Relationships: []
      }
      team_standings: {
        Row: {
          conference_record: string | null
          division_record: string | null
          home_record: string | null
          losses: number | null
          overall_record: string | null
          playoff_seed: number | null
          point_differential: number | null
          points_against: number | null
          points_for: number | null
          road_record: string | null
          season: number
          synced_at: string
          team_id: string
          ties: number | null
          win_streak: number | null
          wins: number | null
        }
        Insert: {
          conference_record?: string | null
          division_record?: string | null
          home_record?: string | null
          losses?: number | null
          overall_record?: string | null
          playoff_seed?: number | null
          point_differential?: number | null
          points_against?: number | null
          points_for?: number | null
          road_record?: string | null
          season: number
          synced_at?: string
          team_id: string
          ties?: number | null
          win_streak?: number | null
          wins?: number | null
        }
        Update: {
          conference_record?: string | null
          division_record?: string | null
          home_record?: string | null
          losses?: number | null
          overall_record?: string | null
          playoff_seed?: number | null
          point_differential?: number | null
          points_against?: number | null
          points_for?: number | null
          road_record?: string | null
          season?: number
          synced_at?: string
          team_id?: string
          ties?: number | null
          win_streak?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          abbreviation: string
          conference: string | null
          division: string | null
          external_id: number
          full_name: string | null
          id: string
          location: string | null
          name: string | null
          updated_at: string
        }
        Insert: {
          abbreviation: string
          conference?: string | null
          division?: string | null
          external_id: number
          full_name?: string | null
          id?: string
          location?: string | null
          name?: string | null
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          conference?: string | null
          division?: string | null
          external_id?: number
          full_name?: string | null
          id?: string
          location?: string | null
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tier_thresholds: {
        Row: {
          coin_multiplier: number
          min_career_fp: number
          sale_multiplier: number
          sell_value: number
          sort_order: number
          tier: Database["public"]["Enums"]["card_tier"]
        }
        Insert: {
          coin_multiplier?: number
          min_career_fp: number
          sale_multiplier?: number
          sell_value?: number
          sort_order: number
          tier: Database["public"]["Enums"]["card_tier"]
        }
        Update: {
          coin_multiplier?: number
          min_career_fp?: number
          sale_multiplier?: number
          sell_value?: number
          sort_order?: number
          tier?: Database["public"]["Enums"]["card_tier"]
        }
        Relationships: []
      }
    }
    Views: {
      card_prices: {
        Row: {
          base_coins: number | null
          card_id: string | null
          card_instance_id: string | null
          fp_coins: number | null
          pos_pool: number | null
          pos_rank: number | null
          sale_multiplier: number | null
          sell_value: number | null
          tier: Database["public"]["Enums"]["card_tier"] | null
          value_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "card_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["card_id"]
          },
        ]
      }
      lineup_slot_config: {
        Row: {
          display_order: number | null
          eligible_positions: string[] | null
          slot: string | null
        }
        Insert: {
          display_order?: number | null
          eligible_positions?: string[] | null
          slot?: string | null
        }
        Update: {
          display_order?: number | null
          eligible_positions?: string[] | null
          slot?: string | null
        }
        Relationships: []
      }
      my_collection: {
        Row: {
          acquired_at: string | null
          card_id: string | null
          career_fp: number | null
          fp_per_game: number | null
          id: string | null
          in_set: boolean | null
          injury_status: string | null
          lineup_starts: number | null
          next_tier_at: number | null
          next_tier_label: Database["public"]["Enums"]["card_tier"] | null
          player_id: string | null
          player_name: string | null
          pos_pool: number | null
          pos_rank: number | null
          position_abbreviation: string | null
          rarity: Database["public"]["Enums"]["rarity"] | null
          season: number | null
          sell_value: number | null
          team_abbreviation: string | null
          tier: Database["public"]["Enums"]["card_tier"] | null
          tier_floor_fp: number | null
          user_id: string | null
          value_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "card_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      my_lost_cards: {
        Row: {
          acquired_at: string | null
          card_id: string | null
          career_fp: number | null
          fp_per_game: number | null
          id: string | null
          in_set: boolean | null
          injury_status: string | null
          lineup_starts: number | null
          next_tier_at: number | null
          next_tier_label: Database["public"]["Enums"]["card_tier"] | null
          player_id: string | null
          player_name: string | null
          pos_pool: number | null
          pos_rank: number | null
          position_abbreviation: string | null
          rarity: Database["public"]["Enums"]["rarity"] | null
          season: number | null
          sell_value: number | null
          team_abbreviation: string | null
          tier: Database["public"]["Enums"]["card_tier"] | null
          tier_floor_fp: number | null
          user_id: string | null
          value_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "card_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      my_sets: {
        Row: {
          claimable_coins: number | null
          claimed_coins: number | null
          code: string | null
          commit_payout_pct: number | null
          committed: number | null
          complete: boolean | null
          family: string | null
          milestones: Json | null
          min_tier: Database["public"]["Enums"]["card_tier"] | null
          name: string | null
          next_at: number | null
          next_reward: number | null
          ready: number | null
          required_count: number | null
          season: number | null
          set_id: string | null
          sort_order: number | null
          subtitle: string | null
          total_cards: number | null
          total_reward: number | null
        }
        Relationships: []
      }
      player_directory: {
        Row: {
          card_id: string | null
          extra_points_made: number | null
          field_goal_attempts: number | null
          field_goals_made: number | null
          fp_per_game: number | null
          games_played: number | null
          injury_status: string | null
          passing_attempts: number | null
          passing_completions: number | null
          passing_interceptions: number | null
          passing_touchdowns: number | null
          passing_yards: number | null
          player_id: string | null
          player_name: string | null
          position_abbreviation: string | null
          rarity: Database["public"]["Enums"]["rarity"] | null
          receiving_targets: number | null
          receiving_touchdowns: number | null
          receiving_yards: number | null
          receptions: number | null
          rushing_attempts: number | null
          rushing_touchdowns: number | null
          rushing_yards: number | null
          season: number | null
          season_fp: number | null
          team_abbreviation: string | null
        }
        Relationships: []
      }
      player_season_ranks: {
        Row: {
          base_fp: number | null
          games_played: number | null
          player_id: string | null
          pos: string | null
          pos_rank: number | null
          rank_pool: number | null
          season: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_directory"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      sweep_health: {
        Row: {
          duration_ms: number | null
          ingest_error: string | null
          ingest_message: string | null
          ingest_status: number | null
          ingest_timed_out: boolean | null
          outcome: string | null
          ran_at: string | null
          response_never_landed: boolean | null
          season: number | null
          season_type: number | null
          slots_scored: number | null
          week: number | null
        }
        Insert: {
          duration_ms?: number | null
          ingest_error?: string | null
          ingest_message?: never
          ingest_status?: number | null
          ingest_timed_out?: boolean | null
          outcome?: string | null
          ran_at?: string | null
          response_never_landed?: never
          season?: number | null
          season_type?: number | null
          slots_scored?: never
          week?: number | null
        }
        Update: {
          duration_ms?: number | null
          ingest_error?: string | null
          ingest_message?: never
          ingest_status?: number | null
          ingest_timed_out?: boolean | null
          outcome?: string | null
          ran_at?: string | null
          response_never_landed?: never
          season?: number | null
          season_type?: number | null
          slots_scored?: never
          week?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_injuries: { Args: { payload: Json }; Returns: number }
      assign_card_rarity: {
        Args: { p_production_season?: number; p_season: number }
        Returns: Json
      }
      award_contest_prizes: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
      }
      award_position_bonuses: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
      }
      award_score_coins: {
        Args: {
          p_per_point?: number
          p_season: number
          p_season_type: number
          p_week: number
        }
        Returns: Json
      }
      award_weekly_podium: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
      }
      backfill_week: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
      }
      board_best_week: {
        Args: { p_limit?: number; p_season: number; p_season_type?: number }
        Returns: {
          display_name: string
          points: number
          rank: number
          user_id: string
          week: number
          weeks_played: number
        }[]
      }
      board_cards: {
        Args: { p_limit?: number; p_position?: string; p_season?: number }
        Returns: {
          card_instance_id: string
          career_fp: number
          display_name: string
          fp_per_start: number
          lineup_starts: number
          player_id: string
          player_name: string
          position_abbreviation: string
          rank: number
          team_abbreviation: string
          tier: Database["public"]["Enums"]["card_tier"]
          user_id: string
        }[]
      }
      board_collection: {
        Args: { p_limit?: number; p_season?: number }
        Returns: {
          career_fp: number
          diamond: number
          display_name: string
          gold_plus: number
          held: number
          in_sets: number
          in_sets_coins: number
          players: number
          rank: number
          user_id: string
          value_coins: number
        }[]
      }
      board_record: {
        Args: { p_limit?: number; p_season: number; p_season_type?: number }
        Returns: {
          display_name: string
          losses: number
          points: number
          rank: number
          ties: number
          user_id: string
          weeks: number
          win_pct: number
          wins: number
        }[]
      }
      board_sets: {
        Args: { p_limit?: number }
        Returns: {
          burned: number
          coins: number
          completed: number
          dailies: number
          display_name: string
          rank: number
          rungs: number
          sets: number
          user_id: string
        }[]
      }
      board_top_tiers: {
        Args: never
        Returns: {
          tier: Database["public"]["Enums"]["card_tier"]
          user_id: string
        }[]
      }
      card_actions: { Args: { p_card_instance_ids: string[] }; Returns: Json }
      card_profile: { Args: { p_card_instance_id: string }; Returns: Json }
      claim_carry: { Args: { p_card_instance_ids?: string[] }; Returns: Json }
      claim_set_reward: { Args: { p_set_code: string }; Returns: Json }
      commit_candidate: {
        Args: {
          p_card_id: string
          p_min_tier?: Database["public"]["Enums"]["card_tier"]
        }
        Returns: string
      }
      commit_card_to_set: {
        Args: { p_card_id: string; p_set_code: string }
        Returns: Json
      }
      commit_cards_to_set: {
        Args: { p_card_ids: string[]; p_set_code: string }
        Returns: Json
      }
      contest_entrants: { Args: { p_contest: string }; Returns: number }
      contest_field: {
        Args: { p_contest: string }
        Returns: {
          avatar_key: string
          display_name: string
          filled: number
          is_me: boolean
          lineup_id: string
          locked: boolean
          points: number
          prize: number
          result: string
          rnk: number
          user_id: string
        }[]
      }
      contest_history: {
        Args: { p_before?: string; p_before_id?: string; p_limit?: number }
        Returns: {
          code: string
          contest_id: string
          entrants: number
          finalized_at: string
          hearts_delta: number
          kind: string
          name: string
          points: number
          prize_coins: number
          result: string
          rnk: number
          season: number
          season_type: string
          week: number
        }[]
      }
      contest_lineup: {
        Args: { p_contest: string; p_user: string }
        Returns: {
          awarded: boolean
          bonus_coins: number
          career_fp: number
          coins: number
          home: boolean
          next_tier_at: number
          next_tier_label: Database["public"]["Enums"]["card_tier"]
          opp_score: number
          opponent: string
          player_id: string
          player_name: string
          points: number
          pos: string
          slot: string
          started: boolean
          starts_at: string
          status_state: string
          status_text: string
          team: string
          team_score: number
          tier: Database["public"]["Enums"]["card_tier"]
          tier_floor_fp: number
        }[]
      }
      contest_lobby: {
        Args: never
        Returns: {
          affordable: boolean
          code: string
          entrants: number
          entry_fee_coins: number
          format_code: string
          format_name: string
          hearts_at_risk: number
          hearts_on_win: number
          id: string
          kind: Database["public"]["Enums"]["contest_kind"]
          max_entrants: number
          my_filled: number
          my_hearts: number
          my_lineup_id: string
          name: string
          payout_curve: Database["public"]["Enums"]["contest_payout_curve"]
          podium_coins: number
          podium_places: number
          prize_pool: number
          prize_pool_bps: number
          recap: boolean
          score_rate: number
          season: number
          season_type: number
          slot_count: number
          target_points: number
          week: number
          win_condition: Database["public"]["Enums"]["contest_win_condition"]
          win_pct: number
          win_rank: number
        }[]
      }
      contest_payouts: {
        Args: { p_contest: string }
        Returns: {
          coins: number
          lineup_id: string
          rnk: number
          user_id: string
        }[]
      }
      contest_podium_payouts: {
        Args: { p_contest: string }
        Returns: {
          coins: number
          lineup_id: string
          rnk: number
          user_id: string
        }[]
      }
      contest_prize_pool: { Args: { p_contest: string }; Returns: number }
      contest_results: {
        Args: { p_contest: string }
        Returns: {
          entrants: number
          lineup_id: string
          points: number
          result: string
          rnk: number
          user_id: string
        }[]
      }
      current_run: {
        Args: never
        Returns: {
          ended_at: string | null
          ended_reason: string | null
          hearts: number
          id: string
          losses: number
          max_hearts: number
          peak_hearts: number
          settled_at: string | null
          started_at: string
          user_id: string
          wins: number
        }
        SetofOptions: {
          from: "*"
          to: "runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_slate: {
        Args: never
        Returns: {
          season: number
          season_type: number
          week: number
        }[]
      }
      daily_pack_status: { Args: never; Returns: Json }
      daily_set_day: { Args: never; Returns: string }
      daily_set_position: { Args: { p_day: string }; Returns: string }
      ensure_all_contests: { Args: never; Returns: number }
      ensure_free_contest: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: string
      }
      ensure_week_contests: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: number
      }
      game_config_value: {
        Args: { p_default?: number; p_key: string }
        Returns: number
      }
      game_has_started: {
        Args: { p_starts_at: string; p_status_state: string }
        Returns: boolean
      }
      gameday_sweep: { Args: never; Returns: Json }
      grant_weekly_coins: {
        Args: {
          p_amount?: number
          p_season: number
          p_season_type: number
          p_week: number
        }
        Returns: Json
      }
      leaderboard: {
        Args: {
          p_limit?: number
          p_season: number
          p_season_type?: number
          p_week?: number
        }
        Returns: {
          display_name: string
          rank: number
          total_points: number
          user_id: string
          weeks_played: number
        }[]
      }
      leave_contest: { Args: { p_contest_code: string }; Returns: Json }
      lineup_slate: {
        Args: never
        Returns: {
          in_play: boolean
          season: number
          season_type: number
          week: number
        }[]
      }
      locked_cards: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: {
          card_instance_id: string
          locked: boolean
          starts_at: string
        }[]
      }
      median_record: {
        Args: { p_season: number; p_season_type?: number }
        Returns: {
          ahead: number
          average: number
          entrants: number
          final: boolean
          high: number
          low: number
          median: number
          my_points: number
          my_rank: number
          result: string
          week: number
        }[]
      }
      my_contest_cards: {
        Args: { p_include?: string }
        Returns: {
          ahead: number
          average: number
          code: string
          contest_id: string
          cut: number
          entrants: number
          entry_fee_coins: number
          filled: number
          final: boolean
          format_code: string
          format_name: string
          hearts_at_risk: number
          hearts_on_win: number
          high: number
          kind: Database["public"]["Enums"]["contest_kind"]
          lineup_id: string
          low: number
          median: number
          my_coins: number
          my_podium: number
          my_points: number
          my_prize: number
          my_rank: number
          name: string
          payout_curve: Database["public"]["Enums"]["contest_payout_curve"]
          podium_coins: number
          podium_places: number
          prize_pool: number
          recap: boolean
          result: string
          score_rate: number
          season: number
          season_type: number
          slot_count: number
          target_points: number
          week: number
          win_condition: Database["public"]["Enums"]["contest_win_condition"]
          win_pct: number
          win_rank: number
        }[]
      }
      my_run: { Args: never; Returns: Json }
      open_pack: {
        Args: { p_pack_code: string }
        Returns: {
          card_instance_id: string
          player_name: string
          position_abbreviation: string
          rarity: Database["public"]["Enums"]["rarity"]
          team_abbreviation: string
        }[]
      }
      player_card_market: {
        Args: never
        Returns: {
          best_fp: number
          bronze: number
          copies: number
          diamond: number
          gold: number
          player_id: string
          silver: number
        }[]
      }
      player_game_log: { Args: { p_player_id: string }; Returns: Json }
      player_market: { Args: { p_player_id: string }; Returns: Json }
      player_profile: { Args: { p_player_id: string }; Returns: Json }
      rebuild_card_sets: { Args: { p_season: number }; Returns: Json }
      rebuild_daily_set: {
        Args: { p_day: string; p_season: number }
        Returns: Json
      }
      rebuild_weekly_set: {
        Args: { p_day: string; p_season: number }
        Returns: Json
      }
      recap_slate: {
        Args: never
        Returns: {
          season: number
          season_type: number
          week: number
        }[]
      }
      refresh_player_season_ranks: { Args: never; Returns: undefined }
      refresh_player_values: {
        Args: { p_production_season?: number; p_season?: number }
        Returns: Json
      }
      roster_status: { Args: never; Returns: Json }
      rotate_daily_set: { Args: never; Returns: Json }
      rotate_weekly_set: { Args: never; Returns: Json }
      run_carry_slots: { Args: { p_wins: number }; Returns: number }
      sale_value: {
        Args: {
          p_settled_fp: number
          p_tier: Database["public"]["Enums"]["card_tier"]
          p_value_score: number
        }
        Returns: number
      }
      score_rate: { Args: never; Returns: number }
      score_week: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
      }
      season_base_points: {
        Args: { p_raw: Json; p_rules_version?: number }
        Returns: number
      }
      sell_card: { Args: { p_card_instance_id: string }; Returns: Json }
      sell_cards: { Args: { p_card_instance_ids: string[] }; Returns: Json }
      set_checklist: {
        Args: { p_set_code: string }
        Returns: {
          card_id: string
          commit_tier: Database["public"]["Enums"]["card_tier"]
          commit_value: number
          committed: boolean
          held: number
          player_id: string
          player_name: string
          position_abbreviation: string
          rarity: Database["public"]["Enums"]["rarity"]
          season_fp: number
          team_abbreviation: string
        }[]
      }
      set_lineup: {
        Args: {
          p_contest_code?: string
          p_season: number
          p_season_type: number
          p_slots: Json
          p_week: number
        }
        Returns: string
      }
      settle_run_week: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
      }
      settle_week_payouts: { Args: { p_season?: number }; Returns: Json }
      slate_in_play: {
        Args: never
        Returns: {
          season: number
          season_type: number
          week: number
        }[]
      }
      slate_is_live: { Args: never; Returns: boolean }
      upcoming_slate: {
        Args: never
        Returns: {
          season: number
          season_type: number
          week: number
        }[]
      }
      verify_sync_secret: { Args: { candidate: string }; Returns: boolean }
      wagered_entries: {
        Args: { p_user: string }
        Returns: {
          contest_id: string
          hearts_at_risk: number
          lineup_id: string
        }[]
      }
      week_has_started: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: boolean
      }
      week_is_complete: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: boolean
      }
      week_lock_time: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: string
      }
      week_recap: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
      }
      weekly_set_monday: { Args: { p_day: string }; Returns: string }
      wipe_run: { Args: { p_run: string }; Returns: Json }
    }
    Enums: {
      acquisition_source: "pack" | "grant" | "admin"
      card_tier: "bronze" | "silver" | "gold" | "diamond"
      coin_reason:
        | "signup_bonus"
        | "weekly_grant"
        | "weekly_score_reward"
        | "pack_purchase"
        | "admin_adjust"
        | "card_sale"
        | "set_reward"
        | "set_commit"
        | "position_bonus"
        | "mvp_bonus"
        | "contest_entry"
        | "contest_refund"
        | "run_wipe"
        | "contest_prize"
        | "weekly_podium"
      contest_kind: "free" | "lobby"
      contest_payout_curve: "flat" | "linear" | "steep" | "winner_take_all"
      contest_win_condition: "median" | "top_n" | "top_pct" | "target"
      rarity: "common" | "uncommon" | "rare" | "epic" | "legendary"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      acquisition_source: ["pack", "grant", "admin"],
      card_tier: ["bronze", "silver", "gold", "diamond"],
      coin_reason: [
        "signup_bonus",
        "weekly_grant",
        "weekly_score_reward",
        "pack_purchase",
        "admin_adjust",
        "card_sale",
        "set_reward",
        "set_commit",
        "position_bonus",
        "mvp_bonus",
        "contest_entry",
        "contest_refund",
        "run_wipe",
        "contest_prize",
        "weekly_podium",
      ],
      contest_kind: ["free", "lobby"],
      contest_payout_curve: ["flat", "linear", "steep", "winner_take_all"],
      contest_win_condition: ["median", "top_n", "top_pct", "target"],
      rarity: ["common", "uncommon", "rare", "epic", "legendary"],
    },
  },
} as const
