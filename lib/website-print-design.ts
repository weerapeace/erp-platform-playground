/**
 * 🖨 ลายรีดบนกระเป๋า (DTF/UV) — กฎกลาง pure ใช้ทั้ง ERP และเว็บร้าน
 *
 * ลูกค้าเลือกลายจากคลังของร้าน หรืออัปรูปเอง → วางบน "ส่วนที่พิมพ์ได้" ของรุ่น
 * (กรอบบนรูปสินค้าเป็น % + ขนาดจริงเป็น ซม.) → ราคาเพิ่มตามขนาดลาย เล็ก/กลาง/ใหญ่
 *
 * ⚠️ มิเรอร์ทั้งไฟล์: ERP lib/website-print-design.ts ↔ เว็บร้าน src/lib/print-design.ts (ต้องเหมือนกันทุกตัวอักษร)
 * ราคาจริงคิดซ้ำที่ ERP ตอนบันทึกแบบ (lib/website-print-design-server) — ฝั่งเว็บใช้โชว์เท่านั้น
 * คู่มือ: docs/website-print-design.md
 */

export type PrintMethod = "DTF" | "UV";
export const PRINT_METHODS: readonly PrintMethod[] = ["DTF", "UV"];
export type PrintTier = "S" | "M" | "L";
/** ด้านยาวสุดของลาย (ซม.) ไม่เกินค่านี้ = ขนาดนั้น · เกิน M = ใหญ่ */
export const PRINT_TIER_MAX_CM: Record<"S" | "M", number> = { S: 8, M: 15 };
/** ความชัดของรูปลูกค้าตามขนาดที่วางจริง: ≥ GOOD = คม · ≥ MIN = พอใช้ · ต่ำกว่า = ไม่ชัด */
export const PRINT_DPI_GOOD = 250;
export const PRINT_DPI_MIN = 150;
/** ด้านยาวสุดของลายต้องไม่ต่ำกว่านี้ (ซม.) */
export const PRINT_MIN_CM = 1.5;
export const PRINT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const PRINT_UPLOAD_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];
export const PRINT_MAX_ZONES = 6;
export const PRINT_MAX_PER_ZONE = 12;
export const PRINT_MAX_LIBRARY_SETS = 10;

export type PrintZone = {
  /** a-z 0-9 - (≤20) */
  id: string;
  label: string;
  labelEn: string;
  /** รูปที่ใช้วาง (R2 key ใน ERP) · ว่าง = รูปแรกของสินค้า */
  imageKey: string | null;
  /** เว็บร้านได้ URL รูปจาก API (ERP ไม่เก็บ) */
  imageUrl?: string;
  /** กรอบพื้นที่พิมพ์บนรูป เป็น % ของกว้าง/สูงรูป */
  x: number;
  y: number;
  w: number;
  h: number;
  /** ขนาดจริงของกรอบ (ซม.) */
  widthCm: number;
  heightCm: number;
};

/** ชุดลายจากคลังไฟล์ (อัลบั้มใน assets) ที่ให้ลูกค้าเลือก + ราคาเพิ่มต่อ 1 ลาย */
export type PrintLibrarySet = { collectionId: string; label: string; labelEn: string; extra: number };

export type PrintDesignConfig = {
  enabled: boolean;
  /** ร้านกำหนดวิธีพิมพ์ต่อรุ่น (ตามวัสดุ) */
  method: PrintMethod;
  /** ราคาเพิ่มต่อ 1 ลาย ตามขนาด (บาท) */
  prices: Record<PrintTier, number>;
  maxPerZone: number;
  allowUpload: boolean;
  library: PrintLibrarySet[];
  zones: PrintZone[];
};

export const DEFAULT_PRINT_DESIGN: PrintDesignConfig = {
  enabled: false,
  method: "DTF",
  prices: { S: 40, M: 70, L: 110 },
  maxPerZone: 6,
  allowUpload: true,
  library: [],
  zones: [],
};

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return v === null || v === "" || !Number.isFinite(n) ? d : n;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const baht = (v: unknown, d: number) => Math.round(clamp(num(v, d), 0, 100000));

/** ส่วนพิมพ์ใหม่ (ค่าเริ่ม: กลางรูป 50×40% = 25×15 ซม.) */
export function newPrintZone(index: number): PrintZone {
  return { id: `z${index + 1}`, label: index === 0 ? "ด้านหน้า" : `ส่วนที่ ${index + 1}`, labelEn: index === 0 ? "Front" : "", imageKey: null, x: 25, y: 30, w: 50, h: 40, widthCm: 25, heightCm: 15 };
}

export function normalizePrintZone(raw: unknown, index: number): PrintZone {
  const z = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const x = clamp(num(z.x, 25), 0, 99);
  const y = clamp(num(z.y, 30), 0, 99);
  return {
    id: str(z.id, 20).toLowerCase().replace(/[^a-z0-9-]/g, "") || `z${index + 1}`,
    label: str(z.label, 40) || `ส่วนที่ ${index + 1}`,
    labelEn: str(z.labelEn, 40),
    imageKey: str(z.imageKey, 400) || null,
    ...(typeof z.imageUrl === "string" && z.imageUrl ? { imageUrl: z.imageUrl.slice(0, 1200) } : {}),
    x: r2(x),
    y: r2(y),
    w: r2(clamp(num(z.w, 50), 1, 100 - x)),
    h: r2(clamp(num(z.h, 40), 1, 100 - y)),
    widthCm: r1(clamp(num(z.widthCm, 25), 2, 120)),
    heightCm: r1(clamp(num(z.heightCm, 15), 2, 120)),
  };
}

export function normalizePrintDesign(raw: unknown): PrintDesignConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = (r.prices && typeof r.prices === "object" ? r.prices : {}) as Record<string, unknown>;
  const zones: PrintZone[] = [];
  const ids = new Set<string>();
  for (const z0 of Array.isArray(r.zones) ? r.zones : []) {
    if (zones.length >= PRINT_MAX_ZONES) break;
    const z = normalizePrintZone(z0, zones.length);
    if (ids.has(z.id)) z.id = `${z.id}-${zones.length + 1}`;
    ids.add(z.id);
    zones.push(z);
  }
  const library: PrintLibrarySet[] = [];
  for (const s0 of Array.isArray(r.library) ? r.library : []) {
    const s = (s0 && typeof s0 === "object" ? s0 : {}) as Record<string, unknown>;
    const collectionId = str(s.collectionId, 40);
    if (!collectionId || library.some((x) => x.collectionId === collectionId) || library.length >= PRINT_MAX_LIBRARY_SETS) continue;
    library.push({ collectionId, label: str(s.label, 40), labelEn: str(s.labelEn, 40), extra: baht(s.extra, 0) });
  }
  return {
    enabled: r.enabled === true,
    method: r.method === "UV" ? "UV" : "DTF",
    prices: { S: baht(p.S, 40), M: baht(p.M, 70), L: baht(p.L, 110) },
    maxPerZone: clamp(Math.round(num(r.maxPerZone, 6)), 1, PRINT_MAX_PER_ZONE),
    allowUpload: r.allowUpload !== false,
    library,
    zones,
  };
}

/** เปิดอยู่ + มีส่วนพิมพ์ + มีทางให้ลูกค้าเพิ่มลาย (คลังหรืออัปรูป) */
export function printDesignUsable(cfg: PrintDesignConfig | null | undefined): cfg is PrintDesignConfig {
  return !!cfg && cfg.enabled && cfg.zones.length > 0 && (cfg.allowUpload || cfg.library.length > 0);
}

/** ขนาดกรอบหลังหมุน (ซม.) */
export function rotatedBox(w: number, h: number, rot: number): { bw: number; bh: number } {
  const a = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { bw: w * c + h * s, bh: w * s + h * c };
}

/** องศา → −180..180 */
export function normRot(rot: number): number {
  const r = ((Math.round(Number(rot) || 0) % 360) + 540) % 360;
  return r - 180;
}

type Geo = { x: number; y: number; w: number; h: number; rot: number };

/**
 * จัดลายให้อยู่ในส่วนพิมพ์: ย่อถ้าใหญ่เกิน · ไม่ต่ำกว่าขนาดเล็กสุด · เลื่อนให้กรอบหลังหมุนอยู่ในพื้นที่ทั้งชิ้น
 * (ตัวออกแบบเรียกทุกครั้งที่ลาก/ย่อ/หมุน · ERP เรียกซ้ำตอนบันทึก)
 */
export function fitPlacement<T extends Geo>(p: T, zone: { widthCm: number; heightCm: number }): T {
  const ar = p.w > 0 ? p.h / p.w : 1;
  let w = p.w;
  const long = Math.max(1, ar);
  if (w * long < PRINT_MIN_CM) w = PRINT_MIN_CM / long;
  let { bw, bh } = rotatedBox(w, w * ar, p.rot);
  const k = Math.min(1, zone.widthCm / bw, zone.heightCm / bh);
  if (k < 1) {
    w *= k;
    bw *= k;
    bh *= k;
  }
  return {
    ...p,
    w: r2(w),
    h: r2(w * ar),
    x: r2(clamp(p.x, bw / 2, zone.widthCm - bw / 2)),
    y: r2(clamp(p.y, bh / 2, zone.heightCm - bh / 2)),
  };
}

export function printTierOf(w: number, h: number): PrintTier {
  const m = Math.max(w, h);
  return m <= PRINT_TIER_MAX_CM.S ? "S" : m <= PRINT_TIER_MAX_CM.M ? "M" : "L";
}

/** ความชัดของรูปที่กว้าง pxW พิกเซล เมื่อพิมพ์กว้าง cm · goodCm = กว้างสุดที่ยังคม */
export function printQuality(pxW: number, cm: number): { level: "ok" | "warn" | "bad"; dpi: number; goodCm: number } {
  const dpi = Math.round(pxW / (Math.max(0.1, cm) / 2.54));
  return { level: dpi >= PRINT_DPI_GOOD ? "ok" : dpi >= PRINT_DPI_MIN ? "warn" : "bad", dpi, goodCm: r1((pxW / PRINT_DPI_GOOD) * 2.54) };
}

export type PrintPlacement = {
  zone: string;
  kind: "lib" | "upload";
  /** ลายคลังร้าน: id ไฟล์ในคลัง (assets) */
  assetId?: string;
  /** รูปลูกค้า: ที่อยู่ในที่เก็บส่วนตัว + ขนาดพิกเซลจริง + มีพื้นใสไหม */
  upload?: { path: string; w: number; h: number; alpha: boolean };
  name: string;
  /** กึ่งกลางลาย ห่างขอบซ้าย/บนของส่วนพิมพ์ (ซม.) */
  x: number;
  y: number;
  /** ขนาดลายก่อนหมุน (ซม.) */
  w: number;
  h: number;
  rot: number;
};

/** ลายในคลังที่ลูกค้าเลือกได้ (API สาธารณะส่งให้เว็บ) · ar 0 = คลังไม่ได้บันทึกขนาดรูป (เว็บวัดจากรูปจริงเอง) */
export type PrintLibraryItem = { id: string; name: string; url: string; ar: number; extra: number; set: string };

/** ar null = ไม่รู้สัดส่วน (ไฟล์ในคลังไม่มีกว้าง/สูง) → ใช้สัดส่วนที่หน้าเว็บวัดจากรูป */
export type PrintLibLookup = (assetId: string) => { ar: number | null; extra: number; name: string } | null;

/** สัดส่วน สูง/กว้าง ที่ยอมรับ (กันค่าแปลก) */
export const clampPrintAr = (ar: number) => (Number.isFinite(ar) && ar > 0 ? Math.min(20, Math.max(0.05, ar)) : 1);

/**
 * ตรวจ + จัดลายที่ลูกค้าวาง (ERP ใช้ตอนบันทึกแบบ) — สัดส่วนลายยึดจากไฟล์จริง ไม่เชื่อตัวเลขจากหน้าเว็บ
 * lib = ลายในชุดที่ร้านเปิดให้เลือก · uploadOk = ไฟล์อยู่ในที่เก็บของร้านจริง
 */
export function normalizePlacements(
  raw: unknown,
  cfg: PrintDesignConfig,
  ctx: { lib: PrintLibLookup; uploadOk: (path: string) => boolean },
): { ok: true; placements: PrintPlacement[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return { ok: false, error: "ยังไม่ได้วางลาย" };
  if (list.length > cfg.zones.length * cfg.maxPerZone) return { ok: false, error: "ลายเกินจำนวนที่ร้านกำหนด" };
  const out: PrintPlacement[] = [];
  const perZone = new Map<string, number>();
  for (const p0 of list) {
    const p = (p0 && typeof p0 === "object" ? p0 : {}) as Record<string, unknown>;
    const zone = cfg.zones.find((z) => z.id === p.zone);
    if (!zone) return { ok: false, error: "ส่วนที่วางลายไม่มีแล้ว ลองโหลดหน้าใหม่" };
    const n = (perZone.get(zone.id) ?? 0) + 1;
    if (n > cfg.maxPerZone) return { ok: false, error: `${zone.label} ใส่ได้สูงสุด ${cfg.maxPerZone} ลาย` };
    perZone.set(zone.id, n);
    let ar: number;
    let name: string;
    let extra: Pick<PrintPlacement, "assetId" | "upload">;
    if (p.kind === "lib") {
      const assetId = str(p.assetId, 40);
      const hit = assetId ? ctx.lib(assetId) : null;
      if (!hit) return { ok: false, error: "มีลายที่ร้านปิดไปแล้ว เอาลายนั้นออกแล้วลองใหม่" };
      ar = hit.ar ?? clampPrintAr(num(p.h, 0) / num(p.w, 0));
      name = hit.name;
      extra = { assetId };
    } else if (p.kind === "upload") {
      if (!cfg.allowUpload) return { ok: false, error: "รุ่นนี้ไม่รับรูปที่อัปเอง" };
      const u = (p.upload && typeof p.upload === "object" ? p.upload : {}) as Record<string, unknown>;
      const path = str(u.path, 300);
      const pw = Math.round(num(u.w, 0));
      const ph = Math.round(num(u.h, 0));
      if (!path || !ctx.uploadOk(path)) return { ok: false, error: "ไม่พบรูปที่อัปโหลด ลองอัปใหม่อีกครั้ง" };
      if (pw < 1 || ph < 1 || pw > 30000 || ph > 30000) return { ok: false, error: "ขนาดรูปไม่ถูกต้อง" };
      ar = ph / pw;
      name = str(p.name, 60) || "รูปของฉัน";
      extra = { upload: { path, w: pw, h: ph, alpha: u.alpha === true } };
    } else return { ok: false, error: "ชนิดลายไม่ถูกต้อง" };
    const w = num(p.w, 5);
    const geo = fitPlacement({ x: num(p.x, zone.widthCm / 2), y: num(p.y, zone.heightCm / 2), w: w > 0 ? w : 5, h: (w > 0 ? w : 5) * (ar > 0 ? ar : 1), rot: normRot(num(p.rot, 0)) }, zone);
    out.push({ zone: zone.id, kind: p.kind, ...extra, name, ...geo });
  }
  return { ok: true, placements: out };
}

/** ราคาเพิ่มของ 1 ลาย = ราคาตามขนาด + ราคาเพิ่มของชุดลาย (คลังร้าน) */
export function printPlacementPrice(cfg: PrintDesignConfig, p: Pick<PrintPlacement, "w" | "h">, extra = 0): number {
  return (cfg.prices[printTierOf(p.w, p.h)] ?? 0) + Math.max(0, extra);
}

/** ราคาเพิ่มรวมทั้งแบบ (ต่อ 1 ใบ) */
export function printDesignExtra(cfg: PrintDesignConfig, placements: PrintPlacement[], lib: PrintLibLookup): number {
  return placements.reduce((sum, p) => sum + printPlacementPrice(cfg, p, p.kind === "lib" && p.assetId ? lib(p.assetId)?.extra ?? 0 : 0), 0);
}

export function printDesignLabel(method: PrintMethod, count: number, lang: "th" | "en" = "th"): string {
  return lang === "en" ? `${method} print ×${count}` : `ลายรีด ${method} ${count} ลาย`;
}

/* ── รหัสบรรทัดในตะกร้าเว็บร้าน: "<ตัวเลือก>[#pz:…]#pd:<id แบบ>:<ราคาเพิ่ม>:<จำนวนลาย>" (ต่อท้ายสุดเสมอ) ── */
export const PRINT_LINE_SEP = "#pd:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function printLineSuffix(id: string, extra: number, count: number): string {
  return `${PRINT_LINE_SEP}${id}:${Math.max(0, Math.round(extra))}:${Math.max(0, Math.round(count))}`;
}

export function splitPrintLine(lineId: string): { rest: string; design: { id: string; extra: number; count: number } | null } {
  const i = lineId.indexOf(PRINT_LINE_SEP);
  if (i < 0) return { rest: lineId, design: null };
  const [id, extra, count] = lineId.slice(i + PRINT_LINE_SEP.length).split(":");
  const ok = UUID_RE.test(id ?? "");
  return { rest: lineId.slice(0, i), design: ok ? { id: id!, extra: Math.max(0, Number(extra) || 0), count: Math.max(0, Number(count) || 0) } : null };
}
