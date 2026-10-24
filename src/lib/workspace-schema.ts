import { z } from "zod";

export const ADMIN_PIN_PATTERN = "[A-Za-z0-9]{8,12}";
export const adminLoginSchema = z.object({ pin: z.string().regex(new RegExp(`^${ADMIN_PIN_PATTERN}$`), "Admin PIN-ல் 8–12 English எழுத்துகள் அல்லது எண்கள் மட்டும் பயன்படுத்துங்க.") });
export const usernameSchema = z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9._-]+$/, "Username-ல் letters, numbers, dot, underscore மட்டும் பயன்படுத்துங்க.");
export const employeeSchema = z.object({ username: usernameSchema, email: z.string().trim().email().max(255), password: z.string().min(8).max(128) });
export const employeeLoginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) });
export const customerSchema = z.object({ customerName: z.string().trim().min(1).max(100), customerPhone: z.string().trim().min(7).max(20).regex(/^\+?[0-9 ()-]+$/), submissionKey: z.string().uuid() });
export type WorkspaceIdentity = { id: string; username: string; role: "admin" | "employee" };
export function canReadLead(identity: WorkspaceIdentity, ownerId: string | null) { return identity.role === "admin" || identity.id === ownerId; }