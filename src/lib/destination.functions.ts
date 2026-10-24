import { createServerFn } from "@tanstack/react-start";
import { DESTINATION_URL } from "./destination-config";

// Only the publishable key may cross this boundary. Never return the secret key.
export const getDestinationConfig = createServerFn({ method: "GET" }).handler((): { url: string; key: string } => {
  const key = process.env["EXTERNAL_SUPABASE_PUBLISHABLE_KEY"];
  if (!key) throw new Error("Database connection is not configured.");
  return { url: DESTINATION_URL, key };
});