/**
 * 📌 กฎที่จำไว้ (platform_email_sku_rules) — ดู / แก้ / ลบ (ฝั่ง server · supabaseAdmin) — ใช้โดย /api/platform-email/rules
 *   rulesPage   ทีละหน้า + ชื่อสินค้าตัวอย่าง + จำนวนรายการจากเมล + ผู้ยืนยัน
 *   updateRule  เปลี่ยนเป้าหมาย (SKU ↔ รุ่น) + ย้ายรายการที่ผูกด้วยกฎนี้ตามไป
 *   deleteRule  ลบกฎ (+ เลือกส่งรายการกลับไปรอยืนยัน)
 * ⚠️ ออเดอร์ที่ "ตัดสต๊อกแล้ว" ไม่แตะรายการเลย (ไม่งั้นสต๊อกเพี้ยน: ตัดสีเดิมไปแล้ว แต่รายการชี้สีใหม่) → นับเป็น locked แจ้งผู้ใช้
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { modelFromItemKey } from "./match";

type Admin = ReturnType<typeof supabaseAdmin>;

type RuleRow = { id: string; platform_code: string; item_key: string; sku_id: string | null; parent_sku_id: string | null; created_by: string | null; created_at: string };

export type RuleView = {
  id: string;
  platform_code: string;
  item_key: string;
  /** รหัสรุ่น / ตัวเลือก จากกุญแจจำคู่ */
  model: string | null;
  variant: string | null;
  /** ชื่อสินค้าตัวอย่างจากเมล */
  title: string | null;
  target: { level: "sku" | "model"; id: string; code: string; color: string | null; name: string | null } | null;
  /** รายการจากเมลที่ใช้กุญแจนี้ (ทุกสถานะ) */
  items: number;
  created_at: string;
  created_by_name: string | null;
};

/** ตัวเลือกในกุญแจ ("m:BSD07|ดำ (01)" → "ดำ (01)") */
const variantOfKey = (key: string) => { const i = key.indexOf("|"); const v = i >= 0 ? key.slice(i + 1) : ""; return v || null; };

export async function rulesPage(admin: Admin, sp: URLSearchParams) {
  const size = Math.min(100, Math.max(1, parseInt(sp.get("size") ?? "", 10) || 20));
  const page = Math.max(0, parseInt(sp.get("page") ?? "", 10) || 0);
  const platform = (sp.get("platform") ?? "").trim();
  const level = (sp.get("level") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().replace(/[,()%*]/g, " ").slice(0, 60);

  let query = admin.from("platform_email_sku_rules").select("id, platform_code, item_key, sku_id, parent_sku_id, created_by, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (platform) query = query.eq("platform_code", platform);
  if (level === "sku") query = query.not("sku_id", "is", null);
  if (level === "model") query = query.not("parent_sku_id", "is", null);
  if (q) query = query.ilike("item_key", `%${q}%`);
  const { data, error, count } = await query.range(page * size, page * size + size - 1);
  if (error) throw new Error("โหลดกฎที่จำไว้ไม่สำเร็จ กรุณาลองใหม่");
  const rules = (data ?? []) as RuleRow[];

  const skuIds = rules.map((r) => r.sku_id).filter((x): x is string => !!x);
  const parentIds = rules.map((r) => r.parent_sku_id).filter((x): x is string => !!x);
  const userIds = [...new Set(rules.map((r) => r.created_by).filter((x): x is string => !!x))];
  const keys = [...new Set(rules.map((r) => r.item_key))];
  const [{ data: skus }, { data: parents }, { data: users }, { data: items }] = await Promise.all([
    skuIds.length ? admin.from("skus_v2").select("id, code, color_platform_th, color, name_th").in("id", skuIds) : Promise.resolve({ data: [] }),
    parentIds.length ? admin.from("parent_skus_v2").select("id, code, name_th").in("id", parentIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("user_profiles").select("id, display_name, username, email").in("id", userIds) : Promise.resolve({ data: [] }),
    keys.length ? admin.from("platform_order_items").select("name, ik:raw->>item_key, pc:raw->>platform_code").eq("raw->>source", "email").in("raw->>item_key", keys).limit(5000) : Promise.resolve({ data: [] }),
  ]);
  const skuOf = new Map(((skus ?? []) as { id: string; code: string; color_platform_th: string | null; color: string | null; name_th: string | null }[]).map((s) => [s.id, s]));
  const parentOf = new Map(((parents ?? []) as { id: string; code: string; name_th: string | null }[]).map((p) => [p.id, p]));
  const nameOf = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null; email: string | null }[])
    .map((u) => [u.id, u.display_name || u.username || u.email || "ผู้ใช้"]));
  const itemStat = new Map<string, { n: number; title: string | null }>();
  for (const it of (items ?? []) as { name: string | null; ik: string | null; pc: string | null }[]) {
    const k = `${it.pc}|${it.ik}`;
    const s = itemStat.get(k) ?? { n: 0, title: it.name };
    s.n++; itemStat.set(k, s);
  }

  const rows: RuleView[] = rules.map((r) => {
    const sku = r.sku_id ? skuOf.get(r.sku_id) : undefined;
    const parent = r.parent_sku_id ? parentOf.get(r.parent_sku_id) : undefined;
    const st = itemStat.get(`${r.platform_code}|${r.item_key}`);
    return {
      id: r.id, platform_code: r.platform_code, item_key: r.item_key,
      model: modelFromItemKey(r.item_key), variant: variantOfKey(r.item_key), title: st?.title ?? null,
      target: sku ? { level: "sku", id: sku.id, code: sku.code, color: sku.color_platform_th ?? sku.color, name: sku.name_th }
        : parent ? { level: "model", id: parent.id, code: parent.code, color: null, name: parent.name_th }
        : null,
      items: st?.n ?? 0,
      created_at: r.created_at,
      created_by_name: r.created_by ? nameOf.get(r.created_by) ?? null : null,
    };
  });
  return { rows, total: count ?? 0, page, size, error: null };
}

/** รายการจากเมลที่ผูกด้วยกฎนี้อยู่ → แยกเป็น ย้ายได้ / ล็อก (ออเดอร์ตัดสต๊อกแล้ว) */
async function boundItems(admin: Admin, rule: RuleRow): Promise<{ movable: string[]; locked: number }> {
  let q = admin.from("platform_order_items").select("id, order_id")
    .eq("raw->>source", "email").eq("raw->>platform_code", rule.platform_code).eq("raw->>item_key", rule.item_key);
  q = rule.sku_id ? q.eq("matched_sku_id", rule.sku_id) : q.eq("matched_parent_sku_id", rule.parent_sku_id as string).is("matched_sku_id", null);
  const { data } = await q.limit(5000);
  const rows = (data ?? []) as { id: string; order_id: string }[];
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const deducted = new Set<string>();
  for (let i = 0; i < orderIds.length; i += 300) {
    const { data: ord } = await admin.from("platform_orders").select("id").in("id", orderIds.slice(i, i + 300)).eq("stock_deducted", true);
    for (const o of (ord ?? []) as { id: string }[]) deducted.add(o.id);
  }
  return { movable: rows.filter((r) => !deducted.has(r.order_id)).map((r) => r.id), locked: rows.filter((r) => deducted.has(r.order_id)).length };
}

async function updateItems(admin: Admin, ids: string[], patch: Record<string, unknown>): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("platform_order_items").update(patch).in("id", ids.slice(i, i + 200)).select("id");
    if (error) throw new Error("ย้ายรายการสินค้าไม่สำเร็จ");
    n += (data ?? []).length;
  }
  return n;
}

async function loadRule(admin: Admin, id: string): Promise<RuleRow | null> {
  const { data } = await admin.from("platform_email_sku_rules").select("id, platform_code, item_key, sku_id, parent_sku_id, created_by, created_at").eq("id", id).maybeSingle();
  return (data as RuleRow | null) ?? null;
}

/** เปลี่ยนเป้าหมายกฎ (SKU หรือ รุ่น) + ย้ายรายการที่ผูกด้วยกฎนี้ตามไป (ยกเว้นออเดอร์ที่ตัดสต๊อกแล้ว) */
export async function updateRule(admin: Admin, id: string, target: { sku_id?: string | null; parent_sku_id?: string | null }) {
  const rule = await loadRule(admin, id);
  if (!rule) throw Object.assign(new Error("ไม่พบกฎนี้ (อาจถูกลบไปแล้ว)"), { status: 404 });
  let next: { level: "sku" | "model"; id: string; code: string };
  if (target.sku_id) {
    const { data } = await admin.from("skus_v2").select("id, code").eq("id", target.sku_id).maybeSingle();
    if (!data) throw Object.assign(new Error("ไม่พบ SKU นี้"), { status: 404 });
    next = { level: "sku", ...(data as { id: string; code: string }) };
  } else if (target.parent_sku_id) {
    const { data } = await admin.from("parent_skus_v2").select("id, code").eq("id", target.parent_sku_id).maybeSingle();
    if (!data) throw Object.assign(new Error("ไม่พบรุ่นนี้"), { status: 404 });
    next = { level: "model", ...(data as { id: string; code: string }) };
  } else throw Object.assign(new Error("เลือก SKU หรือรุ่นก่อน"), { status: 400 });

  const { movable, locked } = await boundItems(admin, rule);
  const { error } = await admin.from("platform_email_sku_rules")
    .update(next.level === "sku" ? { sku_id: next.id, parent_sku_id: null } : { sku_id: null, parent_sku_id: next.id }).eq("id", id);
  if (error) throw new Error("บันทึกกฎไม่สำเร็จ");
  const moved = await updateItems(admin, movable, next.level === "sku"
    ? { matched_sku_id: next.id, matched_parent_sku_id: null, sku_code: next.code }
    : { matched_sku_id: null, matched_parent_sku_id: next.id, sku_code: next.code });
  return { rule, next, moved, locked };
}

/** ลบกฎ · release = ส่งรายการที่ผูกด้วยกฎนี้กลับไปรอยืนยัน (ยกเว้นออเดอร์ที่ตัดสต๊อกแล้ว) */
export async function deleteRule(admin: Admin, id: string, release: boolean) {
  const rule = await loadRule(admin, id);
  if (!rule) throw Object.assign(new Error("ไม่พบกฎนี้ (อาจถูกลบไปแล้ว)"), { status: 404 });
  const { movable, locked } = release ? await boundItems(admin, rule) : { movable: [] as string[], locked: 0 };
  const { error } = await admin.from("platform_email_sku_rules").delete().eq("id", id);
  if (error) throw new Error("ลบกฎไม่สำเร็จ");
  const released = await updateItems(admin, movable, { matched_sku_id: null, matched_parent_sku_id: null, sku_code: modelFromItemKey(rule.item_key) });
  return { rule, released, locked };
}
