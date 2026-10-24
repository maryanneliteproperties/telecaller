import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DESTINATION_URL } from "./destination-config";

export function getDestinationAdmin() {
  const key = process.env["EXTERNAL_SUPABASE_SECRET_KEY"];
  if (!key) throw new Error("Database connection is not configured.");
  return createClient<Database>(DESTINATION_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}