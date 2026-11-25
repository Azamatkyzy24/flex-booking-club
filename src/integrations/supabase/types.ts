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
      announcements: {
        Row: {
          category: string
          created_at: string
          description: string
          details: string
          event_date: string | null
          id: number
          image_url: string | null
          is_demo: boolean
          is_important: boolean
          is_published: boolean
          publication_date: string
          title: string
          workout_id: number | null
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          details: string
          event_date?: string | null
          id?: number
          image_url?: string | null
          is_demo?: boolean
          is_important?: boolean
          is_published?: boolean
          publication_date?: string
          title: string
          workout_id?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          details?: string
          event_date?: string | null
          id?: number
          image_url?: string | null
          is_demo?: boolean
          is_important?: boolean
          is_published?: boolean
          publication_date?: string
          title?: string
          workout_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["workout_id"]
          },
        ]
      }
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
          membership_id: number | null
          refund_locked: boolean
          status: string
          visit_type: string
          workout_id: number
        }
        Insert: {
          booked_at?: string
          booking_id?: never
          deposit_paid: number
          member_id: number
          membership_id?: number | null
          refund_locked?: boolean
          status?: string
          visit_type?: string
          workout_id: number
        }
        Update: {
          booked_at?: string
          booking_id?: never
          deposit_paid?: number
          member_id?: number
          membership_id?: number | null
          refund_locked?: boolean
          status?: string
          visit_type?: string
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
            foreignKeyName: "bookings_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "member_memberships"
            referencedColumns: ["membership_id"]
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
      member_memberships: {
        Row: {
          expires_at: string
          member_id: number
          membership_id: number
          plan_id: number
          plan_name: string
          price_paid: number
          starts_at: string
          visits_limit: number
        }
        Insert: {
          expires_at: string
          member_id: number
          membership_id?: never
          plan_id: number
          plan_name: string
          price_paid: number
          starts_at?: string
          visits_limit: number
        }
        Update: {
          expires_at?: string
          member_id?: number
          membership_id?: never
          plan_id?: number
          plan_name?: string
          price_paid?: number
          starts_at?: string
          visits_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "member_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      member_notifications: {
        Row: {
          created_at: string
          kind: string
          member_id: number
          notification_id: number
          read_at: string | null
          reason: string | null
          refund_amount: number
          trainer_name: string | null
          workout_id: number | null
          workout_start: string
          workout_title: string
        }
        Insert: {
          created_at?: string
          kind: string
          member_id: number
          notification_id?: never
          read_at?: string | null
          reason?: string | null
          refund_amount?: number
          trainer_name?: string | null
          workout_id?: number | null
          workout_start: string
          workout_title: string
        }
        Update: {
          created_at?: string
          kind?: string
          member_id?: number
          notification_id?: never
          read_at?: string | null
          reason?: string | null
          refund_amount?: number
          trainer_name?: string | null
          workout_id?: number | null
          workout_start?: string
          workout_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "member_notifications_workout_id_fkey"
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
      membership_plans: {
        Row: {
          active: boolean
          duration_days: number
          name: string
          plan_id: number
          price: number
          visits_limit: number
        }
        Insert: {
          active?: boolean
          duration_days: number
          name: string
          plan_id?: never
          price: number
          visits_limit: number
        }
        Update: {
          active?: boolean
          duration_days?: number
          name?: string
          plan_id?: never
          price?: number
          visits_limit?: number
        }
        Relationships: []
      }
      reviews: {
        Row: {
          booking_id: number
          comment: string | null
          created_at: string
          rating: number
          review_id: number
        }
        Insert: {
          booking_id: number
          comment?: string | null
          created_at?: string
          rating: number
          review_id?: never
        }
        Update: {
          booking_id?: number
          comment?: string | null
          created_at?: string
          rating?: number
          review_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      trainers: {
        Row: {
          biography: string | null
          certifications: string[] | null
          email: string | null
          experience_years: number | null
          expertise: string[] | null
          full_name: string
          is_demo_profile: boolean
          philosophy: string | null
          photo_url: string | null
          professional_title: string | null
          slug: string | null
          specialty: string | null
          trainer_id: number
          user_id: string | null
        }
        Insert: {
          biography?: string | null
          certifications?: string[] | null
          email?: string | null
          experience_years?: number | null
          expertise?: string[] | null
          full_name: string
          is_demo_profile?: boolean
          philosophy?: string | null
          photo_url?: string | null
          professional_title?: string | null
          slug?: string | null
          specialty?: string | null
          trainer_id?: never
          user_id?: string | null
        }
        Update: {
          biography?: string | null
          certifications?: string[] | null
          email?: string | null
          experience_years?: number | null
          expertise?: string[] | null
          full_name?: string
          is_demo_profile?: boolean
          philosophy?: string | null
          photo_url?: string | null
          professional_title?: string | null
          slug?: string | null
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
          cancel_reason: string | null
          cancelled_at: string | null
          capacity: number
          category: string
          deposit_amount: number
          description: string | null
          duration_minutes: number
          price: number
          start_time: string
          title: string
          trainer_id: number
          workout_id: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          capacity: number
          category: string
          deposit_amount: number
          description?: string | null
          duration_minutes?: number
          price: number
          start_time: string
          title: string
          trainer_id: number
          workout_id?: never
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          capacity?: number
          category?: string
          deposit_amount?: number
          description?: string | null
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
        Args: {
          p_member_id: number
          p_use_membership?: boolean
          p_workout_id: number
        }
        Returns: number
      }
      book_workout: {
        Args: { p_member_id: number; p_workout_id: number }
        Returns: number
      }
      buy_membership: { Args: { p_plan_id: number }; Returns: number }
      upgrade_membership: { Args: { p_plan_id: number }; Returns: number }
      cancel_booking: { Args: { p_booking_id: number }; Returns: undefined }
      current_member_id: { Args: never; Returns: number }
      current_trainer_id: { Args: never; Returns: number }
      dismiss_all_notifications: { Args: never; Returns: undefined }
      dismiss_notification: {
        Args: { p_notification_id: number }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_trainer: { Args: never; Returns: boolean }
      join_waitlist: {
        Args: { p_member_id: number; p_workout_id: number }
        Returns: number
      }
      promote_from_waitlist: { Args: { p_workout_id: number }; Returns: number }
      reschedule_booking: {
        Args: { p_booking_id: number; p_new_workout_id: number }
        Returns: number
      }
      submit_review: {
        Args: { p_booking_id: number; p_comment?: string; p_rating: number }
        Returns: number
      }
      top_up_wallet: {
        Args: { p_amount: number; p_member_id: number }
        Returns: undefined
      }
      trainer_cancel_workout: {
        Args: { p_reason?: string; p_workout_id: number }
        Returns: Json
      }
      trainer_create_workout: {
        Args: {
          p_capacity: number
          p_category: string
          p_deposit: number
          p_description?: string
          p_duration: number
          p_price: number
          p_start: string
          p_title: string
        }
        Returns: number
      }
      trainer_reviews: {
        Args: never
        Returns: {
          comment: string
          created_at: string
          rating: number
          review_id: number
          reviewer: string
          workout_title: string
        }[]
      }
      trainer_roster: {
        Args: { p_workout_id: number }
        Returns: {
          booked_at: string
          booking_id: number
          deposit_paid: number
          member_name: string
          status: string
        }[]
      }
      trainer_update_profile: {
        Args: {
          p_biography: string
          p_certifications: string[]
          p_expertise: string[]
          p_philosophy: string
          p_photo_url: string
          p_professional_title: string
        }
        Returns: undefined
      }
      trainer_workout_stats: {
        Args: never
        Returns: {
          booked: number
          deposits: number
          waitlisted: number
          workout_id: number
        }[]
      }
      workout_booked_counts: {
        Args: never
        Returns: {
          booked: number
          workout_id: number
        }[]
      }
      workout_rating_summary: {
        Args: never
        Returns: {
          avg_rating: number
          review_count: number
          workout_id: number
        }[]
      }
      workout_reviews: {
        Args: { p_workout_id: number }
        Returns: {
          comment: string
          created_at: string
          rating: number
          review_id: number
          reviewer: string
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
