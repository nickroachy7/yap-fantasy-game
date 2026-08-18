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
          id: string
          lineup_starts: number
          pack_opening_id: string | null
          source: Database["public"]["Enums"]["acquisition_source"]
          tier: Database["public"]["Enums"]["card_tier"]
          user_id: string
        }
        Insert: {
          acquired_at?: string
          card_id: string
          career_fp?: number
          id?: string
          lineup_starts?: number
          pack_opening_id?: string | null
          source?: Database["public"]["Enums"]["acquisition_source"]
          tier?: Database["public"]["Enums"]["card_tier"]
          user_id: string
        }
        Update: {
          acquired_at?: string
          card_id?: string
          career_fp?: number
          id?: string
          lineup_starts?: number
          pack_opening_id?: string | null
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
            foreignKeyName: "card_instances_pack_opening_fkey"
            columns: ["pack_opening_id"]
            isOneToOne: false
            referencedRelation: "pack_openings"
            referencedColumns: ["id"]
          },
        ]
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
          card_instance_id: string
          id: string
          lineup_id: string
          points: number
          slot: string
        }
        Insert: {
          card_instance_id: string
          id?: string
          lineup_id: string
          points?: number
          slot: string
        }
        Update: {
          card_instance_id?: string
          id?: string
          lineup_id?: string
          points?: number
          slot?: string
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
          min_career_fp: number
          sort_order: number
          tier: Database["public"]["Enums"]["card_tier"]
        }
        Insert: {
          min_career_fp: number
          sort_order: number
          tier: Database["public"]["Enums"]["card_tier"]
        }
        Update: {
          min_career_fp?: number
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
          id: string | null
          injury_status: string | null
          lineup_starts: number | null
          next_tier_at: number | null
          next_tier_label: Database["public"]["Enums"]["card_tier"] | null
          player_id: string | null
          player_name: string | null
          position_abbreviation: string | null
          season: number | null
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
      player_directory: {
        Row: {
          card_id: string | null
          fp_per_game: number | null
          games_played: number | null
          injury_status: string | null
          player_id: string | null
          player_name: string | null
          position_abbreviation: string | null
          rarity: Database["public"]["Enums"]["rarity"] | null
          season: number | null
          season_fp: number | null
          team_abbreviation: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_injuries: { Args: { payload: Json }; Returns: number }
      award_score_gems: {
        Args: {
          p_per_point?: number
          p_season: number
          p_season_type: number
          p_week: number
        }
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
      score_week: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: Json
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
      week_lock_time: {
        Args: { p_season: number; p_season_type: number; p_week: number }
        Returns: string
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
  graphql_public: {
    Enums: {},
  },
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
      ],
      rarity: ["common", "uncommon", "rare", "epic", "legendary"],
    },
  },
} as const
