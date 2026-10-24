import { describe, expect, it } from "vitest";
import { adminLoginSchema, canReadLead, customerSchema, employeeSchema, employeeLoginSchema } from "@/lib/workspace-schema";

describe("Workspace account and lead rules", () => {
  it("accepts case-sensitive alphanumeric Admin PINs", () => {
    expect(adminLoginSchema.parse({ pin: "AbcD1234" }).pin).toBe("AbcD1234");
    expect(adminLoginSchema.safeParse({ pin: "12345678" }).success).toBe(true);
  });
  it("retains the 8–12 character Admin PIN limit", () => {
    expect(adminLoginSchema.safeParse({ pin: "Abc1234" }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ pin: "Abc123456789" }).success).toBe(true);
    expect(adminLoginSchema.safeParse({ pin: "Abc1234567890" }).success).toBe(false);
  });
  it("rejects spaces and symbols in Admin PINs", () => {
    expect(adminLoginSchema.safeParse({ pin: "Abcd 1234" }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ pin: "Abcd@1234" }).success).toBe(false);
  });
  it("requires username, real email and password for employee creation", () => {
    expect(employeeSchema.safeParse({ username: "employee1", email: "employee@example.com", password: "Example-pass1" }).success).toBe(true);
    expect(employeeSchema.safeParse({ username: "employee1", password: "Example-pass1" }).success).toBe(false);
  });
  it("employee login accepts username and password without requiring email", () => {
    expect(employeeLoginSchema.parse({ username: " Employee1 ", password: "Example-pass1" }).username).toBe("employee1");
  });
  it("requires customer name and phone on submission", () => {
    const input = { customerName: "Customer", customerPhone: "9876543210", submissionKey: "12345678-1234-4234-9234-123456789abc" };
    expect(customerSchema.safeParse(input).success).toBe(true);
    expect(customerSchema.safeParse({ ...input, customerName: "" }).success).toBe(false);
    expect(customerSchema.safeParse({ ...input, customerPhone: "" }).success).toBe(false);
  });
  it("Admin can read every lead", () => {
    expect(canReadLead({ id: "admin", username: "Admin", role: "admin" }, "other")).toBe(true);
    expect(canReadLead({ id: "admin", username: "Admin", role: "admin" }, null)).toBe(true);
  });
  it("Employee can read only their own leads", () => {
    const employee = { id: "employee1", username: "employee1", role: "employee" as const };
    expect(canReadLead(employee, "employee1")).toBe(true);
    expect(canReadLead(employee, "employee2")).toBe(false);
    expect(canReadLead(employee, null)).toBe(false);
  });
});