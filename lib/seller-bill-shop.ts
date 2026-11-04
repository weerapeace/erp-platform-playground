/**
 * ของกลาง (pure) — หา "ร้านในทะเบียน" (partners_v2) จากข้อมูลร้านที่ AI อ่านได้ในบิลร้านจีน
 *   ใช้ตอนโยนรูปบิลในป๊อป "ออกใบสำคัญรับ" (ยังไม่รู้ว่าร้านไหน) — ระบบเสนอ คนยืนยันร้านเสมอ (ผูกร้านผิดอันตรายกว่าไม่ผูก)
 *   สัญญาณ (แรง → อ่อน): เลขบัญชีตรง · เบอร์ตรง · ชื่อจีนตรง (ชื่อจีนที่ร้านเคยใช้/จำไว้) · AI เลือก · ของในบิลตรงใบสั่งซื้อที่ค้างของร้านนั้น
 * เอกสาร: docs/seller-bill-match.md
 */
import { nameSimilarity } from "@/lib/text-similarity";
import { matchBillLines, type PoGroup, type SellerBillLine } from "@/lib/seller-bill-match";

export type ShopLite = {
  id: string;
  name: string;                    // display_name
  name_th?: string | null;
  name_en?: string | null;
  company_name?: string | null;    // ชื่อบริษัท — ร้านจีนใช้เก็บ "ชื่อจีนตามบิล"
  phone?: string | null;
  mobile?: string | null;
  account_number?: string | null;
};
export type BillShopInfo = { seller_name: string | null; seller_phone: string | null; seller_account: string | null; ai_shop: string | null; ai_conf: number | null };
export type ShopCandidate = { partner_id: string; name: string; score: number; reasons: string[] };

const s = (v: unknown) => String(v ?? "").trim();
const digits = (v: unknown) => s(v).replace(/\D+/g, "");
const hasCn = (v: string) => /[一-鿿]/.test(v);

/** เบอร์ในช่องเดียวอาจมีหลายเบอร์ ("138… / 0755-…") → แยกเป็นชุดตัวเลข ≥ 7 หลัก */
export function phoneNumbers(v: unknown): string[] {
  return s(v).split(/[,/;|、，\n]+|\s{2,}/).map(digits).filter((d) => d.length >= 7);
}
/** เบอร์ตรงกัน = 8 หลักท้ายเท่ากัน (ตัดรหัสประเทศ 86/ศูนย์นำหน้าได้) */
export function phoneMatch(a: unknown, b: unknown): boolean {
  const A = phoneNumbers(a), B = phoneNumbers(b);
  return A.some((x) => B.some((y) => x.slice(-8) === y.slice(-8)));
}
/** เลขบัญชีตรง = ตัวเลขเท่ากันทั้งหมด (≥ 8 หลัก) · บิลพิมพ์บางส่วน (มี * หรือ x) = 4 ตัวหน้า + 4 ตัวท้ายตรง */
export function accountMatch(bill: unknown, reg: unknown): "exact" | "partial" | null {
  const r = digits(reg); const raw = s(bill);
  if (r.length < 8 || !raw) return null;
  const b = digits(raw);
  if (b.length >= 8 && b === r) return "exact";
  if (/[*xX×•]/.test(raw)) {
    const parts = raw.split(/[*xX×•]+/).map(digits).filter(Boolean);
    const head = parts[0] ?? "", tail = parts[parts.length - 1] ?? "";
    if (head.length >= 4 && tail.length >= 4 && r.startsWith(head) && r.endsWith(tail)) return "partial";
  }
  return null;
}
/** ชื่อจีนของร้านในทะเบียน (ช่องไหนก็ได้ที่มีตัวจีน) */
export const shopCnNames = (p: ShopLite) => [p.company_name, p.name_en, p.name, p.name_th].map(s).filter((x) => x && hasCn(x));

/**
 * เรียงร้านที่น่าจะเป็นร้านในบิล (สูงสุด limit ร้าน) — ร้านที่ไม่มีสัญญาณเลยไม่ติดรายการ
 *   groupsByShop = ใบสั่งซื้อที่ค้างของแต่ละร้าน (ใช้ดูว่าของในบิลตรงกับ PO ร้านไหน)
 */
export function rankShops(info: BillShopInfo, lines: SellerBillLine[], shops: ShopLite[], groupsByShop: Map<string, PoGroup[]>, limit = 3): ShopCandidate[] {
  const items = lines.filter((l) => !l.is_fee && (l.name_cn || l.name_th));
  const out: ShopCandidate[] = [];
  for (const p of shops) {
    let raw = 0;
    const reasons: string[] = [];
    const acc = accountMatch(info.seller_account, p.account_number);
    if (acc === "exact") { raw += 6; reasons.push("เลขบัญชีตรง"); }
    else if (acc === "partial") { raw += 3.5; reasons.push("เลขบัญชีคล้าย (บางส่วน)"); }
    if (info.seller_phone && (phoneMatch(info.seller_phone, p.phone) || phoneMatch(info.seller_phone, p.mobile))) { raw += 4.5; reasons.push("เบอร์ตรง"); }
    const cn = s(info.seller_name);
    if (cn && hasCn(cn)) {
      const sim = Math.max(0, ...shopCnNames(p).map((x) => nameSimilarity(cn, x)));
      if (sim >= 0.5) { raw += 4 * sim; reasons.push("ชื่อจีนตรง"); }
    }
    if (info.ai_shop && info.ai_shop === p.id) { raw += 3 * Math.max(0.3, Math.min(1, Number(info.ai_conf ?? 0.6))); reasons.push("AI ว่าใช่"); }
    const gs = groupsByShop.get(p.id) ?? [];
    if (items.length && gs.length) {
      const m = matchBillLines(items, gs, []);
      const hits = m.filter((l) => l.match_key && (l.level === "ok" || l.reasons.includes("ราคาตรง"))).length;
      if (hits > 0) { raw += 3 * (hits / items.length); reasons.push(`ของตรง PO ${hits}/${items.length}`); }
    }
    if (raw > 0.9) out.push({ partner_id: p.id, name: p.name, score: Math.round(Math.min(0.99, 1 - Math.exp(-raw / 2.2)) * 100) / 100, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** เลือกร้านให้ล่วงหน้าได้ไหม — มั่นใจ ≥ 60% และทิ้งห่างร้านที่ 2 ≥ 15 จุด (ไม่งั้นให้คนเลือกเอง) */
export function autoPick(cands: ShopCandidate[]): ShopCandidate | null {
  const [a, b] = cands;
  if (!a || a.score < 0.6) return null;
  return !b || a.score - b.score >= 0.15 ? a : null;
}

/** สกุลในบิล → สกุลของใบ (หยวน = RMB เหมือนใบสั่งซื้อ) */
export function voucherCurrency(v: unknown): "RMB" | "THB" | "USD" {
  const c = s(v).toUpperCase();
  if (/THB|BAHT|฿|บาท/.test(c)) return "THB";
  if (/USD|\$/.test(c)) return "USD";
  return "RMB";
}
