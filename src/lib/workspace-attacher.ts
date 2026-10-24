import { createMiddleware } from "@tanstack/react-start";
import { getDestinationClient, getInitializedDestinationClient } from "./destination-client";

export const attachDestinationAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  // Never fetch configuration from a global function middleware: that RPC would
  // enter this same middleware recursively. Auth hydration owns initialization.
  const client = getInitializedDestinationClient();
  if (!client) return next();
  const { data } = await client.auth.getSession();
  return next({ headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
});
export async function destinationHeaders() {
  const { data } = await (await getDestinationClient()).auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}