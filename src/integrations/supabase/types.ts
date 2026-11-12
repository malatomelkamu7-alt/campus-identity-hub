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
      exam_attempts: {
        Row: {
          answers: Json
          bank_id: string
          bonus_questions: string[]
          current_question: number
          deadline_at: string | null
          id: string
          last_seen_at: string | null
          pause_reason: string | null
          paused_at: string | null
          results_reset_at: string | null
          round: number
          score: number | null
          started_at: string
          status: string
          student_code: string
          submitted_at: string | null
          total: number | null
          violations: number
        }
        Insert: {
          answers?: Json
          bank_id: string
          bonus_questions?: string[]
          current_question?: number
          deadline_at?: string | null
          id?: string
          last_seen_at?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          results_reset_at?: string | null
          round: number
          score?: number | null
          started_at?: string
          status?: string
          student_code: string
          submitted_at?: string | null
          total?: number | null
          violations?: number
        }
        Update: {
          answers?: Json
          bank_id?: string
          bonus_questions?: string[]
          current_question?: number
          deadline_at?: string | null
          id?: string
          last_seen_at?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          results_reset_at?: string | null
          round?: number
          score?: number | null
          started_at?: string
          status?: string
          student_code?: string
          submitted_at?: string | null
          total?: number | null
          violations?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_student_code_fkey"
            columns: ["student_code"]
            isOneToOne: false
            referencedRelation: "registered_students"
            referencedColumns: ["student_code"]
          },
        ]
      }
      exam_events: {
        Row: {
          bank_id: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          kind: string
          message: string
          question_id: string | null
          round: number | null
          student_code: string
          teacher_dismissed_at: string | null
          teacher_id: string | null
        }
        Insert: {
          bank_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind: string
          message: string
          question_id?: string | null
          round?: number | null
          student_code: string
          teacher_dismissed_at?: string | null
          teacher_id?: string | null
        }
        Update: {
          bank_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind?: string
          message?: string
          question_id?: string | null
          round?: number | null
          student_code?: string
          teacher_dismissed_at?: string | null
          teacher_id?: string | null
        }
        Relationships: []
      }
      exam_rounds: {
        Row: {
          archived_at: string | null
          round: number
        }
        Insert: {
          archived_at?: string | null
          round: number
        }
        Update: {
          archived_at?: string | null
          round?: number
        }
        Relationships: []
      }
      exam_settings: {
        Row: {
          active_bank_id: string | null
          auto_close: boolean
          auto_completed: boolean
          auto_schedule: boolean
          current_round: number
          duration_sec: number
          ends_at: string | null
          exam_live: boolean
          extension_sec: number
          hidden_staff_roles: string[]
          id: number
          registration_open: boolean
          results_published: boolean
          sat_enabled: boolean
          scheduled_close: string | null
          scheduled_start: string | null
          selected_student_codes: string[] | null
          social_bank_id: string | null
          updated_at: string
        }
        Insert: {
          active_bank_id?: string | null
          auto_close?: boolean
          auto_completed?: boolean
          auto_schedule?: boolean
          current_round?: number
          duration_sec?: number
          ends_at?: string | null
          exam_live?: boolean
          extension_sec?: number
          hidden_staff_roles?: string[]
          id?: number
          registration_open?: boolean
          results_published?: boolean
          sat_enabled?: boolean
          scheduled_close?: string | null
          scheduled_start?: string | null
          selected_student_codes?: string[] | null
          social_bank_id?: string | null
          updated_at?: string
        }
        Update: {
          active_bank_id?: string | null
          auto_close?: boolean
          auto_completed?: boolean
          auto_schedule?: boolean
          current_round?: number
          duration_sec?: number
          ends_at?: string | null
          exam_live?: boolean
          extension_sec?: number
          hidden_staff_roles?: string[]
          id?: number
          registration_open?: boolean
          results_published?: boolean
          sat_enabled?: boolean
          scheduled_close?: string | null
          scheduled_start?: string | null
          selected_student_codes?: string[] | null
          social_bank_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_settings_social_bank_id_fkey"
            columns: ["social_bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      question_banks: {
        Row: {
          created_at: string
          id: string
          questions: Json
          status: string
          subject: string
          target_stream: string | null
          teacher_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          questions?: Json
          status?: string
          subject: string
          target_stream?: string | null
          teacher_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          questions?: Json
          status?: string
          subject?: string
          target_stream?: string | null
          teacher_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_banks_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "school_roster"
            referencedColumns: ["id"]
          },
        ]
      }
      registered_students: {
        Row: {
          created_at: string
          face_verified: boolean
          full_name: string
          gender: string
          grade: string
          id: string
          photo_path: string
          results_pin_hash: string | null
          roster_id: string | null
          section: string
          session_seen_at: string | null
          session_token: string | null
          stream: string
          student_code: string
        }
        Insert: {
          created_at?: string
          face_verified?: boolean
          full_name: string
          gender: string
          grade?: string
          id?: string
          photo_path: string
          results_pin_hash?: string | null
          roster_id?: string | null
          section: string
          session_seen_at?: string | null
          session_token?: string | null
          stream: string
          student_code: string
        }
        Update: {
          created_at?: string
          face_verified?: boolean
          full_name?: string
          gender?: string
          grade?: string
          id?: string
          photo_path?: string
          results_pin_hash?: string | null
          roster_id?: string | null
          section?: string
          session_seen_at?: string | null
          session_token?: string | null
          stream?: string
          student_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "registered_students_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "school_roster"
            referencedColumns: ["id"]
          },
        ]
      }
      round_results: {
        Row: {
          round: number
          score_pct: number
          student_code: string
          subject: string
          updated_at: string
        }
        Insert: {
          round: number
          score_pct: number
          student_code: string
          subject: string
          updated_at?: string
        }
        Update: {
          round?: number
          score_pct?: number
          student_code?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_roster: {
        Row: {
          batch: string
          full_name: string
          gender: string
          grade: string
          id: string
          kind: string
          section: string
          stream: string
          subjects: string[]
        }
        Insert: {
          batch?: string
          full_name: string
          gender?: string
          grade?: string
          id: string
          kind: string
          section?: string
          stream: string
          subjects?: string[]
        }
        Update: {
          batch?: string
          full_name?: string
          gender?: string
          grade?: string
          id?: string
          kind?: string
          section?: string
          stream?: string
          subjects?: string[]
        }
        Relationships: []
      }
      staff_credentials: {
        Row: {
          passcode: string
          role: string
          updated_at: string
        }
        Insert: {
          passcode: string
          role: string
          updated_at?: string
        }
        Update: {
          passcode?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_broadcasts: {
        Row: {
          audience: string
          created_at: string
          failed: number
          id: string
          kind: string
          message: string
          sent: number
        }
        Insert: {
          audience: string
          created_at?: string
          failed?: number
          id?: string
          kind?: string
          message: string
          sent?: number
        }
        Update: {
          audience?: string
          created_at?: string
          failed?: number
          id?: string
          kind?: string
          message?: string
          sent?: number
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: number
          created_at: string
          direction: string
          handled_at: string | null
          id: string
          kind: string
          text: string | null
          update_id: number | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          direction: string
          handled_at?: string | null
          id?: string
          kind?: string
          text?: string | null
          update_id?: number | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          direction?: string
          handled_at?: string | null
          id?: string
          kind?: string
          text?: string | null
          update_id?: number | null
        }
        Relationships: []
      }
      telegram_settings: {
        Row: {
          bot_enabled: boolean
          help_message: string
          id: number
          last_exam_live: boolean | null
          last_registration_open: boolean | null
          last_results_published: boolean | null
          notify_exam_live: boolean
          notify_registration: boolean
          notify_results: boolean
          portal_url: string
          results_enabled: boolean
          updated_at: string
          welcome_message: string
        }
        Insert: {
          bot_enabled?: boolean
          help_message?: string
          id?: number
          last_exam_live?: boolean | null
          last_registration_open?: boolean | null
          last_results_published?: boolean | null
          notify_exam_live?: boolean
          notify_registration?: boolean
          notify_results?: boolean
          portal_url?: string
          results_enabled?: boolean
          updated_at?: string
          welcome_message?: string
        }
        Update: {
          bot_enabled?: boolean
          help_message?: string
          id?: number
          last_exam_live?: boolean | null
          last_registration_open?: boolean | null
          last_results_published?: boolean | null
          notify_exam_live?: boolean
          notify_registration?: boolean
          notify_results?: boolean
          portal_url?: string
          results_enabled?: boolean
          updated_at?: string
          welcome_message?: string
        }
        Relationships: []
      }
      telegram_users: {
        Row: {
          blocked: boolean
          chat_id: number
          entered_name: string | null
          first_name: string | null
          id_confirmed: boolean
          language_code: string | null
          last_name: string | null
          last_seen_at: string
          linked_at: string | null
          pin_failures: number
          pin_locked_until: string | null
          started_at: string
          state: string
          state_data: Json
          student_code: string | null
          telegram_user_id: number | null
          username: string | null
        }
        Insert: {
          blocked?: boolean
          chat_id: number
          entered_name?: string | null
          first_name?: string | null
          id_confirmed?: boolean
          language_code?: string | null
          last_name?: string | null
          last_seen_at?: string
          linked_at?: string | null
          pin_failures?: number
          pin_locked_until?: string | null
          started_at?: string
          state?: string
          state_data?: Json
          student_code?: string | null
          telegram_user_id?: number | null
          username?: string | null
        }
        Update: {
          blocked?: boolean
          chat_id?: number
          entered_name?: string | null
          first_name?: string | null
          id_confirmed?: boolean
          language_code?: string | null
          last_name?: string | null
          last_seen_at?: string
          linked_at?: string | null
          pin_failures?: number
          pin_locked_until?: string | null
          started_at?: string
          state?: string
          state_data?: Json
          student_code?: string | null
          telegram_user_id?: number | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_edit_identity_name: {
        Args: { new_name: string; person_id: string; person_target: string }
        Returns: undefined
      }
      apply_exam_schedule: { Args: never; Returns: undefined }
      award_question_marks: {
        Args: {
          p_bank: string
          p_codes: string[]
          p_question: string
          p_round: number
        }
        Returns: number
      }
      director_attempt_time: {
        Args: { p_action: string; p_attempt: string; p_minutes: number }
        Returns: undefined
      }
      exam_everyone_finished: {
        Args: { s: Database["public"]["Tables"]["exam_settings"]["Row"] }
        Returns: boolean
      }
      extend_exam_minutes: { Args: { p_minutes: number }; Returns: undefined }
      pause_disconnected_attempts: {
        Args: { p_grace_sec: number }
        Returns: number
      }
      reset_visible_results: {
        Args: { p_round: number; p_stream: string }
        Returns: number
      }
      save_exam_submission: {
        Args: {
          p_answers: Json
          p_attempt: string
          p_status: string
          p_violations: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
