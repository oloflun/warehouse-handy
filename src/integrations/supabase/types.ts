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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      fdt_sync_log: {
        Row: {
          created_at: string | null
          direction: string
          duration_ms: number | null
          error_message: string | null
          fdt_article_id: string | null
          id: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
          sync_type: string
          wms_product_id: string | null
        }
        Insert: {
          created_at?: string | null
          direction: string
          duration_ms?: number | null
          error_message?: string | null
          fdt_article_id?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status: string
          sync_type: string
          wms_product_id?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string
          duration_ms?: number | null
          error_message?: string | null
          fdt_article_id?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          sync_type?: string
          wms_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fdt_sync_log_wms_product_id_fkey"
            columns: ["wms_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      fdt_sync_status: {
        Row: {
          id: string
          is_enabled: boolean | null
          last_error: string | null
          last_successful_sync: string | null
          sync_type: string
          total_errors: number | null
          total_synced: number | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          is_enabled?: boolean | null
          last_error?: string | null
          last_successful_sync?: string | null
          sync_type: string
          total_errors?: number | null
          total_synced?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          is_enabled?: boolean | null
          last_error?: string | null
          last_successful_sync?: string | null
          sync_type?: string
          total_errors?: number | null
          total_synced?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          last_updated: string | null
          location_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          id?: string
          last_updated?: string | null
          location_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          id?: string
          last_updated?: string | null
          location_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      order_lines: {
        Row: {
          created_at: string | null
          fdt_article_id: string | null
          id: string
          is_picked: boolean | null
          order_id: string | null
          picked_at: string | null
          picked_by: string | null
          product_id: string | null
          quantity_ordered: number
          quantity_picked: number | null
        }
        Insert: {
          created_at?: string | null
          fdt_article_id?: string | null
          id?: string
          is_picked?: boolean | null
          order_id?: string | null
          picked_at?: string | null
          picked_by?: string | null
          product_id?: string | null
          quantity_ordered: number
          quantity_picked?: number | null
        }
        Update: {
          created_at?: string | null
          fdt_article_id?: string | null
          id?: string
          is_picked?: boolean | null
          order_id?: string | null
          picked_at?: string | null
          picked_by?: string | null
          product_id?: string | null
          quantity_ordered?: number
          quantity_picked?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          customer_name: string | null
          customer_notes: string | null
          fdt_order_id: string
          id: string
          location_id: string | null
          order_date: string | null
          order_number: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          customer_notes?: string | null
          fdt_order_id: string
          id?: string
          location_id?: string | null
          order_date?: string | null
          order_number?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          customer_notes?: string | null
          fdt_order_id?: string
          id?: string
          location_id?: string | null
          order_date?: string | null
          order_number?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: string | null
          created_at: string | null
          description: string | null
          fdt_last_synced: string | null
          fdt_sellus_article_id: string | null
          fdt_sync_status: string | null
          id: string
          min_stock: number | null
          name: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          fdt_last_synced?: string | null
          fdt_sellus_article_id?: string | null
          fdt_sync_status?: string | null
          id?: string
          min_stock?: number | null
          name: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          fdt_last_synced?: string | null
          fdt_sellus_article_id?: string | null
          fdt_sync_status?: string | null
          id?: string
          min_stock?: number | null
          name?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          created_at: string | null
          id: string
          location_id: string
          notes: string | null
          product_id: string
          quantity: number
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          location_id: string
          notes?: string | null
          product_id: string
          quantity: number
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      order_summary: {
        Row: {
          customer_name: string | null
          customer_notes: string | null
          fdt_order_id: string | null
          id: string | null
          location_name: string | null
          order_date: string | null
          order_number: string | null
          pick_status: string | null
          picked_lines: number | null
          status: string | null
          total_lines: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
