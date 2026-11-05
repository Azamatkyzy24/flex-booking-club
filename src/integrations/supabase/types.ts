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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          log_id: number
          member_id: number | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          log_id?: never
          member_id?: number | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          log_id?: never
          member_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["member_id"]
          },
        ]
      }
      bookings: {
        Row: {
          booked_at: string
          booking_id: number
          deposit_paid: number
          member_id: number
          status: string
          workout_id: number
        }
        Insert: {
          booked_at?: string
          booking_id?: never
          deposit_paid: number
          member_id: number
          status?: string
          workout_id: number
        }
        Update: {
          booked_at?: string
          booking_id?: never
          deposit_paid?: number
          member_id?: number
          status?: string
          workout_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "bookings_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["workout_id"]
          },
        ]
      }
      members: {
        Row: {
          email: string
          full_name: string
          member_id: number
          membership_type: string | null
          user_id: string | null
          wallet_balance: number
        }
        Insert: {
          email: string
          full_name: string
          member_id?: never
          membership_type?: string | null
          user_id?: string | null
          wallet_balance?: number
        }
        Update: {
          email?: string
          full_name?: string
          member_id?: never
          membership_type?: string | null
          user_id?: string | null
          wallet_balance?: number
        }
        Relationships: []
      }
      trainers: {
        Row: {
          email: string | null
          full_name: string
          specialty: string | null
          trainer_id: number
          user_id: string | null
        }
        Insert: {
          email?: string | null
          full_name: string
          specialty?: string | null
          trainer_id?: never
          user_id?: string | null
        }
        Update: {
          email?: string | null
          full_name?: string
          specialty?: string | null
          trainer_id?: never
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: never
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: never
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          member_id: number
          waitlist_id: number
          workout_id: number
        }
        Insert: {
          created_at?: string
          member_id: number
          waitlist_id?: never
          workout_id: number
        }
        Update: {
          created_at?: string
          member_id?: number
          waitlist_id?: never
          workout_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "waitlist_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["workout_id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          booking_id: number | null
          created_at: string
          member_id: number
          transaction_id: number
          type: string
        }
        Insert: {
          amount: number
          booking_id?: number | null
          created_at?: string
          member_id: number
          transaction_id?: never
          type: string
        }
        Update: {
          amount?: number
          booking_id?: number | null
          created_at?: string
          member_id?: number
          transaction_id?: never
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "wallet_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["member_id"]
          },
        ]
      }
      workouts: {
        Row: {
          capacity: number
          category: string
          deposit_amount: number
          duration_minutes: number
          price: number
          start_time: string
          title: string
          trainer_id: number
          workout_id: number
        }
        Insert: {
          capacity: number
          category: string
          deposit_amount: number
          duration_minutes?: number
          price: number
          start_time: string
          title: string
          trainer_id: number
          workout_id?: never
        }
        Update: {
          capacity?: number
          category?: string
          deposit_amount?: number
          duration_minutes?: number
          price?: number
          start_time?: string
          title?: string
          trainer_id?: number
          workout_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "workouts_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["trainer_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_session: {
        Args: { p_member_id: number; p_workout_id: number }
        Returns: number
      }
      book_workout: {
        Args: { p_member_id: number; p_workout_id: number }
        Returns: number
      }
      cancel_booking: { Args: { p_booking_id: number }; Returns: undefined }
      current_member_id: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      join_waitlist: {
        Args: { p_member_id: number; p_workout_id: number }
        Returns: number
      }
      top_up_wallet: {
        Args: { p_amount: number; p_member_id: number }
        Returns: undefined
      }
      workout_booked_counts: {
        Args: never
        Returns: {
          booked: number
          workout_id: number
        }[]
      }
    }
    Enums: {
      app_role: "member" | "trainer" | "admin"
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
  public: {
    Enums: {
      app_role: ["member", "trainer", "admin"],
    },
  },
} as const
