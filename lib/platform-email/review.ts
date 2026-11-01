/**
 * 🔗 ข้อมูลสำหรับหน้า /admin/platform-email (ฝั่ง server · supabaseAdmin) — ใช้โดย /api/platform-email/inbox
 *   pendingPage  แท็บ "รอยืนยันสินค้า": รวมกลุ่มสินค้าที่ยังไม่ผูก SKU → กรอง/นับ/ตัดหน้า · ตัวเลือก SKU ดึงเฉพาะการ์ดในหน้าที่เปิด
 *   inboxPage    แท็บ "เมลที่อ่านแล้ว": ทีละหน้า + ค้นหา + เรียงที่ฐานข้อมูล
 *   bindPending  ผูกรายการที่ค้างของ (แพลตฟอร์ม + สินค้า+ตัวเลือก) กับ SKU
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages, type PageResult } from "@/lib/fetch-all";
import { SKU_MATCH_SELECT } from "./server";
import { modelsForItem, pendingQueueOf, type PendingQueue, type SkuCandidate } from "./match";

type Admin = ReturnType<typeof supabaseAdmin>;

export const INBOX_STATUSES = ["done", "ignored", "unreadable", "attention"];
const QUEUES: PendingQueue[] = ["guess", "multi", "not_found"];

/** เลขหน้า/ขนาดหน้าจาก query (page เริ่ม 0) */
function paging(sp: URLSearchParams, def: number, max: number) {
  const size = Math.min(max, Math.max(1, parseInt(sp.get("size") ?? "", 10) || def));
  const page = Math.max(0, parseInt(sp.get("page") ?? "", 10) || 0);
  return { page, size };
}

const ITEM_SELECT = "id, name, qty, pc:raw->>platform_code, ik:raw->>item_key, variant:raw->>variant, model:raw->>model_code, reason:raw->>reason, sugg_id:raw->>suggest_sku_id, sugg_code:raw->>suggest_code, ord:platform_orders(order_no, status)";
type ItemRow = {
  id: string; name: string | null; qty: number | null;
  pc: string | null; ik: string | null; variant: string | null; model: string | null; reason: string | null; sugg_id: string | null; sugg_code: string | null;
  /** ออเดอร์ (หลายต่อหนึ่ง → ได้ object · กันไว้เผื่อได้ array) */
  ord: OrdRef | OrdRef[] | null;
};
type OrdRef = { order_no: string | null; status: string };

type Group = {
  platform_code: string; item_key: string; title: string; variant: string | null; model_code: string | null;
  items: number; qty: number; live_items: number; order_count: number; orders: { no: string; cancelled: boolean }[];
  queue: PendingQueue; suggest: { id: string; code: string } | null; reason: string | null;
  candidates: { id: string; code: string; color: string | null; name: string | null }[];
};

/**
 * สินค้ารอยืนยัน ทีละหน้า — รวมกลุ่มทุกรายการที่ค้าง (เบา: ~1–2 พันแถว) แล้วกรอง/นับ/ตัดหน้าในเซิร์ฟเวอร์
 * ตัวเลือก SKU (ส่วนที่หนัก) ดึงเฉพาะการ์ดในหน้าที่เปิด
 */
export async function pendingPage(admin: Admin, sp: URLSearchParams) {
  const { page, size } = paging(sp, 20, 100);
  const platform = (sp.get("platform") ?? "").trim();
  const queue = (sp.get("queue") ?? "").trim() as PendingQueue | "";
  const hideCancelled = sp.get("hide_cancelled") === "1";
  const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 60);

  // ดึงเฉพาะช่องที่ใช้ใน raw + สถานะออเดอร์ในคำขอเดียว (เร็วกว่าดึง raw ทั้งก้อนแล้วค่อยหาออเดอร์ทีหลัง)
  const items = await fetchAllPages<ItemRow>((from, to) => admin.from("platform_order_items")
    .select(ITEM_SELECT).is("matched_sku_id", null).eq("raw->>source", "email").order("id").range(from, to) as unknown as PromiseLike<PageResult<ItemRow>>, { maxRows: 5000 });

  const groups = new Map<string, Group & { orderSet: Set<string> }>();
  for (const it of items) {
    const raw = { platform_code: it.pc, item_key: it.ik, variant: it.variant, model_code: it.model, reason: it.reason, suggest_sku_id: it.sugg_id, suggest_code: it.sugg_code };
    const pc = String(raw.platform_code ?? ""), key = String(raw.item_key ?? "");
    if (!pc || !key) continue;
    const g = groups.get(`${pc}|${key}`) ?? {
      platform_code: pc, item_key: key, title: it.name ?? "", variant: (raw.variant as string | null) ?? null,
      model_code: (raw.model_code as string | null) ?? null, items: 0, qty: 0, live_items: 0, order_count: 0, orders: [], orderSet: new Set<string>(),
      queue: pendingQueueOf(raw),
      suggest: raw.suggest_sku_id ? { id: String(raw.suggest_sku_id), code: String(raw.suggest_code ?? "") } : null,
      reason: (raw.reason as string | null) ?? null, candidates: [],
    };
    g.items++; g.qty += Number(it.qty ?? 0);
    const ord = Array.isArray(it.ord) ? it.ord[0] : it.ord;
    const o = ord ? { no: ord.order_no ?? "", cancelled: ord.status === "cancelled" } : null;
    if (!o?.cancelled) g.live_items++;
    if (o && !g.orderSet.has(o.no)) {
      g.orderSet.add(o.no);
      if (g.orders.length < 20) g.orders.push(o);
    }
    groups.set(`${pc}|${key}`, g);
  }

  // กรองเป็นชั้น ๆ → ตัวเลขบนชิปแต่ละชั้นนับจากชั้นก่อนหน้า (ชิปแพลตฟอร์มไม่ขึ้นกับคิว · ชิปคิวขึ้นกับแพลตฟอร์มที่เลือก)
  let list = [...groups.values()].map(({ orderSet, ...g }) => ({ ...g, order_count: orderSet.size }));
  const cancelledOnly = list.filter((g) => g.live_items === 0).length;
  if (hideCancelled) list = list.filter((g) => g.live_items > 0);
  if (q) list = list.filter((g) => [g.title, g.variant, g.model_code, ...g.orders.map((o) => o.no)].some((x) => String(x ?? "").toLowerCase().includes(q)));
  const byPlatform: Record<string, { groups: number; qty: number }> = {};
  for (const g of list) { const b = (byPlatform[g.platform_code] ??= { groups: 0, qty: 0 }); b.groups++; b.qty += g.qty; }
  const stats = { groups: list.length, qty: list.reduce((a, g) => a + g.qty, 0), by_platform: byPlatform, by_queue: { guess: 0, multi: 0, not_found: 0 } as Record<PendingQueue, number>, cancelled_only: cancelledOnly };
  if (platform) list = list.filter((g) => g.platform_code === platform);
  for (const g of list) stats.by_queue[g.queue]++;
  if (QUEUES.includes(queue as PendingQueue)) list = list.filter((g) => g.queue === queue);
  list.sort((a, b) => b.qty - a.qty || b.items - a.items || a.title.localeCompare(b.title));

  const total = list.length;
  const pageGroups = list.slice(page * size, page * size + size);

  // ตัวเลือกให้กด = SKU ของรุ่นที่เขียนในตัวเลือก (เช่น "สีดำ | MGN116") + รุ่นท้ายชื่อสินค้า — เฉพาะการ์ดในหน้านี้
  const safe = (m: string) => /^[A-Z0-9-]{3,30}$/.test(m);
  const groupModels = pageGroups.map((g) => modelsForItem({ title: g.title, variant: g.variant }).filter(safe));
  const models = [...new Set(groupModels.flat())];
  const modelChunks: string[][] = [];
  for (let i = 0; i < models.length; i += 40) modelChunks.push(models.slice(i, i + 40));
  const pcs = [...new Set([...groups.values()].map((g) => g.platform_code))];
  // ตัวเลือก SKU + ข้อมูลแพลตฟอร์ม ดึงพร้อมกัน
  const [skuChunks, { data: pf }] = await Promise.all([
    Promise.all(modelChunks.map(async (chunk) => {
      const or = chunk.flatMap((m) => [`code.eq.${m}`, `code.ilike.${m}-*`]).join(",");
      const { data } = await admin.from("skus_v2").select(SKU_MATCH_SELECT).or(or).eq("is_active", true).order("code").limit(5000);
      return (data ?? []) as SkuCandidate[];
    })),
    pcs.length ? admin.from("erp_platforms").select("code, name_th, color, icon_key").in("code", pcs) : Promise.resolve({ data: [] }),
  ]);
  const skus = skuChunks.flat();
  pageGroups.forEach((g, i) => {
    const ms = groupModels[i];
    g.candidates = skus
      .filter((s) => { const c = s.code.toUpperCase(); return ms.some((m) => c === m || c.startsWith(`${m}-`)); })
      .slice(0, 30)
      .map((s) => ({ id: s.id, code: s.code, color: s.color_platform_th ?? s.color ?? null, name: s.name_th ?? null }));
  });

  const platforms = ((pf ?? []) as { code: string; name_th: string | null; color: string | null; icon_key: string | null }[])
    .map((p) => ({ code: p.code, name: p.name_th ?? p.code, color: p.color, icon_key: p.icon_key }));

  // คิว "ระบบเดาไว้" → ส่งรายการย่อทุกหน้าไปด้วย ให้ติ๊ก "เลือกทั้งหมดตามตัวกรอง" ได้
  const guess_all = queue === "guess"
    ? list.filter((g) => g.suggest).map((g) => ({ platform_code: g.platform_code, item_key: g.item_key, title: g.title, variant: g.variant, qty: g.qty, suggest: g.suggest! }))
    : undefined;

  return { groups: pageGroups, total, page, size, stats, platforms, guess_all, error: null };
}

/** ผูกทุกรายการที่ค้างของ (แพลตฟอร์ม + สินค้า+ตัวเลือก) กับ SKU → จำนวนรายการที่ผูก */
export async function bindPending(admin: Admin, pc: string, key: string, skuId: string, code: string): Promise<number> {
  const { data, error } = await admin.from("platform_order_items").update({ matched_sku_id: skuId, sku_code: code })
    .is("matched_sku_id", null).eq("raw->>source", "email").eq("raw->>platform_code", pc).eq("raw->>item_key", key).select("id");
  if (error) throw new Error("ผูกรายการสินค้าไม่สำเร็จ");
  return (data ?? []).length;
}

const LIST_COLS = "id, message_id, received_at, from_addr, subject, platform_code, kind, external_order_id, ref_no, shop_name, status, note, order_id, updated_at";
/** คอลัมน์ที่เรียงได้ในแท็บเมล (ชื่อในหน้าจอ → คอลัมน์จริง) */
const INBOX_SORT: Record<string, string> = { received_at: "received_at", kind: "kind", order: "external_order_id", status: "status" };

/** รายการเมลทีละหน้า (ไม่ส่งเนื้อเมล) — เรียงที่ฐานข้อมูล · เรียงคอลัมน์อื่นแล้วตามด้วยเวลาเมลใหม่→เก่า */
export async function inboxPage(admin: Admin, sp: URLSearchParams) {
  const { page, size } = paging(sp, 50, 200);
  const status = (sp.get("status") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().replace(/[,()%*]/g, " ").slice(0, 60);
  const sortCol = INBOX_SORT[sp.get("sort") ?? ""] ?? "received_at";
  const asc = sp.get("dir") === "asc";
  let query = admin.from("platform_email_inbox").select(LIST_COLS, { count: "exact" })
    .order(sortCol, { ascending: asc, nullsFirst: false });
  if (sortCol !== "received_at") query = query.order("received_at", { ascending: false, nullsFirst: false });
  if (INBOX_STATUSES.includes(status)) query = query.eq("status", status);
  if (q) query = query.or(`subject.ilike.%${q}%,external_order_id.ilike.%${q}%,ref_no.ilike.%${q}%,note.ilike.%${q}%`);
  const { data, error, count } = await query.range(page * size, page * size + size - 1);
  if (error) throw new Error("โหลดรายการเมลไม่สำเร็จ กรุณาลองใหม่");
  return { rows: data ?? [], total: count ?? 0, page, size, error: null };
}
