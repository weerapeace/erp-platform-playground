// ============================================================
// ปรับรูปให้พอดีแพลตฟอร์ม (ของกลาง · ไม่มี I/O — ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์ · เทสต์ lib/__tests__/social-publish-fit.test.ts)
//  - pad  = เติมขอบ (ไม่ตัดรูป) สีขาว/ดำ/เบลอจากรูป/สีเอง
//  - crop = ครอปกลางรูป (ตัดขอบ)
//  ratio "auto" = แก้เฉพาะรูปที่สัดส่วนหลุดช่วงที่แพลตฟอร์มรับ (IG ฟีด 4:5–1.91:1) · ตัวเลข = บังคับทุกรูปเป็นสัดส่วนนั้น
// ใช้ที่ /api/post-image (?fit=&ar=&bg=) ตอนแพลตฟอร์มดึงรูป + ตัวอย่างในป๊อปโพสต์ (รูปเดียวกับที่จะขึ้นจริง)
// ============================================================

export type FitMode = "pad" | "crop";
export type FitSpec = { mode: FitMode; ratio: number | "auto"; bg: string };   // bg: white | black | blur | rrggbb

export const IG_FEED_RANGE: [number, number] = [0.8, 1.91];          // แนวตั้งสุด 4:5 · แนวนอนสุด 1.91:1
/** ค่าตั้งต้นของ IG ฟีด: เติมขอบขาว เฉพาะรูปที่ไม่ผ่าน — ตัวยิงใช้เสมอถ้าผู้ใช้ไม่ได้เลือกเอง (IG จะไม่ปฏิเสธเรื่องสัดส่วน) */
export const DEFAULT_IG_FIT: FitSpec = { mode: "pad", ratio: "auto", bg: "white" };

const HEX = /^[0-9a-f]{6}$/i;
const clampRatio = (r: number) => Math.min(2, Math.max(0.5, r));

/** ตรวจ/ทำความสะอาดค่าที่รับมา (จากหน้าเว็บ/คิว) — ไม่ถูกต้อง = null (ไม่ปรับ) */
export function sanitizeFit(v: unknown): FitSpec | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const mode: FitMode | null = o.mode === "pad" || o.mode === "crop" ? o.mode : null;
  if (!mode) return null;
  const ratio = o.ratio === "auto" ? "auto" : Number.isFinite(Number(o.ratio)) && Number(o.ratio) > 0 ? clampRatio(Number(o.ratio)) : null;
  if (ratio == null) return null;
  const bgRaw = String(o.bg ?? "white").replace(/^#/, "").toLowerCase();
  const bg = bgRaw === "white" || bgRaw === "black" || bgRaw === "blur" || HEX.test(bgRaw) ? bgRaw : "white";
  return { mode, ratio, bg };
}

/** ค่า → query string (?fit=pad&ar=0.8&bg=white) */
export function fitQuery(f: FitSpec): string {
  const ar = f.ratio === "auto" ? "auto" : String(Math.round(f.ratio * 10000) / 10000);
  return `fit=${f.mode}&ar=${ar}&bg=${encodeURIComponent(f.bg)}`;
}

/** query string → ค่า (ฝั่ง /api/post-image) */
export function parseFitQuery(sp: URLSearchParams): FitSpec | null {
  if (!sp.get("fit")) return null;
  const ar = sp.get("ar") ?? "auto";
  return sanitizeFit({ mode: sp.get("fit"), ratio: ar === "auto" ? "auto" : Number(ar), bg: sp.get("bg") ?? "white" });
}

/** สัดส่วนเป้าหมายของรูปนี้ — null = ไม่ต้องปรับ (auto + อยู่ในช่วงแล้ว · หรือเท่าเป้าอยู่แล้ว) */
export function fitTargetRatio(srcRatio: number, f: FitSpec, range: [number, number] = IG_FEED_RANGE): number | null {
  if (!(srcRatio > 0)) return null;
  const target = f.ratio === "auto" ? Math.min(range[1], Math.max(range[0], srcRatio)) : f.ratio;
  return Math.abs(target - srcRatio) < 0.005 ? null : target;
}

/** เติมขอบ: ขนาดผืนใหม่ + ตำแหน่งวางรูปเดิม (กึ่งกลาง) */
export function padBox(w: number, h: number, target: number): { width: number; height: number; left: number; top: number } {
  if (w / h > target) { const height = Math.round(w / target); return { width: w, height, left: 0, top: Math.round((height - h) / 2) }; }
  const width = Math.round(h * target); return { width, height: h, left: Math.round((width - w) / 2), top: 0 };
}

/** ครอปกลาง: กรอบที่ตัดออกมา */
export function cropBox(w: number, h: number, target: number): { width: number; height: number; left: number; top: number } {
  if (w / h > target) { const width = Math.round(h * target); return { width, height: h, left: Math.round((w - width) / 2), top: 0 }; }
  const height = Math.round(w / target); return { width: w, height, left: 0, top: Math.round((h - height) / 2) };
}

/** ชื่อสัดส่วนที่คนอ่านเข้าใจ (4:5, 2:3 …) */
export function ratioLabel(r: number): string {
  const known: [number, string][] = [[1, "1:1"], [0.8, "4:5"], [0.75, "3:4"], [0.667, "2:3"], [0.5625, "9:16"], [1.333, "4:3"], [1.5, "3:2"], [1.778, "16:9"], [1.91, "1.91:1"]];
  const hit = known.find(([v]) => Math.abs(v - r) < 0.02);
  return hit ? hit[1] : r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`;
}
