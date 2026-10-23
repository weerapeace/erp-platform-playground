import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { activeShopBySlug, shopBySlug } from "@/lib/website-shop";
import { corsJson, corsPreflight, storefrontCors } from "@/lib/storefront-cors";

const SHOPS = [
  { id: "s1", slug: "louismontini", name: "Louis Montini", status: "active" },
  { id: "s2", slug: "closed-shop", name: "ปิดอยู่", status: "inactive" },
];

/** sb ปลอม: บันทึกคอลัมน์ที่ขอ + ตอบจาก SHOPS */
function fakeSb() {
  const asked: { cols: string; slug: string }[] = [];
  const sb = {
    from: () => ({
      select: (cols: string) => ({
        eq: (_col: string, slug: string) => ({
          maybeSingle: async () => {
            asked.push({ cols, slug });
            const row = SHOPS.find((s) => s.slug === slug);
            return { data: row ? Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, (row as Record<string, unknown>)[c]])) : null };
          },
        }),
      }),
    }),
  };
  return { sb: sb as unknown as SupabaseClient, asked };
}

describe("lib/website-shop — หาร้านจาก slug", () => {
  it("ตัดช่องว่าง + คืนเฉพาะคอลัมน์ที่ขอ", async () => {
    const { sb, asked } = fakeSb();
    expect(await shopBySlug(sb, "  louismontini ", "id, name")).toEqual({ id: "s1", name: "Louis Montini" });
    expect(asked[0]).toEqual({ cols: "id, name", slug: "louismontini" });
  });

  it("slug ว่าง / ไม่ใช่ข้อความ = null โดยไม่ยิง query", async () => {
    const { sb, asked } = fakeSb();
    expect(await shopBySlug(sb, "")).toBeNull();
    expect(await shopBySlug(sb, undefined)).toBeNull();
    expect(await shopBySlug(sb, 123)).toBeNull();
    expect(asked).toHaveLength(0);
  });

  it("ร้านเปิด = คืนร้าน · ร้านปิด/ไม่มี = null · เติม status ให้เองถ้าไม่ได้ขอ", async () => {
    const { sb, asked } = fakeSb();
    expect(await activeShopBySlug(sb, "louismontini")).toEqual({ id: "s1", status: "active" });
    expect(asked[0].cols).toBe("id, status");
    expect(await activeShopBySlug(sb, "closed-shop", "id, status")).toBeNull();
    expect(asked[1].cols).toBe("id, status");
    expect(await activeShopBySlug(sb, "nope")).toBeNull();
  });
});

describe("lib/storefront-cors — หัว CORS ของ API เว็บร้าน", () => {
  it("หัวเหมือนที่ route เคยประกาศเอง", () => {
    expect(storefrontCors("GET, POST")).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
  });

  it("preflight = 204 + หัว CORS · json = ไม่ให้แคช (เปลี่ยนได้)", async () => {
    const cors = storefrontCors("GET");
    const pre = corsPreflight(cors);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    const json = corsJson(cors);
    const r = json({ ok: false }, 404);
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(await r.json()).toEqual({ ok: false });
    expect(json({}, 200, "public, max-age=60").headers.get("cache-control")).toBe("public, max-age=60");
  });
});
