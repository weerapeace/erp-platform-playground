/**
 * ตั้ง "ส่งเป็นของขวัญ" บน LINE (ฝั่งเซิร์ฟเวอร์) — ช่วงทดลอง (เจ้าของอนุมัติทดสอบ 2026-11-10)
 * คู่มือ API (openapi สำเนา woraphol-j/lineshopping-api-mcp) มี giftOption / giftGroups แค่ในคำตอบ ไม่มีในคำขอ
 *   → ลองส่งทีละรูปแบบผ่าน PATCH /products/{id} (แนบชื่อเดิมไปด้วย) แล้วดึงสินค้ากลับมาเทียบ — ตรง = สำเร็จ หยุด
 *   รูปแบบที่ใช้ได้จริงจดลงประวัติ (shape) → รู้แล้วค่อยตัดรูปแบบอื่นทิ้ง
 * ไม่สำเร็จ = ไม่พัง แค่บอกให้ไปตั้งใน LINE Seller Center เอง
 *
 * ⚠️ ผลทดสอบ 2026-11-10 (LMTS05 #1004276913 · audit line_listing_gift): ทั้ง 3 รูปแบบ LINE ตอบ 200 แต่ค่าไม่เปลี่ยน
 *   = LINE ไม่รับการตั้งของขวัญผ่าน API → ตัวช่วยลงสินค้า/ลิ้นชักไม่เรียกตัวนี้แล้ว (แค่เตือนให้ตั้งเอง)
 *   เก็บไว้ให้ /api/line-shopping/listing-gift ทดสอบซ้ำ ถ้า LINE เพิ่ม API ภายหลัง
 */
import { LINE_SHOPPING_BASE, lineGetProduct } from "@/lib/line-shopping";
import { giftFromLine, giftGroupIds, giftOptionOf, sameGift, type GiftSetting } from "@/lib/line-gift";

const SHAPES: { key: string; build: (opt: string, ids: number[]) => Record<string, unknown> }[] = [
  { key: "giftGroups[{id}]", build: (opt, ids) => ({ giftOption: opt, giftGroups: ids.map((id) => ({ id })) }) },
  { key: "giftGroups[id]", build: (opt, ids) => ({ giftOption: opt, giftGroups: ids }) },
  { key: "giftGroupIds", build: (opt, ids) => ({ giftOption: opt, giftGroupIds: ids }) },
];

async function rawPatch(apiKey: string, productId: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const r = await fetch(`${LINE_SHOPPING_BASE}/products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json", "User-Agent": "ERP-Playground (LINE SHOPPING connector)" },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status, text: r.ok ? "" : (await r.text().catch(() => "")).slice(0, 300) };
  } catch (e) { return { ok: false, status: 0, text: (e as Error).message }; }
}

export type LineGiftResult = { ok: boolean; shape: string | null; now: GiftSetting | null; error: string | null; tried: { shape: string; status: number; note: string }[] };

/** ตั้งของขวัญให้ตรงกับ want · ตรงอยู่แล้ว = ไม่ส่ง */
export async function lineSetGift(apiKey: string, productId: string, want: GiftSetting): Promise<LineGiftResult> {
  const cur = await lineGetProduct(apiKey, productId);
  if (!cur.ok || !cur.row) return { ok: false, shape: null, now: null, error: cur.error || "ดึงสินค้าจาก LINE ไม่ได้", tried: [] };
  if (sameGift(giftFromLine(cur.row), want)) return { ok: true, shape: "ตรงอยู่แล้ว", now: giftFromLine(cur.row), error: null, tried: [] };
  const name = String(cur.row.name ?? "").trim();
  const opt = giftOptionOf(want.status);
  const ids = want.status === "off" ? [] : giftGroupIds(want.categories);
  const tried: LineGiftResult["tried"] = [];
  let now: GiftSetting | null = giftFromLine(cur.row);
  for (const s of SHAPES) {
    const p = await rawPatch(apiKey, productId, { ...(name ? { name } : {}), ...s.build(opt, ids) });
    if (!p.ok) { tried.push({ shape: s.key, status: p.status, note: p.text }); continue; }
    const g = await lineGetProduct(apiKey, productId);
    now = g.row ? giftFromLine(g.row) : now;
    if (now && sameGift(now, want)) { tried.push({ shape: s.key, status: p.status, note: "ตรง" }); return { ok: true, shape: s.key, now, error: null, tried }; }
    tried.push({ shape: s.key, status: p.status, note: "LINE รับคำขอแต่ค่าไม่เปลี่ยน" });
  }
  return { ok: false, shape: null, now, error: "LINE ไม่รับการตั้งของขวัญผ่าน API — ตั้งเองใน LINE Seller Center", tried };
}
