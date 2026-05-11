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
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concrete_orders: {
        Row: {
          bed: Database["public"]["Enums"]["bed_name"] | null
          created_at: string
          id: string
          job_order_id: string | null
          mix_ratio: string | null
          notes: string | null
          qty_requested: number
          requested_at: string
          requested_by: string
          round_count: number
          status: string
          supplied_at: string | null
          supplied_by: string | null
          total_qty_requested: number
        }
        Insert: {
          bed?: Database["public"]["Enums"]["bed_name"] | null
          created_at?: string
          id?: string
          job_order_id?: string | null
          mix_ratio?: string | null
          notes?: string | null
          qty_requested?: number
          requested_at?: string
          requested_by: string
          round_count?: number
          status?: string
          supplied_at?: string | null
          supplied_by?: string | null
          total_qty_requested?: number
        }
        Update: {
          bed?: Database["public"]["Enums"]["bed_name"] | null
          created_at?: string
          id?: string
          job_order_id?: string | null
          mix_ratio?: string | null
          notes?: string | null
          qty_requested?: number
          requested_at?: string
          requested_by?: string
          round_count?: number
          status?: string
          supplied_at?: string | null
          supplied_by?: string | null
          total_qty_requested?: number
        }
        Relationships: [
          {
            foreignKeyName: "concrete_orders_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concrete_orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concrete_orders_supplied_by_fkey"
            columns: ["supplied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concrete_rounds: {
        Row: {
          concrete_order_id: string
          created_at: string | null
          id: string
          qty_per_round: number
          round_number: number
          status: string
          supplied_at: string | null
          supplied_by: string | null
        }
        Insert: {
          concrete_order_id: string
          created_at?: string | null
          id?: string
          qty_per_round?: number
          round_number: number
          status?: string
          supplied_at?: string | null
          supplied_by?: string | null
        }
        Update: {
          concrete_order_id?: string
          created_at?: string | null
          id?: string
          qty_per_round?: number
          round_number?: number
          status?: string
          supplied_at?: string | null
          supplied_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concrete_rounds_concrete_order_id_fkey"
            columns: ["concrete_order_id"]
            isOneToOne: false
            referencedRelation: "concrete_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concrete_rounds_supplied_by_fkey"
            columns: ["supplied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demolding_records: {
        Row: {
          created_at: string
          defect_detail: string | null
          defect_reason: Database["public"]["Enums"]["defect_reason"] | null
          id: string
          job_order_id: string
          photo_url: string | null
          qty_defect: number
          qty_good: number
          worker_id: string
        }
        Insert: {
          created_at?: string
          defect_detail?: string | null
          defect_reason?: Database["public"]["Enums"]["defect_reason"] | null
          id?: string
          job_order_id: string
          photo_url?: string | null
          qty_defect?: number
          qty_good?: number
          worker_id: string
        }
        Update: {
          created_at?: string
          defect_detail?: string | null
          defect_reason?: Database["public"]["Enums"]["defect_reason"] | null
          id?: string
          job_order_id?: string
          photo_url?: string | null
          qty_defect?: number
          qty_good?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demolding_records_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demolding_records_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fg_inventory: {
        Row: {
          id: string
          last_updated_by: string | null
          product_id: string
          qty: number
          updated_at: string
        }
        Insert: {
          id?: string
          last_updated_by?: string | null
          product_id: string
          qty?: number
          updated_at?: string
        }
        Update: {
          id?: string
          last_updated_by?: string | null
          product_id?: string
          qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fg_inventory_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fg_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      fg_receipts: {
        Row: {
          confirmed_at: string
          created_at: string
          id: string
          job_order_id: string
          notes: string | null
          product_id: string
          qty_defect: number
          qty_good: number
          warehouse_id: string
        }
        Insert: {
          confirmed_at?: string
          created_at?: string
          id?: string
          job_order_id: string
          notes?: string | null
          product_id: string
          qty_defect?: number
          qty_good?: number
          warehouse_id: string
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          id?: string
          job_order_id?: string
          notes?: string | null
          product_id?: string
          qty_defect?: number
          qty_good?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fg_receipts_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fg_receipts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fg_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_orders: {
        Row: {
          bed: Database["public"]["Enums"]["bed_name"]
          cast_at: string | null
          concrete_requested_at: string | null
          created_at: string
          demolded_at: string | null
          expected_demold_at: string | null
          id: string
          order_id: string
          photo_cast_url: string | null
          photo_ready_url: string | null
          plan_item_id: string
          qty_cast: number
          qty_target: number
          rebar_prepared_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          worker_id: string | null
        }
        Insert: {
          bed: Database["public"]["Enums"]["bed_name"]
          cast_at?: string | null
          concrete_requested_at?: string | null
          created_at?: string
          demolded_at?: string | null
          expected_demold_at?: string | null
          id?: string
          order_id: string
          photo_cast_url?: string | null
          photo_ready_url?: string | null
          plan_item_id: string
          qty_cast?: number
          qty_target?: number
          rebar_prepared_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          worker_id?: string | null
        }
        Update: {
          bed?: Database["public"]["Enums"]["bed_name"]
          cast_at?: string | null
          concrete_requested_at?: string | null
          created_at?: string
          demolded_at?: string | null
          expected_demold_at?: string | null
          id?: string
          order_id?: string
          photo_cast_url?: string | null
          photo_ready_url?: string | null
          plan_item_id?: string
          qty_cast?: number
          qty_target?: number
          rebar_prepared_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "production_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_materials: {
        Row: {
          created_at: string
          dispensed_at: string | null
          dispensed_by: string | null
          id: string
          notes: string | null
          plan_id: string
          qty_dispensed: number
          qty_required: number
          raw_material_id: string
          status: string
        }
        Insert: {
          created_at?: string
          dispensed_at?: string | null
          dispensed_by?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          qty_dispensed?: number
          qty_required?: number
          raw_material_id: string
          status?: string
        }
        Update: {
          created_at?: string
          dispensed_at?: string | null
          dispensed_by?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          qty_dispensed?: number
          qty_required?: number
          raw_material_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_materials_dispensed_by_fkey"
            columns: ["dispensed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_materials_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "production_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_materials_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          confirmed_by: string | null
          created_at: string
          id: string
          order_number: string
          plan_id: string
          status: string
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          id?: string
          order_number: string
          plan_id: string
          status?: string
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          id?: string
          order_number?: string
          plan_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "production_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      production_plan_items: {
        Row: {
          bed: Database["public"]["Enums"]["bed_name"]
          created_at: string
          id: string
          plan_id: string
          product_id: string
          qty_target: number
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          bed: Database["public"]["Enums"]["bed_name"]
          created_at?: string
          id?: string
          plan_id: string
          product_id: string
          qty_target?: number
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          bed?: Database["public"]["Enums"]["bed_name"]
          created_at?: string
          id?: string
          plan_id?: string
          product_id?: string
          qty_target?: number
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "production_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "production_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_plan_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          plan_date: string
          status: Database["public"]["Enums"]["plan_status"]
          total_concrete: number
          total_qty: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          plan_date: string
          status?: Database["public"]["Enums"]["plan_status"]
          total_concrete?: number
          total_qty?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          plan_date?: string
          status?: Database["public"]["Enums"]["plan_status"]
          total_concrete?: number
          total_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          bom_code: string | null
          category: string
          code: string
          concrete_per_unit: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          length: number | null
          mesh_per_unit: number | null
          name: string
          rebar_per_unit: number | null
          size: string
          unit: string
          wip_code: string | null
          wire_per_unit: number | null
        }
        Insert: {
          bom_code?: string | null
          category: string
          code: string
          concrete_per_unit?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          length?: number | null
          mesh_per_unit?: number | null
          name: string
          rebar_per_unit?: number | null
          size: string
          unit?: string
          wip_code?: string | null
          wire_per_unit?: number | null
        }
        Update: {
          bom_code?: string | null
          category?: string
          code?: string
          concrete_per_unit?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          length?: number | null
          mesh_per_unit?: number | null
          name?: string
          rebar_per_unit?: number | null
          size?: string
          unit?: string
          wip_code?: string | null
          wire_per_unit?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          employee_code: string | null
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          worker_token: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          employee_code?: string | null
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          worker_token?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          employee_code?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          worker_token?: string | null
        }
        Relationships: []
      }
      qc_inspections: {
        Row: {
          created_at: string
          defect_detail: string | null
          defect_reason: Database["public"]["Enums"]["defect_reason"] | null
          demold_inspected_at: string | null
          demold_qty_defect: number
          demold_qty_good: number
          id: string
          job_order_id: string
          photo_url: string | null
          pour_inspected_at: string | null
          pour_notes: string | null
          pour_ok: boolean | null
          qc_id: string
        }
        Insert: {
          created_at?: string
          defect_detail?: string | null
          defect_reason?: Database["public"]["Enums"]["defect_reason"] | null
          demold_inspected_at?: string | null
          demold_qty_defect?: number
          demold_qty_good?: number
          id?: string
          job_order_id: string
          photo_url?: string | null
          pour_inspected_at?: string | null
          pour_notes?: string | null
          pour_ok?: boolean | null
          qc_id: string
        }
        Update: {
          created_at?: string
          defect_detail?: string | null
          defect_reason?: Database["public"]["Enums"]["defect_reason"] | null
          demold_inspected_at?: string | null
          demold_qty_defect?: number
          demold_qty_good?: number
          id?: string
          job_order_id?: string
          photo_url?: string | null
          pour_inspected_at?: string | null
          pour_notes?: string | null
          pour_ok?: boolean | null
          qc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspections_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_qc_id_fkey"
            columns: ["qc_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          category: string
          cost_per_unit: number | null
          id: string
          material_code: string | null
          min_stock: number
          name: string
          qty_on_hand: number
          supplier: string | null
          unit: string
          updated_at: string
          weight_per_meter: number | null
        }
        Insert: {
          category: string
          cost_per_unit?: number | null
          id?: string
          material_code?: string | null
          min_stock?: number
          name: string
          qty_on_hand?: number
          supplier?: string | null
          unit: string
          updated_at?: string
          weight_per_meter?: number | null
        }
        Update: {
          category?: string
          cost_per_unit?: number | null
          id?: string
          material_code?: string | null
          min_stock?: number
          name?: string
          qty_on_hand?: number
          supplier?: string | null
          unit?: string
          updated_at?: string
          weight_per_meter?: number | null
        }
        Relationships: []
      }
      wip_inventory: {
        Row: {
          id: string
          product_id: string
          qty: number
          updated_at: string
          wip_code: string
        }
        Insert: {
          id?: string
          product_id: string
          qty?: number
          updated_at?: string
          wip_code: string
        }
        Update: {
          id?: string
          product_id?: string
          qty?: number
          updated_at?: string
          wip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "wip_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      bed_name: "A" | "B" | "C" | "D" | "E" | "F" | "1" | "2" | "3" | "4"
      defect_reason: "crack" | "chip" | "honeycomb" | "other"
      job_status:
        | "pending"
        | "casting"
        | "curing"
        | "ready_demold"
        | "demolded"
        | "cancelled"
        | "rebar_prep"
        | "concrete_ordered"
      plan_status: "draft" | "confirmed" | "completed"
      user_role:
        | "admin"
        | "planner"
        | "worker"
        | "qc"
        | "warehouse"
        | "material"
        | "concrete"
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
      bed_name: ["A", "B", "C", "D", "E", "F", "1", "2", "3", "4"],
      defect_reason: ["crack", "chip", "honeycomb", "other"],
      job_status: [
        "pending",
        "casting",
        "curing",
        "ready_demold",
        "demolded",
        "cancelled",
        "rebar_prep",
        "concrete_ordered",
      ],
      plan_status: ["draft", "confirmed", "completed"],
      user_role: [
        "admin",
        "planner",
        "worker",
        "qc",
        "warehouse",
        "material",
        "concrete",
      ],
    },
  },
} as const
export type UserRole = Database['public']['Enums']['user_role']
export type Profile = Database['public']['Tables']['profiles']['Row']
