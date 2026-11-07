import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ตัวจำผล getUser ต่อ token (lib/supabase-auth-server) — ถามเซิร์ฟเวอร์ล็อกอินครั้งเดียวต่อ token ภายใน 30 วิ
let calls = 0;
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
});
afterEach(() => { vi.unstubAllGlobals(); calls = 0; });

const stubAuth = (status = 200) => vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/auth/v1/user")) {
    calls++;
    return new Response(status === 200 ? JSON.stringify({ id: "u1", email: "a@b.c", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }) : JSON.stringify({ msg: "bad jwt" }),
      { status, headers: { "Content-Type": "application/json" } });
  }
  return new Response("{}", { status: 404 });
}));
const req = (token: string) => new Request("https://x.test/api/a", { headers: { authorization: `Bearer ${token}` } });

describe("supabaseFromRequest().auth.getUser() — จำผลต่อ token", () => {
  it("token เดิมหลายคำขอ = ถามเซิร์ฟเวอร์ล็อกอินครั้งเดียว", async () => {
    stubAuth();
    const { supabaseFromRequest } = await import("@/lib/supabase-auth-server");
    const [a, b] = await Promise.all([supabaseFromRequest(req("tok-A")).auth.getUser(), supabaseFromRequest(req("tok-A")).auth.getUser()]);
    const c = await supabaseFromRequest(req("tok-A")).auth.getUser();
    expect(a.data.user?.id).toBe("u1");
    expect(b.data.user?.id).toBe("u1");
    expect(c.data.user?.id).toBe("u1");
    expect(calls).toBe(1);
  });
  it("คนละ token = ถามแยก · ผลที่ไม่ผ่านไม่จำ", async () => {
    stubAuth(401);
    const { supabaseFromRequest } = await import("@/lib/supabase-auth-server");
    const r1 = await supabaseFromRequest(req("tok-BAD")).auth.getUser();
    const r2 = await supabaseFromRequest(req("tok-BAD")).auth.getUser();
    expect(r1.data.user).toBeNull();
    expect(r2.data.user).toBeNull();
    expect(calls).toBe(2);
  });
});
