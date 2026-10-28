import { beforeEach, describe, expect, it, vi } from "vitest";

// สิทธิ์ของผู้ใช้จำลอง (apiCan) + รายชื่อร้าน (supabaseAdmin)
const perms = new Set<string>();
vi.mock("@/lib/api-auth", () => ({
  apiCan: async (_req: Request, p: string) => perms.has(p),
  guardApi: async (_req: Request, p: string) => (perms.has(p) ? null : new Response(JSON.stringify({ error: p }), { status: 401 })),
}));
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: async () => ({
        data: [
          { id: "3f54fb92-9598-458b-9d14-c6a8cedb4dd1", slug: "louismontini" },
          { id: "f08d1396-83e6-4b92-b55a-a8384513da6c", slug: "pixiedustie" },
        ],
      }),
    }),
  }),
}));

const { guardWebsite, websiteShopOf } = await import("./website-api-guard");

const req = (path: string, init: RequestInit & { token?: boolean } = {}) =>
  new Request(`http://x${path}`, { ...init, headers: { ...(init.token === false ? {} : { authorization: "Bearer t" }), ...(init.body ? { "content-type": "application/json" } : {}) } });
const status = async (r: Promise<Response | null>) => (await r)?.status ?? 200;

describe("guardWebsite", () => {
  beforeEach(() => perms.clear());

  it("ไม่ล็อกอิน = 401", async () => {
    expect(await status(guardWebsite(req("/api/website/theme?shop=pixiedustie", { token: false }), "view"))).toBe(401);
  });

  it("กลุ่ม × ระดับ", async () => {
    perms.add("website.design.view").add("website.shop.pixiedustie");
    expect(await status(guardWebsite(req("/api/website/theme?shop=pixiedustie"), "view"))).toBe(200);
    expect(await status(guardWebsite(req("/api/website/theme?shop=pixiedustie", { method: "PUT", body: "{}" }), "edit"))).toBe(403);
    expect(await status(guardWebsite(req("/api/website/orders?shop=pixiedustie"), "view"))).toBe(403);
    perms.add("website.design.edit");
    expect(await status(guardWebsite(req("/api/website/theme?shop=pixiedustie", { method: "PUT", body: "{}" }), "edit"))).toBe(200);
  });

  it("route ใช้ร่วมหลายกลุ่ม = ผ่านถ้ามีกลุ่มใดกลุ่มหนึ่ง", async () => {
    perms.add("website.design.edit").add("website.shop.pixiedustie");
    // แปลภาษา (หน้าตาเว็บ) เขียนข้อมูลร้าน settings ได้
    expect(await status(guardWebsite(req("/api/website/settings", { method: "PUT", body: JSON.stringify({ shopId: "f08d1396-83e6-4b92-b55a-a8384513da6c" }) }), "edit"))).toBe(200);
    expect(await status(guardWebsite(req("/api/website/shipping?shop=pixiedustie", { method: "PUT", body: "{}" }), "edit"))).toBe(403);
  });

  it("ร้าน: query / body / uuid · ไม่มีสิทธิ์ร้าน = 403", async () => {
    perms.add("website.products.edit").add("website.products.view").add("website.shop.pixiedustie");
    expect(await status(guardWebsite(req("/api/website/listings?shop=louismontini"), "view"))).toBe(403);
    expect(await status(guardWebsite(req("/api/website/listings?shop=pixiedustie"), "view"))).toBe(200);
    expect(await status(guardWebsite(req("/api/website/collections", { method: "PUT", body: JSON.stringify({ shopId: "3f54fb92-9598-458b-9d14-c6a8cedb4dd1" }) }), "edit"))).toBe(403);
    expect(await status(guardWebsite(req("/api/website/listings/grid?shopId=f08d1396-83e6-4b92-b55a-a8384513da6c"), "view"))).toBe(200);
    // ไม่รู้ร้าน → เช็กแค่กลุ่ม
    expect(await status(guardWebsite(req("/api/website/collections", { method: "PUT", body: JSON.stringify({ id: "x" }) }), "edit"))).toBe(200);
  });

  it("อ่าน body แล้ว route ยังอ่านต่อได้ (clone)", async () => {
    perms.add("website.promos.edit").add("website.shop.pixiedustie");
    const r = req("/api/website/coupons", { method: "POST", body: JSON.stringify({ shop: "pixiedustie", code: "A" }) });
    expect(await status(guardWebsite(r, "edit"))).toBe(200);
    expect(await r.json()).toEqual({ shop: "pixiedustie", code: "A" });
  });

  it("route ใช้ร่วมแอปอื่น = กฎเดิม products.*", async () => {
    expect(await status(guardWebsite(req("/api/website/tag-categories"), "view"))).toBe(401);
    perms.add("products.view");
    expect(await status(guardWebsite(req("/api/website/tag-categories"), "view"))).toBe(200);
  });

  it("websiteShopOf: slug ไม่รู้จัก = null", async () => {
    expect(await websiteShopOf(req("/api/website/theme?shop=nope"))).toBeNull();
    expect(await websiteShopOf(req("/api/website/theme?shopId=3f54fb92-9598-458b-9d14-c6a8cedb4dd1"))).toBe("louismontini");
  });
});
