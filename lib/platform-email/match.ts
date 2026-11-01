/**
 * 🔗 จับคู่ "สินค้าในเมลแพลตฟอร์ม" → SKU ใน ERP (pure — ทดสอบที่ lib/__tests__/platform-email-match.test.ts)
 *
 * ข้อเท็จจริงจากข้อมูลจริง (2026-10-27 + เมลจริงชุดแรก 2026-11-01):
 *   - ชื่อสินค้าบนร้านลงท้ายด้วยรหัสรุ่น เช่น "… Men's Wallet TTM061" → รุ่น TTM061
 *   - SKU ลูก = รหัสรุ่น-เลขสี (TTM061-04 · MGN350-01/1) · color_platform_th = "ดำ (04)" · ERP ไม่แยก SKU ตามไซซ์
 *   - ตัวเลือกบน Shopee เขียนได้หลายแบบ: "Black (04)" · "ดำ | 01" · "ดำ/น้ำตาล (01),L" · "Black#1,L" · "สีดำ-เทา | 236-02,S"
 *     · "ม่วงอ่อน-เทาอ่อน 01" · "เขียวขี้ม้า MCT09-08,S" (รหัสเต็มในตัวเลือก) · "สีดำ | MGN116,XL" (รุ่นในตัวเลือกต่างจากชื่อ)
 *     → หลังจุลภาคแรกคือไซซ์/ตัวเลือกพิมพ์ ไม่ใช้จับคู่
 *
 * ลำดับการจับคู่:
 *   rule   คนเคยยืนยันคู่นี้แล้ว
 *   exact  รหัสเต็มในตัวเลือก · หรือเลขสีชี้ SKU ได้ตัวเดียวและชื่อสีไม่ขัดกัน
 *          เลขที่เชื่อได้ "(04)" "| 04" "| 236-02" = ชื่อสีตรงบางคำก็พอ · เลขที่เชื่อได้น้อย "#1" "…สี 01" = ชื่อสีต้องตรงทุกคำ
 *   single รุ่นนั้นมี SKU เดียว และตัวเลือกไม่ได้บอกสี/เลขที่ขัดกัน
 *   guess  มีตัวที่น่าจะใช่ตัวเดียว แต่ข้อมูลขัดกัน (เช่น เลขบอก 18 แต่ชื่อสีไม่ตรง) → ยังไม่ผูกเอง ให้คนกดยืนยันครั้งแรก
 *   none   หาไม่เจอ → รอคนเลือกเอง
 * ผูกเองอัตโนมัติเฉพาะ rule / exact / single (AUTO_CONFIDENCE)
 */

export type SkuCandidate = {
  id: string;
  code: string;
  name_th?: string | null;
  color?: string | null;
  color_th?: string | null;
  color_platform_th?: string | null;
  color_platform_en?: string | null;
  is_active?: boolean | null;
};

/** model = คนยืนยันไว้ว่า "นับเป็นรุ่น (ไม่แยกสี)" → ผูกระดับรุ่น (parent) ไม่ผูก SKU */
export type MatchConfidence = "rule" | "model" | "exact" | "single" | "guess" | "none";
export const AUTO_CONFIDENCE: readonly MatchConfidence[] = ["rule", "exact", "single"];

export type ItemMatch = {
  confidence: MatchConfidence;
  /** ผูกแล้ว (rule/exact/single) · model = sku_id ว่าง แต่ sku_code = รหัสรุ่น */
  sku_id: string | null;
  sku_code: string | null;
  /** ผูกระดับรุ่น (model) */
  parent?: { id: string; code: string } | null;
  /** เดาไว้ให้คนยืนยัน (guess) */
  suggest: { id: string; code: string } | null;
  reason: string;
};

/** คู่ที่คนยืนยันไว้ — SKU (สีชัด) หรือ รุ่น (ไม่แยกสี) */
export type ConfirmedRule = { id: string; code: string; level?: "sku" | "model" };

/** รหัสรุ่นจากกุญแจจำคู่ ("m:BSD07|…" → BSD07) · กุญแจแบบชื่อเต็ม ("t:…") = ไม่มีรุ่น */
export function modelFromItemKey(key: string): string | null {
  return key.startsWith("m:") ? key.slice(2).split("|")[0] || null : null;
}

const norm = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** รหัสรุ่นท้ายชื่อสินค้า: คำสุดท้ายที่มีทั้งตัวพิมพ์ใหญ่และตัวเลข เช่น "… Baguette LYP14" → LYP14 */
export function modelCodeFromTitle(title: string | null | undefined): string | null {
  const tokens = [...String(title ?? "").matchAll(/[A-Za-z0-9][A-Za-z0-9\-_.]*/g)]
    .map((m) => m[0].replace(/[-_.]+$/, ""))
    .filter((t) => /[A-Z]/.test(t) && /\d/.test(t) && t.length >= 3);
  return tokens.length ? tokens[tokens.length - 1].toUpperCase() : null;
}

/** กุญแจจำคู่ที่คนยืนยัน: รุ่น + ตัวเลือก (ไม่มีรุ่น = ชื่อเต็ม + ตัวเลือก) */
export function itemKey(title: string, variant: string | null | undefined): string {
  const model = modelCodeFromTitle(title);
  return `${model ? `m:${model}` : `t:${norm(title)}`}|${norm(variant)}`;
}

/** ชื่อสีอังกฤษ (และทับศัพท์) → คำไทยที่ ERP ใช้ */
const COLOR_EN_TH: Record<string, string[]> = {
  black: ["ดำ"], white: ["ขาว"], brown: ["น้ำตาล"], navy: ["กรมท่า", "กรม"], blue: ["น้ำเงิน", "ฟ้า", "บลู"], beige: ["เบจ"],
  cream: ["ครีม"], red: ["แดง"], tan: ["แทน"], green: ["เขียว"], emerald: ["มรกต"], pink: ["ชมพู", "พิงค์"],
  grey: ["เทา"], gray: ["เทา"], yellow: ["เหลือง"], orange: ["ส้ม"], purple: ["ม่วง"], gold: ["ทอง"], silver: ["เงิน"],
  khaki: ["กากี"], ivory: ["งาช้าง"], lavender: ["ลาเวนเดอร์"], mint: ["มิ้นต์"], olive: ["เขียวขี้ม้า"],
};

export type VariantInfo = {
  /** ส่วนสี (ก่อนจุลภาคแรก) */
  colorPart: string;
  /** เลขสี เช่น "04" "01/1" */
  num: string | null;
  /** strong = (04) / | 04 / | 236-02 · weak = #1 / เลขท้ายคำ */
  strength: "strong" | "weak" | null;
  /** รหัส SKU เต็มที่เขียนในตัวเลือก เช่น MCT09-08 */
  fullCode: string | null;
  /** รหัสรุ่นที่เขียนในตัวเลือก เช่น MGN116 (มาก่อนรหัสในชื่อสินค้า) */
  models: string[];
  /** คำบอกสี (ตัวเล็ก ตัด "สี" นำหน้า) */
  words: string[];
};

/** แยกตัวเลือกเป็น เลขสี / รหัส / คำบอกสี */
export function parseVariant(variant: string | null | undefined): VariantInfo {
  const colorPart = String(variant ?? "").split(",")[0].trim();
  const upper = colorPart.toUpperCase();
  const full = /(?:^|[^A-Z0-9])([A-Z]{2,}\d{1,4}[A-Z]?)-(\d{1,3}(?:\/\d{1,2})?)(?![\d/])/.exec(upper);
  const models = uniq([...upper.matchAll(/(?:^|[^A-Z0-9])([A-Z]{2,}\d{1,4}[A-Z]?)(?![A-Z0-9])/g)].map((m) => m[1]));

  let num: string | null = null, strength: VariantInfo["strength"] = null, m: RegExpExecArray | null;
  if ((m = /\((\d{1,3}(?:\/\d{1,2})?)\)/.exec(colorPart))) { num = m[1]; strength = "strong"; }
  else if ((m = /\|\s*(?:\d{2,4}-)?(\d{1,3}(?:\/\d{1,2})?)(?![\d/])/.exec(colorPart))) { num = m[1]; strength = "strong"; }
  else if ((m = /#\s*(\d{1,3})(?!\d)/.exec(colorPart))) { num = m[1]; strength = "weak"; }
  else if ((m = /(?:^|\s)(\d{2})\s*$/.exec(colorPart))) { num = m[1]; strength = "weak"; }

  const words = colorPart
    .replace(/\([^)]*\)/g, " ").replace(/\|.*$/, " ").replace(/#\s*\d+/g, " ")
    .replace(/[A-Za-z]{2,}\d[A-Za-z0-9\-/]*/g, " ").replace(/\d+/g, " ")
    .toLowerCase().split(/[\s,/\-+|&]+/)
    .map((w) => w.replace(/^สี(?=.)/, "").trim())
    .filter((w) => w.length >= 2);
  return { colorPart, num, strength, fullCode: full ? `${full[1]}-${full[2]}` : null, models, words: uniq(words) };
}

/** รหัสรุ่นที่ต้องดึง SKU มาเทียบ (ตัวเลือกก่อน แล้วชื่อสินค้า) — ฝั่ง server ใช้เลือกว่าจะโหลด SKU ของรุ่นไหน */
export function modelsForItem(item: { title: string; variant: string | null }): string[] {
  const v = parseVariant(item.variant);
  const fullModel = v.fullCode ? v.fullCode.split("-")[0] : null;
  return uniq([fullModel, ...v.models, modelCodeFromTitle(item.title)].filter((x): x is string => !!x));
}

function candidateTokens(c: SkuCandidate): string[] {
  return uniq([c.color, c.color_th, c.color_platform_th, c.color_platform_en]
    .flatMap((x) => norm(x).split(/[\s,/\-+|&()]+/))
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t)));
}

function wordHit(w: string, tokens: string[]): boolean {
  const forms = [w, ...(COLOR_EN_TH[w] ?? [])];
  return forms.some((f) => tokens.some((t) => t.includes(f) || f.includes(t)));
}
const anyOverlap = (c: SkuCandidate, words: string[]) => { const t = candidateTokens(c); return words.some((w) => wordHit(w, t)); };
const allMatch = (c: SkuCandidate, words: string[]) => { const t = candidateTokens(c); return words.every((w) => wordHit(w, t)); };
const hasColor = (c: SkuCandidate) => candidateTokens(c).length > 0;

/** SKU ของรุ่น m ที่เลขสีตรง: "02" → m-02 (ไม่มี → m-02/1 ถ้ามีตัวเดียว) · "01/1" → m-01/1 */
function findByNumber(pool: SkuCandidate[], model: string, num: string): SkuCandidate | null {
  const [base, sub] = num.split("/");
  const want = parseInt(base, 10);
  const hits = pool.filter((c) => {
    const code = c.code.toUpperCase();
    if (!code.startsWith(`${model}-`)) return false;
    const s = /^(\d{1,3})(?:\/(\d{1,2}))?$/.exec(code.slice(model.length + 1));
    if (!s || parseInt(s[1], 10) !== want) return false;
    return sub ? s[2] === sub : true;
  });
  if (!sub) {
    const plain = hits.filter((c) => !c.code.includes("/"));
    if (plain.length === 1) return plain[0];
  }
  return hits.length === 1 ? hits[0] : null;
}

/**
 * จับคู่สินค้า 1 รายการ
 * @param candidates SKU ของทุกรุ่นใน modelsForItem(item) (code = รุ่น หรือขึ้นต้นด้วย "รุ่น-")
 * @param rule คู่ที่คนยืนยันไว้ (ถ้ามี)
 */
export function matchEmailItem(
  item: { title: string; variant: string | null },
  candidates: readonly SkuCandidate[],
  rule?: ConfirmedRule | null,
): ItemMatch {
  if (rule?.level === "model") {
    return { confidence: "model", sku_id: null, sku_code: rule.code, parent: { id: rule.id, code: rule.code }, suggest: null, reason: `นับเป็นรุ่น ${rule.code} (ไม่แยกสี) ตามที่ยืนยันไว้` };
  }
  if (rule) return { confidence: "rule", sku_id: rule.id, sku_code: rule.code, suggest: null, reason: "เคยยืนยันคู่นี้แล้ว" };

  const active = candidates.filter((c) => c.is_active !== false);
  const all = active.length ? active : [...candidates];
  const models = modelsForItem(item);
  const v = parseVariant(item.variant);
  const ok = (c: SkuCandidate, confidence: MatchConfidence, reason: string): ItemMatch =>
    ({ confidence, sku_id: c.id, sku_code: c.code, suggest: null, reason });
  const guess = (c: SkuCandidate, reason: string): ItemMatch =>
    ({ confidence: "guess", sku_id: null, sku_code: null, suggest: { id: c.id, code: c.code }, reason });
  const poolOf = (m: string) => all.filter((c) => { const u = c.code.toUpperCase(); return u === m || u.startsWith(`${m}-`); });
  const colorOf = (c: SkuCandidate) => c.color_platform_th ?? c.color ?? "ไม่มีชื่อสี";

  if (!all.length) {
    const m = modelCodeFromTitle(item.title);
    return { confidence: "none", sku_id: null, sku_code: null, suggest: null, reason: models.length ? `ไม่พบรหัส ${models.join(" / ")} ใน ERP` : (m ? `ไม่พบรหัส ${m} ใน ERP` : "ชื่อสินค้าไม่มีรหัสรุ่น") };
  }

  // 1) รหัส SKU เต็มเขียนอยู่ในตัวเลือก (MCT09-08)
  if (v.fullCode) {
    const hit = all.find((c) => c.code.toUpperCase() === v.fullCode);
    if (hit) return ok(hit, "exact", `ตัวเลือกมีรหัส ${hit.code}`);
  }
  // 2) รหัส SKU เต็มอยู่ในชื่อสินค้า
  const text = ` ${item.title} ${item.variant ?? ""} `.toUpperCase();
  const full = all.filter((c) => c.code.includes("-") && new RegExp(`[^A-Z0-9]${escapeRe(c.code.toUpperCase())}[^A-Z0-9/]`).test(text));
  if (full.length === 1) return ok(full[0], "exact", `เมลมีรหัส ${full[0].code}`);

  // 3) เลขสี
  if (v.num) {
    for (const m of models) {
      const hit = findByNumber(poolOf(m), m, v.num);
      if (!hit) continue;
      const fits = !v.words.length || !hasColor(hit) || (v.strength === "strong" ? anyOverlap(hit, v.words) : allMatch(hit, v.words));
      return fits
        ? ok(hit, "exact", `ตัวเลือก ${v.num} = ${hit.code}`)
        : guess(hit, `ตัวเลือก "${v.colorPart}" เลข ${v.num} = ${hit.code} แต่ใน ERP สีนี้ชื่อ "${colorOf(hit)}" — ช่วยยืนยัน`);
    }
  }

  // 4) รุ่นที่มี SKU เดียว
  for (const m of models) {
    const p = poolOf(m);
    if (p.length !== 1) continue;
    const only = p[0];
    const clash = (v.words.length && hasColor(only) && !anyOverlap(only, v.words)) || (v.num && !findByNumber(p, m, v.num));
    return clash
      ? guess(only, `รุ่นนี้มีตัวเดียว (${only.code} · ${colorOf(only)}) แต่ตัวเลือกในเมลคือ "${v.colorPart}" — ช่วยยืนยัน`)
      : ok(only, "single", `รุ่นนี้มี SKU เดียว (${only.code})`);
  }

  // 5) เดาจากชื่อสี (ในรุ่นแรกที่มี SKU)
  if (v.words.length) {
    for (const m of models) {
      const p = poolOf(m);
      if (!p.length) continue;
      const strict = p.filter((c) => allMatch(c, v.words));
      const loose = strict.length ? strict : p.filter((c) => anyOverlap(c, v.words));
      if (loose.length === 1) return guess(loose[0], `สี "${v.colorPart}" น่าจะเป็น ${loose[0].code} — ช่วยยืนยัน`);
      break;
    }
  }
  const firstPool = models.map(poolOf).find((p) => p.length) ?? all;
  return { confidence: "none", sku_id: null, sku_code: null, suggest: null, reason: `รุ่น ${models[0] ?? "?"} มี ${firstPool.length} สี เลือกจากเมลไม่ได้${item.variant ? "" : " (เมลไม่บอกตัวเลือก)"}` };
}

/** คิวในแท็บ "รอยืนยันสินค้า" — แยกจากผลจับคู่ที่เก็บไว้ (confidence + reason ที่ matchEmailItem เขียน)
 *  guess = ระบบเดาไว้ ให้คนยืนยัน · not_found = ไม่มีรหัสนี้ใน ERP / ชื่อไม่มีรหัสรุ่น · multi = มีหลายสี เลือกจากเมลไม่ได้ */
export type PendingQueue = "guess" | "multi" | "not_found";
export function pendingQueueOf(raw: { confidence?: unknown; reason?: unknown; suggest_sku_id?: unknown } | null | undefined): PendingQueue {
  if (raw?.suggest_sku_id) return "guess";
  const reason = String(raw?.reason ?? "");
  if (/^ไม่พบรหัส|^ชื่อสินค้าไม่มีรหัสรุ่น/.test(reason)) return "not_found";
  return "multi";
}
