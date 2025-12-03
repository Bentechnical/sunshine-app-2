export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
      appointment_availability: {
        Row: {
          created_at: string | null
          end_time: string
          id: number
          start_time: string
          updated_at: string | null
          volunteer_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: number
          start_time: string
          updated_at?: string | null
          volunteer_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: number
          start_time?: string
          updated_at?: string | null
          volunteer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_availability_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_time: string
          created_at: string | null
          id: number
          individual_id: string | null
          status: string | null
          updated_at: string | null
          volunteer_id: string | null
        }
        Insert: {
          appointment_time: string
          created_at?: string | null
          id?: number
          individual_id?: string | null
          status?: string | null
          updated_at?: string | null
          volunteer_id?: string | null
        }
        Update: {
          appointment_time?: string
          created_at?: string | null
          id?: number
          individual_id?: string | null
          status?: string | null
          updated_at?: string | null
          volunteer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          bio: string | null
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          profile_image: string | null
          role: string
          updated_at: string | null
          phone_number: string | null
          postal_code: string | null
          location_lat: number | null
          location_lng: number | null
          travel_distance_km: number | null
          status: string | null
          city: string | null
          profile_complete: boolean | null
          archived_at: string | null
          // New individual user fields
          pronouns: string | null
          birthday: number | null
          physical_address: string | null
          other_pets_on_site: boolean | null
          other_pets_description: string | null
          third_party_available: string | null
          additional_information: string | null
          liability_waiver_accepted: boolean | null
          liability_waiver_accepted_at: string | null
          // Visit recipient fields
          visit_recipient_type: string | null
          relationship_to_recipient: string | null
          dependant_name: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          profile_image?: string | null
          role: string
          updated_at?: string | null
          phone_number?: string | null
          postal_code?: string | null
          location_lat?: number | null
          location_lng?: number | null
          travel_distance_km?: number | null
          status?: string | null
          city?: string | null
          profile_complete?: boolean | null
          archived_at?: string | null
          // New individual user fields
          pronouns?: string | null
          birthday?: number | null
          physical_address?: string | null
          other_pets_on_site?: boolean | null
          other_pets_description?: string | null
          third_party_available?: string | null
          additional_information?: string | null
          liability_waiver_accepted?: boolean | null
          liability_waiver_accepted_at?: string | null
          // Visit recipient fields
          visit_recipient_type?: string | null
          relationship_to_recipient?: string | null
          dependant_name?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          profile_image?: string | null
          role?: string
          updated_at?: string | null
          phone_number?: string | null
          postal_code?: string | null
          location_lat?: number | null
          location_lng?: number | null
          travel_distance_km?: number | null
          status?: string | null
          city?: string | null
          profile_complete?: boolean | null
          archived_at?: string | null
          // New individual user fields
          pronouns?: string | null
          birthday?: number | null
          physical_address?: string | null
          other_pets_on_site?: boolean | null
          other_pets_description?: string | null
          third_party_available?: string | null
          additional_information?: string | null
          liability_waiver_accepted?: boolean | null
          liability_waiver_accepted_at?: string | null
          // Visit recipient fields
          visit_recipient_type?: string | null
          relationship_to_recipient?: string | null
          dependant_name?: string | null
        }
        Relationships: []
      }
      volunteer_details: {
        Row: {
          created_at: string | null
          dog_age: number
          dog_bio: string | null
          dog_breed: string
          dog_name: string
          dog_picture_url: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dog_age: number
          dog_bio?: string | null
          dog_breed: string
          dog_name: string
          dog_picture_url?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dog_age?: number
          dog_bio?: string | null
          dog_breed?: string
          dog_name?: string
          dog_picture_url?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_details_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
