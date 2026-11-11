import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LINK_GROUPS, PARENT_LINK_IGNORED, PARENT_LINK_SOURCES, registeredLinkTables } from "@/lib/parent-links-registry";

/** ตารางใน migration ที่มีคอลัมน์ผูกกับรุ่นสินค้า (parent_sku_id / matched_parent_sku_id / parent_sku_code(s)) */
function tablesWithParentLink(): Map<string, Set<string>> {
  const dir = join(process.cwd(), "supabase", "migrations");
  const found = new Map<string, Set<string>>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
    for (const st of sql.split(/;\s*\n/)) {
      const t = st.match(/(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table(?:\s+if\s+exists)?(?:\s+only)?)\s+(?:public\.)?"?([a-z_0-9]+)"?/i);
      if (!t) continue;
      for (const c of st.matchAll(/\b((?:matched_|source_)?parent_sku(?:_id|_code|_codes)?)\s+(uuid|text|jsonb|varchar|character)/gi)) {
        const k = t[1].toLowerCase();
        if (!found.has(k)) found.set(k, new Set());
        found.get(k)!.add(c[1].toLowerCase());
      }
    }
  }
  return found;
}

describe("parent-links-registry (ทะเบียนรายการที่ผูกกับรุ่นสินค้า)", () => {
  it("กันลืม: ตารางใหม่ที่ผูกกับ Parent SKU ต้องลงทะเบียน หรือใส่ใน PARENT_LINK_IGNORED พร้อมเหตุผล", () => {
    const covered = registeredLinkTables();
    const missing = [...tablesWithParentLink().keys()].filter((t) => !covered.has(t) && !(t in PARENT_LINK_IGNORED));
    // ถ้าเทสต์นี้ไม่ผ่าน → เพิ่มก้อนใน PARENT_LINK_SOURCES (lib/parent-links-registry.ts) ให้ตารางเหล่านี้ แท็บภาพรวมจะโชว์เอง
    expect(missing).toEqual([]);
  });

  it("เจอตารางจาก migration จริง (กันตัวอ่าน migration พังเงียบ)", () => {
    expect(tablesWithParentLink().size).toBeGreaterThan(10);
  });

  it("key ไม่ซ้ำ · หมวดมีจริง · มีวิธีผูกอย่างน้อย 1 · select มี id", () => {
    const keys = PARENT_LINK_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const groups = new Set(LINK_GROUPS.map((g) => g.key));
    for (const s of PARENT_LINK_SOURCES) {
      expect(groups.has(s.group), s.key).toBe(true);
      expect(s.match.length, s.key).toBeGreaterThan(0);
      expect(/(^|,\s*)id(,|$)/.test(s.select), `${s.key} ต้อง select id`).toBe(true);
    }
  });

  it("ตารางที่ข้ามต้องมีเหตุผล และไม่ซ้ำกับตารางที่ลงทะเบียน", () => {
    const covered = registeredLinkTables();
    for (const [t, why] of Object.entries(PARENT_LINK_IGNORED)) {
      expect(why.trim().length, t).toBeGreaterThan(5);
      expect(covered.has(t), t).toBe(false);
    }
  });

  it("แปลงแถว: ลิงก์ใบงาน/ป๊อปใบสั่งผลิต/รูป R2", () => {
    const task = PARENT_LINK_SOURCES.find((s) => s.key === "creative_tasks")!;
    expect(task.toItem({ id: "t1", task_no: "T-001", title: "ถ่ายนายแบบ", cover_image_r2_key: "k.jpg" }))
      .toMatchObject({ title: "T-001 · ถ่ายนายแบบ", href: "/tasks?task=t1", image: { key: "k.jpg" } });
    const mo = PARENT_LINK_SOURCES.find((s) => s.key === "manufacturing_orders")!;
    expect(mo.toItem({ id: "m1", mo_no: "MO-1", product_sku: "WK46-01", qty: 10, is_active: false }))
      .toMatchObject({ status: "cancelled", open: { kind: "mo", id: "m1" } });
  });
});
