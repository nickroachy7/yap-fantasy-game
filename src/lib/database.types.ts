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
        ]
      }
      card_set_ladder_defaults: {
        Row: {
          family: string
          reward_gems: number
          threshold_pct: number
        }
        Insert: {
          family: string
          reward_gems: number
          threshold_pct: number
        }
        Update: {
          family?: string
          reward_gems?: number
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
          reward_gems: number
          set_id: string
          threshold_pct: number
        }
        Insert: {
          reward_gems: number
          set_id: string
          threshold_pct: number
        }
        Update: {
          reward_gems?: number
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
      gem_balances: {
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
      gems_ledger: {
        Row: {
          amount: number
          created_at: string
          id: string
          idempotency_key: string | null
          reason: Database["public"]["Enums"]["gem_reason"]
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          reason: Database["public"]["Enums"]["gem_reason"]
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          reason?: Database["public"]["Enums"]["gem_reason"]
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lineup_slot_config: {
        Row: {
          display_order: number
          eligible_positions: string[]
          slot: string
        }
        Insert: {
          display_order: number
          eligible_positions: string[]
          slot: string
        }
        Update: {
          display_order?: number
          eligible_positions?: string[]
          slot?: string
        }
        Relationships: []
      }
      lineup_slots: {
        Row: {
          bonus_gems: number | null
          card_instance_id: string
          gem_multiplier: number | null
          gems_awarded: number | null
          id: string
          lineup_id: string
          points: number
          position_rank: number | null
          slot: string
          tier_at_award: Database["public"]["Enums"]["card_tier"] | null
          was_week_mvp: boolean | null
        }
        Insert: {
          bonus_gems?: number | null
          card_instance_id: string
          gem_multiplier?: number | null
          gems_awarded?: number | null
          id?: string
          lineup_id: string
          points?: number
          position_rank?: number | null
          slot: string
          tier_at_award?: Database["public"]["Enums"]["card_tier"] | null
          was_week_mvp?: boolean | null
        }
        Update: {
          bonus_gems?: number | null
          card_instance_id?: string
          gem_multiplier?: number | null
          gems_awarded?: number | null
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
            referencedRelation: "my_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_slots_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_slots_slot_fkey"
            columns: ["slot"]
            isOneToOne: false
            referencedRelation: "lineup_slot_config"
            referencedColumns: ["slot"]
          },
        ]
      }
      lineups: {
        Row: {
          finalized_at: string | null
          id: string
          scored_at: string | null
          season: number
          season_type: number
          submitted_at: string
          total_points: number
          user_id: string
          week: number
        }
        Insert: {
          finalized_at?: string | null
          id?: string
          scored_at?: string | null
          season: number
          season_type?: number
          submitted_at?: string
          total_points?: number
          user_id: string
          week: number
        }
        Update: {
          finalized_at?: string | null
          id?: string
          scored_at?: string | null
          season?: number
          season_type?: number
          submitted_at?: string
          total_points?: number
          user_id?: string
          week?: number
        }
        Relationships: []
      }
      pack_openings: {
        Row: {
          gems_spent: number
          id: string
          opened_at: string
          pack_id: string
          user_id: string
        }
        Insert: {
          gems_spent: number
          id?: string
          opened_at?: string
          pack_id: string
          user_id: string
        }
        Update: {
          gems_spent?: number
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
          created_at: string
          daily_limit: number | null
          gem_cost: number
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
          created_at?: string
          daily_limit?: number | null
          gem_cost: number
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
          created_at?: string
          daily_limit?: number | null
          gem_cost?: number
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
          reward_gems: number
        }
        Insert: {
          label: string
          max_rank: number
          reward_gems: number
        }
        Update: {
          label?: string
          max_rank?: number
          reward_gems?: number
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
          reward_gems: number
          set_id: string
          threshold_pct: number
          user_id: string
        }
        Insert: {
          committed_at_claim: number
          completed_at?: string
          reward_gems: number
          set_id: string
          threshold_pct: number
          user_id: string
        }
        Update: {
          committed_at_claim?: number
          completed_at?: string
          reward_gems?: number
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
          gem_multiplier: number
          min_career_fp: number
          sell_value: number
          sort_order: number
          tier: Database["public"]["Enums"]["card_tier"]
        }
        Insert: {
          gem_multiplier?: number
          min_career_fp: number
          sell_value?: number
          sort_order: number
          tier: Database["public"]["Enums"]["card_tier"]
        }
        Update: {
          gem_multiplier?: number
          min_career_fp?: number
          sell_value?: number
          sort_order?: number
          tier?: Database["public"]["Enums"]["card_tier"]
        }
        Relationships: []
      }
    }
    Views: {
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
          position_abbreviation: string | null
          season: number | null
          sell_value: number | null
          team_abbreviation: string | null
          tier: Database["public"]["Enums"]["card_tier"] | null
          tier_floor_fp: number | null
          user_id: string | null
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
          claimable_gems: number | null
          claimed_gems: number | null
          code: string | null
          commit_payout_pct: number | null
          committed: number | null
          complete: boolean | null
          family: string | null
          milestones: Json | null
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
      award_position_bonuses: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
      }
      award_score_gems: {
        Args: {
          p_per_point?: number
          p_season: number
          p_season_type: number
          p_week: number
        }
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
          in_sets_gems: number
          players: number
          rank: number
          user_id: string
          value_gems: number
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
          completed: number
          dailies: number
          display_name: string
          gems: number
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
      claim_set_reward: { Args: { p_set_code: string }; Returns: Json }
      commit_candidate: { Args: { p_card_id: string }; Returns: string }
      commit_card_to_set: {
        Args: { p_card_id: string; p_set_code: string }
        Returns: Json
      }
      commit_cards_to_set: {
        Args: { p_card_ids: string[]; p_set_code: string }
        Returns: Json
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
      daily_set_position: { Args: { p_day: string }; Returns: string }
      game_config_value: {
        Args: { p_default?: number; p_key: string }
        Returns: number
      }
      game_has_started: {
        Args: { p_starts_at: string; p_status_state: string }
        Returns: boolean
      }
      gameday_sweep: { Args: never; Returns: Json }
      grant_weekly_gems: {
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
      refresh_player_season_ranks: { Args: never; Returns: undefined }
      roster_status: { Args: never; Returns: Json }
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
          p_season: number
          p_season_type: number
          p_slots: Json
          p_week: number
        }
        Returns: string
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
    }
    Enums: {
      acquisition_source: "pack" | "grant" | "admin"
      card_tier: "bronze" | "silver" | "gold" | "diamond"
      gem_reason:
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
      acquisition_source: ["pack", "grant", "admin"],
      card_tier: ["bronze", "silver", "gold", "diamond"],
      gem_reason: [
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
      ],
      rarity: ["common", "uncommon", "rare", "epic", "legendary"],
    },
  },
} as const
