/**
 * ของกลาง (pure) — จับคู่ "รายการในบิลร้านจีน" กับ "บรรทัดใบสั่งซื้อของร้านเดียวกัน"
 *   ใช้ทั้ง server (ตอน AI อ่านเสร็จ) และหน้าเว็บ (โชว์เหตุผล/ป้ายความมั่นใจ) — ไม่มี import ฝั่ง server
 *
 * หลักคิด: จับได้เฉพาะของที่อยู่ในใบสั่งซื้อ (PO) ของร้านนี้เท่านั้น · ระบบเสนอ คนยืนยันทุกแถว
 *   คะแนนมาจาก: เคยจับคู่แล้ว (จำคู่) · AI เลือกให้ · ราคา ¥ ตรง PO · จำนวนตรง · ชื่อแปลไทยคล้าย · รหัส/เบอร์ตรง · ขนาด/สีขัดกัน = หักคะแนน
 * เอกสาร: docs/seller-bill-match.md
 */
import { nameSimilarity } from "@/lib/text-similarity";

export type MatchLevel = "ok" | "mid" | "no" | "fee";
export type LineDecision = "confirmed" | "skip" | "expense" | null;

/** 1 รายการในบิลร้าน (หลัง AI อ่าน + ผลจับคู่ + การตัดสินของคน) — เก็บใน purchase_delivery_bills.lines (kind=seller) */
export type SellerBillLine = {
  name_cn: string | null;
  spec_cn: string | null;
  name_th: string | null;
  spec_th: string | null;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  is_fee: boolean;                // ค่าส่งในจีน/ค่ากล่อง/ภาษี — ไม่จับกับ PO
  ai_pick: string | null;         // กลุ่มที่ AI เลือก (key)
  ai_conf: number | null;
  match_key: string | null;       // กลุ่มบรรทัด PO ที่จับคู่ (key) · null = ยังไม่เจอ
  level: MatchLevel;
  score: number;                  // 0..1 ความมั่นใจ (ไว้โชว์ %)
  reasons: string[];
  warns: string[];
  alias_hit: boolean;
  decision: LineDecision;         // confirmed = ใช่ · skip = ข้าม · expense = เพิ่มเป็นค่าใช้จ่าย (เฉพาะบรรทัดค่าใช้จ่าย)
  manual: boolean;                // คนเลือกจับคู่เอง
  voucher_line_ids: string[];     // บรรทัดในใบสำคัญที่สร้าง/อัปเดตจากแถวนี้ (หลังกดใส่ลงใบ)
  /** บิลลงน้อยกว่าที่ค้าง: keep = คงไว้รอส่วนที่เหลือ (ค่าเริ่ม) · reduce = ลดจำนวนในใบสั่งซื้อตามบิล */
  short_action: "keep" | "reduce" | null;
};

/** บรรทัด PO ย่อย (1 สินค้าในใบ PO อาจแตกหลายบรรทัดตามใบสั่งผลิต) */
export type PoGroupLine = { id: string; qty: number; remaining: number; qty_received?: number; sort_order: number; note: string | null; voucher_line_id: string | null; from_gr: boolean };

/** กลุ่มเป้าหมายการจับคู่ = สินค้า 1 ตัวใน PO 1 ใบ (รวมทุกบรรทัดของสินค้านั้นในใบ) */
export type PoGroup = {
  key: string;
  po_id: string;
  po_no: string;
  order_date: string | null;
  item_sku_id: string | null;
  code: string;
  item_name: string;              // ชื่อไม่มี [รหัส]
  name_cn: string | null;         // ชื่อจีนบนสินค้า (skus_v2.name_cn) — เติมจากบิลที่ยืนยันแล้ว
  uom: string | null;
  unit_price: number | null;      // ราคา/หน่วยใน PO (สกุลของ PO)
  qty_total: number;
  remaining: number;              // ยังไม่ได้ออกใบสำคัญ
  lines: PoGroupLine[];
  in_voucher: boolean;            // มีบรรทัดอยู่ในใบสำคัญนี้แล้ว (มาจากใบรับ/ใส่ไว้แล้ว)
  image_url: string | null;
};

export type AliasRow = { alias_key: string; item_sku_id: string | null; item_name: string | null };

const s = (v: unknown) => String(v ?? "").trim();
export const stripCode = (name: string) => s(name).replace(/^\s*\[[^\]]*\]\s*/, "").trim() || s(name);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** กุญแจจำคู่: ชื่อจีน + สเปก ตัดช่องว่าง/เครื่องหมาย/ตัวพิมพ์ + แปลงตัวอักษรเต็มความกว้าง (ｍｍ → mm) */
export function aliasKey(nameCn: unknown, specCn: unknown): string {
  return `${s(nameCn)}|${s(specCn)}`.normalize("NFKC").toLowerCase().replace(/[\s,，。.、:：;；'"“”‘’()（）【】\[\]\-_/\\]+/g, "");
}

/** กุญแจกลุ่ม = PO + (รหัสสินค้า หรือชื่อบรรทัด) */
export function groupKey(poId: string, skuId: string | null, itemName: string): string {
  return `${poId}|${skuId ? `s:${skuId}` : `n:${stripCode(itemName).toLowerCase().replace(/\s+/g, "")}`}`;
}

/** ของชิ้นเดียวกันไหม (ข้าม PO) — ใช้ตอนจำคู่ / หา PO อื่นที่มีของเดียวกัน */
export function sameItem(a: { item_sku_id: string | null; item_name: string | null }, b: { item_sku_id: string | null; item_name: string | null }): boolean {
  if (a.item_sku_id && b.item_sku_id) return a.item_sku_id === b.item_sku_id;
  if (a.item_sku_id || b.item_sku_id) return false;
  return stripCode(s(a.item_name)).toLowerCase().replace(/\s+/g, "") === stripCode(s(b.item_name)).toLowerCase().replace(/\s+/g, "") && !!s(a.item_name);
}

// ── สัญญาณจากข้อความ ──
/** ขนาดในชื่อ → มม. (9mm / 0.9 cm / 2ซม. / 9 มิล) */
export function sizesMm(text: string): number[] {
  const t = s(text).normalize("NFKC").toLowerCase();
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(mm|มม\.?|มิล|cm|ซม\.?|ซ\.ม\.?|厘米|毫米|公分|cm\.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const v = Number(m[1]); if (!Number.isFinite(v) || v <= 0) continue;
    const u = m[2];
    out.push(round(/cm|ซม|ซ\.ม|厘米|公分/.test(u) ? v * 10 : v, 2));
  }
  return [...new Set(out)];
}

const COLOR_WORDS: [string, RegExp][] = [
  ["nickel", /นิเกิ้ล|นิกเกิล|镍|白镍/],
  ["gun", /รมดำ|枪|黑镍/],
  ["silver", /สีเงิน|银/],
  ["gold", /สีทอง|ทองอ่อน|金色|浅金|^金|金$/],
  ["black", /สีดำ|黑色|^黑|黑$/],
  ["white", /สีขาว|白色/],
  ["cream", /ครีม|米白|米色/],
  ["red", /สีแดง|红/],
  ["pink", /ชมพู|粉/],
  ["blue", /สีฟ้า|蓝/],
  ["navy", /กรมท่า|สีกรม|藏青|深蓝/],
  ["brown", /น้ำตาล|咖啡|棕/],
  ["green", /สีเขียว|绿/],
  ["yellow", /สีเหลือง|黄/],
  ["purple", /ม่วง|紫/],
  ["gray", /สีเทา|灰/],
];
/** สีหลักในข้อความ (ชุดเล็ก ๆ ไว้จับ "สีขัดกัน") — ไม่ต้องครบ ใช้ประกอบคะแนนเท่านั้น */
export function colorsOf(text: string): string[] {
  const t = s(text);
  const out: string[] = [];
  for (const [k, re] of COLOR_WORDS) if (re.test(t)) out.push(k);
  // "ดำ" ในคำว่า "รมดำ" ไม่นับเป็นดำ
  return out.includes("gun") ? out.filter((c) => c !== "black") : out;
}

/** รหัส/เบอร์ที่มีตัวเลข (G322, #402, NO.5, K-9260) — ตรงกัน = สัญญาณแรง */
export function codeTokens(text: string): string[] {
  const t = s(text).normalize("NFKC").toUpperCase();
  const out = new Set<string>();
  for (const m of t.matchAll(/[A-Z]*-?\d+[A-Z0-9]*/g)) {
    const v = m[0].replace(/-/g, "");
    if (/^\d+(MM|CM|M)$/.test(v)) continue;   // ขนาด (9MM, 2CM) ไม่ใช่รหัส — ดูแยกที่ sizesMm
    if (v.length >= 3 || /[A-Z]/.test(v)) out.add(v);
  }
  return [...out];
}

const priceEq = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, b * 0.02);

type Scored = { score: number; reasons: string[]; warns: string[]; alias: boolean };

/** คะแนนดิบของ 1 รายการในบิล กับ 1 กลุ่ม PO (มากกว่า = ใช่มากกว่า) */
export function scoreCandidate(line: SellerBillLine, g: PoGroup, ctx: { aliases: AliasRow[]; aiGroup: PoGroup | null }): Scored {
  let score = 0;
  const reasons: string[] = [];
  const warns: string[] = [];
  const key = aliasKey(line.name_cn, line.spec_cn);
  const alias = ctx.aliases.some((a) => a.alias_key === key && sameItem(a, g));
  if (alias) { score += 4; reasons.push("เคยจับคู่แล้ว"); }

  const conf = Math.max(0.3, Math.min(1, Number(line.ai_conf ?? 0.6)));
  if (line.ai_pick && line.ai_pick === g.key) { score += 3 * conf; reasons.push("AI ว่าใช่"); }
  else if (ctx.aiGroup && ctx.aiGroup.key !== g.key && sameItem(ctx.aiGroup, g)) { score += 2.6 * conf; reasons.push("AI ว่าใช่"); }   // ของเดียวกันคนละ PO

  // ชื่อจีนบนสินค้า (เติมจากบิลที่เคยยืนยัน — ร้านอื่นก็ได้) เทียบกับชื่อจีนในบิลตรง ๆ
  const cn = `${s(line.name_cn)} ${s(line.spec_cn)}`.trim();
  if (cn && g.name_cn) {
    const cnSim = nameSimilarity(cn, g.name_cn);
    if (cnSim >= 0.5) { score += 2.5 * cnSim; reasons.push("ชื่อจีนตรง"); }
  }

  const th = `${s(line.name_th)} ${s(line.spec_th)}`.trim();
  const sim = th ? nameSimilarity(th, g.item_name) : 0;
  if (sim >= 0.35) { score += 1.5 * sim; if (sim >= 0.6 && !reasons.includes("AI ว่าใช่")) reasons.push("ชื่อคล้าย"); }

  // รหัส/เบอร์ (G322, #402) ที่ตรงกัน
  const billCodes = codeTokens(`${s(line.name_cn)} ${s(line.spec_cn)} ${th}`);
  const poCodes = codeTokens(`${g.code} ${g.item_name}`);
  if (billCodes.some((c) => poCodes.includes(c))) { score += 1; reasons.push("เบอร์/รหัสตรง"); }

  // ขนาด/สีขัดกัน = น่าจะคนละตัว
  const bSize = sizesMm(`${s(line.spec_cn)} ${s(line.name_cn)} ${th}`), gSize = sizesMm(g.item_name);
  if (bSize.length && gSize.length) {
    if (bSize.some((x) => gSize.some((y) => Math.abs(x - y) < 0.05))) score += 0.6;
    else { score -= 1.5; warns.push("ขนาดไม่ตรง"); }
  }
  const bCol = colorsOf(`${s(line.spec_cn)} ${s(line.name_cn)} ${th}`), gCol = colorsOf(g.item_name);
  if (bCol.length && gCol.length) {
    if (bCol.some((c) => gCol.includes(c))) score += 0.5;
    else { score -= 1.2; warns.push("สีไม่ตรง"); }
  }

  const bp = Number(line.unit_price ?? 0), gp = Number(g.unit_price ?? 0);
  if (bp > 0 && gp > 0) {
    if (priceEq(bp, gp)) { score += 1.2; reasons.push("ราคาตรง"); }
    else { if (Math.abs(bp - gp) / gp > 0.3) score -= 0.4; warns.push(`บิล ¥${fmt(bp)} · PO ¥${fmt(gp)}`); }
  }
  const q = Number(line.qty ?? 0);
  if (q > 0) {
    if (Math.abs(q - g.remaining) < 0.001 || Math.abs(q - g.qty_total) < 0.001) { score += 0.6; reasons.push("จำนวนตรง"); }
    else if (g.remaining > 0 && q > g.remaining) warns.push(`เกินที่ค้าง (ค้าง ${fmt(g.remaining)})`);
    else if (g.remaining > 0 && q < g.remaining) warns.push(`ส่งมา ${fmt(q)} จากที่ค้าง ${fmt(g.remaining)}`);
    else if (g.remaining <= 0 && !g.in_voucher) warns.push("ออกใบสำคัญครบแล้ว");
  }
  return { score, reasons, warns, alias };
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** คะแนนดิบ → ความมั่นใจ 0..0.99 */
export const confidenceOf = (raw: number) => Math.min(0.99, Math.max(0, 1 - Math.exp(-raw / 1.6)));
export const MATCH_MIN_SCORE = 1.2;     // ต่ำกว่านี้ = ไม่เจอ (ให้เลือกเอง)
export const MATCH_OK_SCORE = 3.2;      // สูงกว่านี้ + (ราคาตรง หรือ เคยจับคู่) = มั่นใจ

/** ใส่ผลของกลุ่มที่เลือกแล้วลงแถว (ใช้ทั้งตอนจับอัตโนมัติและตอนคนเลือกเอง) */
export function applyGroupToLine(line: SellerBillLine, g: PoGroup | null, groups: PoGroup[], aliases: AliasRow[], manual = false): SellerBillLine {
  if (line.is_fee) return { ...line, match_key: null, level: "fee", score: 0, reasons: [], warns: [], alias_hit: false, manual: false };
  if (!g) return { ...line, match_key: null, level: "no", score: 0, reasons: [], warns: [], alias_hit: false, manual: false };
  const aiGroup = line.ai_pick ? groups.find((x) => x.key === line.ai_pick) ?? null : null;
  const sc = scoreCandidate(line, g, { aliases, aiGroup });
  const others = groups.filter((x) => x.key !== g.key && sameItem(x, g) && x.remaining > 0).length;
  const notes = others > 0 ? [`มีใน ${others + 1} PO`] : [];
  const okish = sc.reasons.includes("ราคาตรง") || sc.alias || sc.reasons.includes("ชื่อจีนตรง");
  const level: MatchLevel = manual ? "mid" : sc.score >= MATCH_OK_SCORE && okish && !sc.warns.some((w) => /ขนาด|สี/.test(w)) ? "ok" : "mid";
  // % ต้องสอดคล้องกับป้าย: มั่นใจ ≥ 80% · ให้เช็ก ≤ 79%
  const conf = confidenceOf(sc.score);
  return {
    ...line, match_key: g.key, level, score: manual ? 1 : round(level === "ok" ? Math.max(conf, 0.8) : Math.min(conf, 0.79), 2),
    reasons: manual ? sc.reasons.filter((r) => r === "ราคาตรง" || r === "จำนวนตรง") : sc.reasons,   // ป้าย "เลือกเอง" อยู่ที่ LevelBadge แล้ว
    warns: [...sc.warns, ...notes], alias_hit: sc.alias, manual,
  };
}

/** จับคู่ทุกแถวในบิลกับกลุ่ม PO ของร้านนี้ (ไม่แตะแถวที่คนตัดสินแล้ว) */
export function matchBillLines(lines: SellerBillLine[], groups: PoGroup[], aliases: AliasRow[]): SellerBillLine[] {
  const out = lines.map((line) => {
    if (line.decision || line.manual) return line;
    if (line.is_fee) return applyGroupToLine(line, null, groups, aliases);
    const aiGroup = line.ai_pick ? groups.find((x) => x.key === line.ai_pick) ?? null : null;
    let best: { g: PoGroup; sc: number } | null = null;
    for (const g of groups) {
      const { score } = scoreCandidate(line, g, { aliases, aiGroup });
      if (score < MATCH_MIN_SCORE) continue;
      // เสมอกัน → PO ที่มีของค้างก่อน แล้วค่อย PO เก่าก่อน
      if (!best || score > best.sc + 1e-9 || (Math.abs(score - best.sc) < 1e-9 && tieBreak(g, best.g) < 0)) best = { g, sc: score };
    }
    return applyGroupToLine(line, best?.g ?? null, groups, aliases);
  });
  // แถวที่จับกลุ่มเดียวกันซ้ำ → เตือน (ยังยอมให้ ถ้าบิลแยกบรรทัดจริง)
  const seen = new Map<string, number>();
  return out.map((l, i) => {
    if (!l.match_key) return l;
    const first = seen.get(l.match_key);
    if (first == null) { seen.set(l.match_key, i); return l; }
    return { ...l, level: l.level === "ok" ? "mid" : l.level, warns: [...l.warns, `ซ้ำกับแถวที่ ${first + 1}`] };
  });
}
const tieBreak = (a: PoGroup, b: PoGroup) => (b.remaining > 0 ? 1 : 0) - (a.remaining > 0 ? 1 : 0) || s(a.order_date).localeCompare(s(b.order_date));

/** แบ่งจำนวนในบิลลงบรรทัด PO ย่อยของกลุ่ม — ใบสั่งผลิตเก่าก่อน (ตามลำดับบรรทัด) · เกินที่ค้าง = ใส่บรรทัดสุดท้าย */
export function distributeQty(qty: number, lines: PoGroupLine[]): { id: string; qty: number }[] {
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
  if (!(qty > 0) || sorted.length === 0) return [];
  let left = qty;
  const out: { id: string; qty: number }[] = [];
  for (const l of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, l.remaining));
    if (take > 0) { out.push({ id: l.id, qty: round(take, 4) }); left = round(left - take, 4); }
  }
  if (left > 0) {
    const tail = out.length ? out[out.length - 1] : null;
    if (tail) tail.qty = round(tail.qty + left, 4);
    else out.push({ id: sorted[0].id, qty: round(left, 4) });
  }
  return out;
}

/** ตรวจตัวเลขในบิล: จำนวน × ราคา = ยอด ทุกแถว + ผลรวม = ยอดรวมบิล */
export function checkBillMath(lines: SellerBillLine[], total: number | null): { rowsBad: number[]; sum: number; totalOk: boolean | null } {
  const rowsBad: number[] = [];
  let sum = 0;
  lines.forEach((l, i) => {
    const q = Number(l.qty ?? 0), p = Number(l.unit_price ?? 0), a = l.amount == null ? null : Number(l.amount);
    const calc = q * p;
    sum += a ?? calc;
    if (a != null && q > 0 && p > 0 && Math.abs(calc - a) > Math.max(0.05, a * 0.01)) rowsBad.push(i);
  });
  sum = Math.round(sum * 100) / 100;
  return { rowsBad, sum, totalOk: total == null || !(total > 0) ? null : Math.abs(sum - total) <= Math.max(0.5, total * 0.005) };
}

/** ชื่อจีนที่จะเติมให้สินค้า = ชื่อ + สเปกตามบิล (เช่น "狗扣 9mm 银色") · ว่าง = ไม่เติม */
export function cnNameForSku(line: Pick<SellerBillLine, "name_cn" | "spec_cn">): string | null {
  const v = `${s(line.name_cn)} ${s(line.spec_cn)}`.replace(/\s+/g, " ").trim();
  return v && /[一-鿿]/.test(v) ? v.slice(0, 200) : null;
}

/** แถวที่ยังไม่ได้ตัดสิน (ต้องเป็น 0 ก่อนใส่ลงใบ) */
export const undecidedCount = (lines: SellerBillLine[]) =>
  lines.filter((l) => !(l.decision === "skip" || l.decision === "expense" || (l.decision === "confirmed" && (l.match_key || l.is_fee)))).length;

/** แปลงแถวจาก AI/DB ให้ครบช่อง (กันข้อมูลเก่าหรือ AI ตอบไม่ครบ) */
export function normalizeBillLine(r: Record<string, unknown>): SellerBillLine {
  const n = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const x = Number(String(v).replace(/[,，\s¥￥]/g, "")); return Number.isFinite(x) ? x : null; };
  const t = (v: unknown) => s(v) || null;
  const dec = r.decision === "confirmed" || r.decision === "skip" || r.decision === "expense" ? r.decision : null;
  return {
    name_cn: t(r.name_cn), spec_cn: t(r.spec_cn), name_th: t(r.name_th), spec_th: t(r.spec_th),
    qty: n(r.qty), unit: t(r.unit), unit_price: n(r.unit_price), amount: n(r.amount),
    is_fee: r.is_fee === true, ai_pick: t(r.ai_pick), ai_conf: n(r.ai_conf),
    match_key: t(r.match_key), level: (["ok", "mid", "no", "fee"].includes(String(r.level)) ? r.level : r.is_fee === true ? "fee" : "no") as MatchLevel,
    score: n(r.score) ?? 0, reasons: Array.isArray(r.reasons) ? (r.reasons as unknown[]).map(String) : [], warns: Array.isArray(r.warns) ? (r.warns as unknown[]).map(String) : [],
    alias_hit: r.alias_hit === true, decision: dec, manual: r.manual === true,
    voucher_line_ids: Array.isArray(r.voucher_line_ids) ? (r.voucher_line_ids as unknown[]).map(String).filter(Boolean) : [],
    short_action: r.short_action === "reduce" ? "reduce" : r.short_action === "keep" ? "keep" : null,
  };
}

// ── ของที่ร้านส่งไม่ครบ ──

/** บิลลงน้อยกว่าที่ค้างในใบสั่งซื้อไหม → จำนวนที่ขาด (0 = ไม่ขาด) */
export function shortfallOf(line: Pick<SellerBillLine, "qty" | "is_fee" | "match_key">, g: PoGroup | null | undefined): number {
  if (!g || line.is_fee || !line.match_key) return 0;
  const q = Number(line.qty ?? 0);
  return q > 0 && g.remaining - q > 0.0001 ? round(g.remaining - q, 4) : 0;
}

/** จำนวนที่ยังค้างรับ (สั่ง − รับแล้ว) ของกลุ่ม */
export const pendingReceiveOf = (g: PoGroup) => round(g.lines.reduce((a, l) => a + Math.max(0, l.qty - Number(l.qty_received ?? 0)), 0), 4);

/**
 * "ไม่อยู่ในบิล" — ของในใบสั่งซื้อของร้านนี้ที่ยังค้างรับ แต่บิลนี้ไม่มี (ร้านยังไม่มีของ)
 *   scope "bill" = เฉพาะ PO เดียวกับรายการที่จับคู่ในบิล (ค่าเริ่ม) · "shop" = ของค้างรับทั้งร้าน
 */
export function missingGroups(lines: SellerBillLine[], groups: PoGroup[], scope: "bill" | "shop" = "bill"): PoGroup[] {
  const used = new Set(lines.filter((l) => l.match_key && l.decision !== "skip").map((l) => l.match_key as string));
  const gMap = new Map(groups.map((g) => [g.key, g]));
  const pos = new Set([...used].map((k) => gMap.get(k)?.po_id).filter((x): x is string => !!x));
  return groups.filter((g) => !used.has(g.key) && (scope === "shop" || pos.has(g.po_id)) && pendingReceiveOf(g) > 0 && g.lines.some((l) => !l.from_gr));
}

/**
 * แผน "ลดจำนวนในใบสั่งซื้อตามบิล" ของ 1 กลุ่ม — แบ่งจำนวนบิลลงบรรทัดเหมือนตอนใส่ลงใบ (ใบสั่งผลิตเก่าก่อน)
 *   จำนวนใหม่ต่อบรรทัด = ที่ออกใบสำคัญใบอื่นไปแล้ว + ที่ได้จากบิลนี้ (ไม่ต่ำกว่าที่รับแล้ว)
 *   ได้ 0 = ปิดยอดบรรทัดนั้น (ใบสั่งซื้อตั้งจำนวน 0 ไม่ได้) · เท่าเดิม = ไม่แตะ
 */
export function reducePlan(billQty: number, g: PoGroup): { line_qty: { id: string; from: number; qty: number }[]; close: string[] } {
  const alloc = new Map(distributeQty(billQty, g.lines).map((a) => [a.id, a.qty]));
  const out = { line_qty: [] as { id: string; from: number; qty: number }[], close: [] as string[] };
  for (const l of g.lines) {
    const billedElsewhere = Math.max(0, l.qty - l.remaining);
    const next = round(Math.max(billedElsewhere + (alloc.get(l.id) ?? 0), Number(l.qty_received ?? 0)), 4);
    if (next >= l.qty - 0.0001) continue;
    if (next <= 0) out.close.push(l.id);
    else out.line_qty.push({ id: l.id, from: l.qty, qty: next });
  }
  return out;
}
