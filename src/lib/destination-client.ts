import { createClient, type SupabaseClient, type SignInWithPasswordCredentials, type SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getDestinationConfig } from "./destination.functions";

let client: Promise<ReturnType<typeof createClient<Database>>> | undefined;
let initializedClient: SupabaseClient<Database> | undefined;
export function getInitializedDestinationClient() { return initializedClient; }
export function getDestinationClient(): Promise<SupabaseClient<Database>> {
  if (!client) {
    client = getDestinationConfig().then(({ url, key }) => createClient<Database>(url, key, {
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    })).then(value => { initializedClient = value; return value; }).catch((error) => { client = undefined; throw error; });
  }
  return client;
}

export const supabase = {
  auth: {
    getUser: async () => (await getDestinationClient()).auth.getUser(),
    signOut: async () => (await getDestinationClient()).auth.signOut(),
    signInWithPassword: async (credentials: SignInWithPasswordCredentials) => (await getDestinationClient()).auth.signInWithPassword(credentials),
    signUp: async (credentials: SignUpWithPasswordCredentials) => (await getDestinationClient()).auth.signUp(credentials),
  },
};