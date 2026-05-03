import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";

export const supabase = createClient(supabaseUrl, supabaseKey);

export type BroadcastStatus = "pending" | "running" | "paused" | "stopped" | "completed";

export interface BroadcastCampaign {
  id: string;
  created_at: string;
  status: BroadcastStatus;
  message: string;
  min_sec: number;
  max_sec: number;
  per_chip_limit: number;
  total: number;
  sent: number;
  errors: number;
  chips: string[]; // JSON array
}

export interface BroadcastNumber {
  id: string;
  broadcast_id: string;
  number: string;
  status: "pending" | "sent" | "error";
  instance?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
}
