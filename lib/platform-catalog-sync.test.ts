import { describe, expect, it } from "vitest";
import { upsertCatalogListings, type CatalogSyncItem } from "./platform-catalog-sync";

// ฐานข้อมูลจำลอง: จำว่าถูกเรียกอะไร (ไม่แตะของจริง)
function fakeAdmin(opts: { existing?: Record<string, unknown>[]; skus?: { code: string; parent_sku_id: string }[]; parents?: { id: string; code: string }[] }) {
  const calls: { op: "insert" | "upsert" | "update"; rows: Record<string, unknown>[] }[] = [];
  const from = (table: string) => {
    const result = () => {
      if (table === "skus_v2") return { data: opts.skus ?? [], error: null };
      if (table === "parent_skus_v2") return { data: opts.parents ?? [], error: null };
      return { data: opts.existing ?? [], error: null };
    };
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "order", "range"]) q[k] = () => q;
    q.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
    q.insert = (rows: Record<string, unknown>[]) => { calls.push({ op: "insert", rows }); return Promise.resolve({ error: null }); };
    q.upsert = (rows: Record<string, unknown>[]) => { calls.push({ op: "upsert", rows }); return Promise.resolve({ error: null }); };
    q.update = (patch: Record<string, unknown>) => ({
      in: (_col: string, ids: string[]) => { calls.push({ op: "update", rows: ids.map((id) => ({ id, ...patch })) }); return Promise.resolve({ error: null }); },
    });
    return q;
  };
  return { admin: { from } as never, calls };
}
const item = (id: string, sku: string): CatalogSyncItem => ({ external_product_id: id, title: `สินค้า ${id}`, skus: [sku], price: 100, raw: { line: { id } } });
const row = (id: string, ext: string | null, status: string | null = null) => ({ id, external_product_id: ext, status, matched_parent_sku_id: null, match_ignored: false, raw: {} });

describe("upsertCatalogListings", () => {
  it("ส่งเป็นชุดละไม่เกิน 200 แถว (เคยส่ง 921 แถวทีเดียวจนฐานข้อมูลตัดทิ้ง)", async () => {
    const existing = Array.from({ length: 921 }, (_, i) => ({ id: `row-${i}`, external_product_id: String(i), matched_parent_sku_id: null, match_ignored: false, raw: {} }));
    const { admin, calls } = fakeAdmin({ existing });
    const r = await upsertCatalogListings(admin, { platformId: "pf", brandId: "b", source: "api", items: existing.map((e) => item(String(e.external_product_id), "X")) });
    expect(r.updated).toBe(921);
    expect(calls.every((c) => c.rows.length <= 200)).toBe(true);
    expect(calls.filter((c) => c.op === "upsert").length).toBe(5);
  });
  it("ไม่ทับคู่ที่คนจับไว้ · ไม่จับคู่ตัวที่กด ไม่ต้องจับคู่ · ตัวใหม่จับคู่รหัสตรงได้", async () => {
    const { admin, calls } = fakeAdmin({
      existing: [
        { id: "r1", external_product_id: "1", matched_parent_sku_id: "p-manual", match_ignored: false, raw: {} },
        { id: "r2", external_product_id: "2", matched_parent_sku_id: null, match_ignored: true, raw: {} },
      ],
      skus: [{ code: "JEAN08-01", parent_sku_id: "p-jean08" }],
    });
    const r = await upsertCatalogListings(admin, { platformId: "pf", brandId: "b", source: "api", items: [item("1", "JEAN08-01"), item("2", "JEAN08-01"), item("3", "JEAN08-01")] });
    const rows = calls.flatMap((c) => c.rows);
    expect(rows.find((x) => x.external_product_id === "1")?.matched_parent_sku_id).toBe("p-manual");
    expect(rows.find((x) => x.external_product_id === "2")?.matched_parent_sku_id).toBeNull();
    expect(rows.find((x) => x.external_product_id === "3")?.matched_parent_sku_id).toBe("p-jean08");
    expect(rows.some((x) => "match_ignored" in x)).toBe(false);
    expect(r).toMatchObject({ created: 1, updated: 2, newly_matched: 1 });
  });
});

describe("ป้าย ไม่อยู่บนร้านแล้ว (markMissing)", () => {
  it("ดึงครบทั้งร้าน → ตัวที่ไม่เจอติดป้าย removed · ข้ามตัวไม่มีเลขบนร้าน + ตัวที่ติดป้ายอยู่แล้ว", async () => {
    const existing = [row("a", "1"), row("b", "2"), row("c", "3"), row("d", null), row("e", "5", "removed")];
    const { admin, calls } = fakeAdmin({ existing });
    const r = await upsertCatalogListings(admin, { platformId: "pf", brandId: "b", source: "api", items: [item("1", "X"), item("2", "X")], markMissing: true });
    const upd = calls.filter((c) => c.op === "update").flatMap((c) => c.rows);
    expect(upd.map((x) => x.id)).toEqual(["c"]);
    expect(upd[0].status).toBe("removed");
    expect(r).toMatchObject({ removed: 1, removed_skipped: 0, restored: 0 });
  });
  it("ไม่ส่ง markMissing (ดึงไม่ครบ) → ไม่ติดป้ายใคร", async () => {
    const { admin, calls } = fakeAdmin({ existing: [row("a", "1"), row("c", "3")] });
    const r = await upsertCatalogListings(admin, { platformId: "pf", brandId: "b", source: "api", items: [item("1", "X")] });
    expect(calls.some((c) => c.op === "update")).toBe(false);
    expect(r.removed).toBe(0);
  });
  it("เจอกลับมาบนร้าน → ล้างป้ายเอง (แม้รอบนั้นไม่ได้ส่ง markMissing)", async () => {
    const { admin, calls } = fakeAdmin({ existing: [row("e", "5", "removed")] });
    const r = await upsertCatalogListings(admin, { platformId: "pf", brandId: "b", source: "api", items: [item("5", "X")] });
    const up = calls.filter((c) => c.op === "upsert").flatMap((c) => c.rows);
    expect(up[0].status).toBeNull();
    expect(r.restored).toBe(1);
  });
  it("กันพลาด: จะติดป้ายเกินครึ่งร้าน (และเกิน 20 ตัว) → ไม่ติด แจ้ง removed_skipped", async () => {
    const existing = Array.from({ length: 60 }, (_, i) => row(`r${i}`, String(i)));
    const { admin, calls } = fakeAdmin({ existing });
    const r = await upsertCatalogListings(admin, { platformId: "pf", brandId: "b", source: "api", items: Array.from({ length: 10 }, (_, i) => item(String(i), "X")), markMissing: true });
    expect(calls.some((c) => c.op === "update")).toBe(false);
    expect(r).toMatchObject({ removed: 0, removed_skipped: 50 });
  });
  it("ร้านเล็ก ลบไม่เกิน 20 ตัว → ติดป้ายได้แม้เกินครึ่ง", async () => {
    const { admin } = fakeAdmin({ existing: [row("a", "1"), row("b", "2"), row("c", "3")] });
    const r = await upsertCatalogListings(admin, { platformId: "pf", brandId: "b", source: "api", items: [item("1", "X")], markMissing: true });
    expect(r).toMatchObject({ removed: 2, removed_skipped: 0 });
  });
});
