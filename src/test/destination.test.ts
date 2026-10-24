import { describe, expect, it } from "vitest";
import { DESTINATION_URL } from "../lib/destination-config";

describe("requested database destination", () => {
  it("targets the database supplied by the user", () => {
    expect(DESTINATION_URL).toBe("https://hnxynndrarzruewchmfh.supabase.co");
  });
});