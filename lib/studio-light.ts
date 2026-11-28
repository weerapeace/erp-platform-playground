/**
 * 🎬 สตูดิโอจำลอง — กติกาแสงกลาง (ไม่มี React · ใช้ได้ทั้งหน้าเว็บ ทดสอบ และ API ตอนบันทึกชุดไฟ)
 *   ตัววาด = components/lesson-anim/studio-lab.tsx (สตูดิโอเต็ม) · studio.tsx (ฉากสอนไฟดวงเดียว ใช้สีแสงจากไฟล์นี้)
 *
 * หลักฟิสิกส์ที่ใช้ (ประมาณให้เห็นความต่างชัด ไม่ใช่เรนเดอร์จริง):
 *   - แสงลดตามระยะยกกำลังสอง (inverse-square): ถอยไฟ 2 เท่า แสงเหลือ 1/4
 *   - ความนุ่ม = ขนาดแหล่งแสง ÷ ระยะ (ขนาดที่ "เห็น" จากตัวแบบ) — ใหญ่/ใกล้ = นุ่ม · เล็ก/ไกล = แข็ง
 *   - แสงนุ่ม "ห่อ" ตัวแบบมากกว่า (wrap) → เส้นแบ่งแสงเงาไล่เนียน · แสงแข็ง = ตัดคม
 *   - สีแสงตามเคลวิน + ไวต์บาลานซ์กล้อง (ไฟสองสีในฉากเดียว → สองฝั่งสีต่างกัน)
 *   - Flag บังเฉพาะเส้นทางแสงที่ผ่านแผ่นจริง (คิดจากผังบน) · รีเฟล็กสะท้อนแสงของไฟทุกดวงกลับ · V-flat ดำดูดแสงสะท้อนในห้อง
 *   - ฉากหลังได้แสงตามระยะไฟ→ฉาก + มุมลำแสง (grid/snoot ลำแคบ แทบไม่หกโดนฉาก)
 *   - เงาสะท้อนบนของเงา (กระเป๋าหนังเงา) = รูปทรงของตัวปรับแสง · แววตา (catchlight) ก็เช่นกัน
 * คู่มือ docs/studio-sim.md
 */

export type LightType = "cob" | "panel" | "tube" | "flash" | "window";
export type ModifierKey = "bare" | "softbox" | "strip" | "octa" | "umbrella" | "dish" | "grid" | "snoot" | "barn" | "diff" | "window";
export type ControlKind = "refl-white" | "refl-silver" | "refl-gold" | "vflat" | "flag";
export type SubjectKind = "bag" | "face" | "half" | "full";
export type BagShape = "tote" | "cross" | "round";
export type BagMaterial = "gloss" | "matte" | "fabric";
export type Backdrop = "white" | "gray" | "black" | "blue";

/** ไฟหนึ่งดวง · a = มุมรอบตัวแบบ (0 = ข้างกล้อง · + = ขวาของภาพ · ±180 = หลังตัวแบบ) · d = ระยะ (ม.) · h = มุมสูง (องศา, + = สูงกว่าตัวแบบ) */
export type StudioLight = { id: string; kind: "light"; type: LightType; mod: ModifierKey; a: number; d: number; h: number; power: number; k: number };
/** ตัวคุมแสง (รีเฟล็ก / V-flat / Flag) · วางด้วย a, d แบบเดียวกับไฟ */
export type StudioControl = { id: string; kind: ControlKind; a: number; d: number };
export type StudioItem = StudioLight | StudioControl;

export type StudioSetup = {
  subject: SubjectKind;
  bag: { shape: BagShape; material: BagMaterial; color: string };
  skin: "light" | "tan" | "deep";
  backdrop: Backdrop;
  bgDist: number;        // ระยะตัวแบบ → ฉากหลัง (ม.)
  lens: number;          // ทางยาวโฟกัส (มม.)
  camA: number;          // ตำแหน่งกล้องรอบตัวแบบ (องศา) · 0 = ตรงหน้า
  camH: number;          // มุมกล้องสูง/ต่ำ (องศา)
  wb: "auto" | number;   // ไวต์บาลานซ์กล้อง
  ambient: number;       // แสงในห้อง 0-1 (ปิดไฟห้อง = 0)
  items: StudioItem[];
};

// ───────── ตารางอุปกรณ์ ─────────

/** output = ความแรงเทียบ COB 100% ไฟเปล่า ที่ 1 ม. */
export const LIGHT_TYPES: Record<LightType, { label: string; output: number; k: number; note: string; gear: string }> = {
  cob: { label: "ไฟ COB", output: 1, k: 5600, note: "ไฟ LED ดวงเดียวแรง ๆ ใส่ตัวปรับแสงได้ทุกแบบ — ไฟหลักยอดนิยม", gear: "ไฟ COB (หัว Bowens)" },
  panel: { label: "LED panel", output: 0.45, k: 5600, note: "แผงไฟแบน แสงกึ่งนุ่มในตัว ไม่ค่อยแรง เหมาะเป็นไฟเสริม", gear: "ไฟ LED panel" },
  tube: { label: "ไฟแท่ง (Tube)", output: 0.25, k: 5600, note: "ไฟแท่งยาว ใช้ทำแสงขอบ/แถบสะท้อนยาวบนสินค้าเงา หรือเป็นไฟในเฟรม", gear: "ไฟแท่ง LED tube" },
  flash: { label: "แฟลชสตูดิโอ", output: 2.5, k: 5500, note: "แรงมากแต่วาบเดียว หยุดการเคลื่อนไหวได้ — ดูผลจริงต้องกดถ่าย (ไฟนำทางช่วยเล็ง)", gear: "แฟลชสตูดิโอ + ทริกเกอร์" },
  window: { label: "แสงหน้าต่าง", output: 1.3, k: 5600, note: "แสงธรรมชาติจากหน้าต่าง ใหญ่และนุ่ม แต่ความแรง/สีเปลี่ยนตามเวลาและอากาศ", gear: "หน้าต่าง (+ ผ้าม่านขาวถ้าแดดแรง)" },
};

/** size = ขนาดหน้าแสง (ม.) · eff = แสงที่เหลือหลังผ่านตัวปรับแสง · spread = ครึ่งมุมลำแสง (องศา) · shape = ทรงจุดสะท้อน/แววตา */
export const MODIFIERS: Record<ModifierKey, { label: string; size: number; eff: number; spread: number; shape: "dot" | "rect" | "strip" | "round" | "ring" | "window"; note: string }> = {
  bare: { label: "ไฟเปล่า", size: 0.1, eff: 1, spread: 60, shape: "dot", note: "แสงแข็งสุด เงาคม จุดสะท้อนเล็กจ้า" },
  softbox: { label: "Softbox 60×90", size: 0.8, eff: 0.5, spread: 50, shape: "rect", note: "กล่องผ้า แสงนุ่ม คุมทิศได้ดี แววตาเป็นสี่เหลี่ยม" },
  strip: { label: "Strip box 30×120", size: 0.6, eff: 0.45, spread: 45, shape: "strip", note: "ซอฟต์บ็อกซ์ยาวแคบ — ทำแสงขอบ (rim) และแถบสะท้อนยาวบนของเงา" },
  octa: { label: "Octa 120", size: 1.2, eff: 0.45, spread: 55, shape: "round", note: "ซอฟต์บ็อกซ์แปดเหลี่ยมใหญ่ นุ่มมาก แววตากลมเป็นธรรมชาติ — ถ่ายคนยอดนิยม" },
  umbrella: { label: "ร่มทะลุ", size: 1, eff: 0.55, spread: 75, shape: "round", note: "ราคาถูก นุ่ม แต่แสงกระจายทั่วห้อง คุมยาก" },
  dish: { label: "Beauty dish", size: 0.55, eff: 0.7, spread: 40, shape: "ring", note: "จานสะท้อน แสงกึ่งแข็ง คมชัดแต่ไม่กระด้าง — งานบิวตี้/แฟชั่น" },
  grid: { label: "Softbox + Grid", size: 0.7, eff: 0.4, spread: 22, shape: "rect", note: "ตาข่ายหน้าซอฟต์บ็อกซ์ แสงยังนุ่มแต่ลำแคบ ไม่หกโดนฉากหลัง" },
  snoot: { label: "Snoot", size: 0.05, eff: 0.3, spread: 8, shape: "dot", note: "กรวยบีบลำแสงเป็นวงเล็ก ส่องเฉพาะจุด" },
  barn: { label: "Barn doors", size: 0.15, eff: 0.9, spread: 30, shape: "dot", note: "บานพับ 4 ด้าน ตัดขอบลำแสงไม่ให้โดนที่ไม่ต้องการ" },
  diff: { label: "ผ้า Diffuser 1.5 ม.", size: 1.5, eff: 0.4, spread: 70, shape: "rect", note: "ผ้าขาวขึงหน้าไฟ ทำแหล่งแสงใหญ่มาก — ไล่แสงเนียนบนสินค้าเงา" },
  window: { label: "บานหน้าต่าง", size: 1.6, eff: 1, spread: 80, shape: "window", note: "หน้าต่างคือซอฟต์บ็อกซ์ธรรมชาติ แววตาเห็นเป็นกรอบหน้าต่าง" },
};

export const CONTROLS: Record<ControlKind, { label: string; albedo: number; k: number | null; note: string; gear: string }> = {
  "refl-white": { label: "รีเฟล็กขาว", albedo: 0.28, k: null, note: "สะท้อนแสงนุ่ม ๆ กลับเข้าด้านเงา เปิดเงาให้อ่อนลงแบบธรรมชาติ", gear: "รีเฟล็กขาว (หรือโฟมบอร์ดขาว)" },
  "refl-silver": { label: "รีเฟล็กเงิน", albedo: 0.45, k: null, note: "สะท้อนแรงและคมกว่าขาว เพิ่มประกาย", gear: "รีเฟล็กเงิน" },
  "refl-gold": { label: "รีเฟล็กทอง", albedo: 0.4, k: 3000, note: "สะท้อนแสงอุ่นออกทอง ผิวดูสุขภาพดี — ใช้น้อย ๆ", gear: "รีเฟล็กทอง" },
  vflat: { label: "V-flat ดำ", albedo: -0.1, k: null, note: "แผ่นดำ (negative fill) ดูดแสงสะท้อนในห้อง ด้านเงาเข้มขึ้น ภาพมีมิติ", gear: "V-flat ดำ (โฟมบอร์ดดำพับ)" },
  flag: { label: "Flag", albedo: 0, k: null, note: "แผ่นทึบบังแสงเฉพาะทาง — กันแสงหกโดนฉากหลัง/เลนส์", gear: "Flag ผ้าดำ + ขาตั้ง C-stand" },
};

export const BACKDROPS: Record<Backdrop, { label: string; rgb: [number, number, number] }> = {
  white: { label: "ฉากขาว", rgb: [242, 242, 240] },
  gray: { label: "ฉากเทา", rgb: [128, 128, 126] },
  black: { label: "ฉากดำ", rgb: [22, 22, 22] },
  blue: { label: "ฉากน้ำเงิน", rgb: [52, 88, 140] },
};

export const SUBJECTS: Record<SubjectKind, { label: string; person: boolean }> = {
  bag: { label: "สินค้า (กระเป๋า)", person: false },
  face: { label: "คน · ใกล้ (หน้า)", person: true },
  half: { label: "คน · ครึ่งตัว", person: true },
  full: { label: "คน · เต็มตัว", person: true },
};
export const BAG_SHAPES: Record<BagShape, string> = { tote: "ทรงโท้ท (หูหิ้ว)", cross: "สะพายข้าง (ฝาพับ)", round: "ทรงกลม" };
export const BAG_MATERIALS: Record<BagMaterial, { label: string; gloss: number }> = {
  gloss: { label: "หนังเงา", gloss: 1 }, matte: { label: "หนังด้าน", gloss: 0.25 }, fabric: { label: "ผ้า", gloss: 0 },
};
export const BAG_COLORS = ["#1c1c1c", "#7a3b16", "#b5262b", "#e9e4da", "#2f4a6b"];
export const SKIN: Record<StudioSetup["skin"], [number, number, number]> = { light: [236, 196, 170], tan: [205, 152, 116], deep: [140, 94, 66] };

// ───────── ค่าเริ่ม + ตรวจค่า ─────────

let seq = 0;
export const newId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

export function defaultSetup(): StudioSetup {
  return {
    subject: "bag", bag: { shape: "tote", material: "gloss", color: "#7a3b16" }, skin: "tan",
    backdrop: "gray", bgDist: 1.2, lens: 85, camA: 0, camH: 5, wb: "auto", ambient: 0.1,
    items: [
      { id: "k1", kind: "light", type: "cob", mod: "softbox", a: 45, d: 1.4, h: 30, power: 100, k: 5600 },
      { id: "f1", kind: "light", type: "panel", mod: "umbrella", a: -50, d: 2, h: 10, power: 40, k: 5600 },
    ],
  };
}

export const newLight = (a = -60): StudioLight => ({ id: newId(), kind: "light", type: "panel", mod: "softbox", a, d: 1.6, h: 20, power: 60, k: 5600 });
export const newControl = (kind: ControlKind, a = -70): StudioControl => ({ id: newId(), kind, a, d: kind === "flag" ? 0.9 : 0.8 });

const num = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const pick = <T extends string>(v: unknown, keys: readonly T[], dflt: T): T => (keys.includes(v as T) ? (v as T) : dflt);
export const MAX_ITEMS = 10;

/** ตรวจ/ซ่อมชุดไฟจากที่เก็บหรือจาก API — ค่าผิดใช้ค่าเริ่ม · ไฟ/ตัวคุมไม่เกิน MAX_ITEMS */
export function cleanSetup(v: unknown): StudioSetup {
  const d = defaultSetup();
  if (!v || typeof v !== "object") return d;
  const o = v as Record<string, unknown>;
  const bag = (o.bag ?? {}) as Record<string, unknown>;
  const items: StudioItem[] = (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS).flatMap((x): StudioItem[] => {
    if (!x || typeof x !== "object") return [];
    const it = x as Record<string, unknown>;
    const id = typeof it.id === "string" && it.id ? it.id.slice(0, 40) : newId();
    const a = num(it.a, -180, 180, 0), dd = num(it.d, 0.3, 4, 1.5);
    if (it.kind === "light") {
      const type = pick(it.type, Object.keys(LIGHT_TYPES) as LightType[], "cob");
      return [{ id, kind: "light", type, mod: pick(it.mod, Object.keys(MODIFIERS) as ModifierKey[], "softbox"), a, d: dd, h: num(it.h, -40, 85, 20), power: num(it.power, 5, 100, 80), k: num(it.k, 2700, 7500, 5600) }];
    }
    const kind = pick(it.kind, Object.keys(CONTROLS) as ControlKind[], "refl-white");
    return [{ id, kind, a, d: dd }];
  });
  return {
    subject: pick(o.subject, Object.keys(SUBJECTS) as SubjectKind[], d.subject),
    bag: { shape: pick(bag.shape, Object.keys(BAG_SHAPES) as BagShape[], d.bag.shape), material: pick(bag.material, Object.keys(BAG_MATERIALS) as BagMaterial[], d.bag.material), color: typeof bag.color === "string" && /^#[0-9a-f]{6}$/i.test(bag.color) ? bag.color : d.bag.color },
    skin: pick(o.skin, ["light", "tan", "deep"] as const, d.skin),
    backdrop: pick(o.backdrop, Object.keys(BACKDROPS) as Backdrop[], d.backdrop),
    bgDist: num(o.bgDist, 0.3, 4, d.bgDist), lens: num(o.lens, 24, 200, d.lens), camA: num(o.camA, -90, 90, 0), camH: num(o.camH, -30, 45, d.camH),
    wb: o.wb === "auto" ? "auto" : num(o.wb, 2700, 7500, 5600), ambient: num(o.ambient, 0, 1, d.ambient),
    items,
  };
}

// ───────── สี ─────────

const K_STOPS: [number, [number, number, number]][] = [[2700, [255, 172, 98]], [3200, [255, 190, 126]], [4300, [255, 224, 190]], [5600, [255, 248, 242]], [6500, [222, 234, 255]], [7500, [210, 222, 255]]];
/** สีของแสงตามเคลวิน (ประมาณจากตารางสีวัตถุดำ) — 3200K ส้ม · 5600K ขาว · 6500K+ ฟ้า */
export function kelvinRgb(k: number): [number, number, number] {
  for (let i = 1; i < K_STOPS.length; i++) {
    const [k1, c1] = K_STOPS[i];
    if (k <= k1) { const [k0, c0] = K_STOPS[i - 1]; const t = Math.max(0, (k - k0) / (k1 - k0)); return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * t)) as [number, number, number]; }
  }
  return K_STOPS[K_STOPS.length - 1][1];
}

// ───────── คำนวณแสง ─────────

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export type V3 = [number, number, number];   // x = ขวาของภาพ · y = ขึ้น · z = เข้าหากล้อง

/** ตำแหน่งในผังบน (เมตร): x ขวา, z เข้าหากล้อง · ตัวแบบอยู่ (0,0) */
export const planXZ = (a: number, d: number): [number, number] => [d * Math.sin(rad(a)), d * Math.cos(rad(a))];

/** ทิศจากตัวแบบไปหาไฟ ในมุมมองกล้อง (หักมุมกล้องออก) */
export function lightDir(l: { a: number; h: number }, camA: number): V3 {
  const ar = rad(l.a - camA), hr = rad(l.h);
  return [Math.sin(ar) * Math.cos(hr), Math.sin(hr), Math.cos(ar) * Math.cos(hr)];
}

function segCross(p1: [number, number], p2: [number, number], q1: [number, number], q2: [number, number]): boolean {
  const o = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return o(p1, p2, q1) * o(p1, p2, q2) < 0 && o(q1, q2, p1) * o(q1, q2, p2) < 0;
}
/** แผ่น flag ในผังบน = เส้นยาว 0.6 ม. ตั้งฉากกับทิศไปหาตัวแบบ */
function flagSeg(c: StudioControl): [[number, number], [number, number]] {
  const [x, z] = planXZ(c.a, c.d); const r = rad(c.a); const px = Math.cos(r) * 0.3, pz = -Math.sin(r) * 0.3;
  return [[x - px, z - pz], [x + px, z + pz]];
}

export type LightResult = {
  id: string; dir: V3; e: number;          // แสงถึงตัวแบบ (สัมพัทธ์)
  soft: number;                            // 0 แข็ง → 1 นุ่มมาก (ขนาดที่เห็น ÷ ระยะ)
  apparent: number;                        // ขนาดที่เห็น (เรเดียนโดยประมาณ)
  rgb: [number, number, number]; blocked: boolean; bgE: number; shape: (typeof MODIFIERS)[ModifierKey]["shape"]; front: boolean;
};

export type StudioResult = {
  lights: LightResult[];
  bounce: { dir: V3; e: number; rgb: [number, number, number] }[];
  fillFloor: number;                        // แสงสะท้อนรอบห้อง (ลดลงด้วย V-flat)
  bgE: number; bgRgb: [number, number, number];
  keyId: string | null;
  exposure: number;                         // ตัวคูณให้ไฮไลต์สินค้าพอดี (กล้องวัดแสงให้)
  wbRgb: [number, number, number];
  ratio: number | null;                     // อัตราส่วนด้านสว่าง : ด้านมืด
  fstop: { f: number; label: string } | null;
  softness: number;                         // ความนุ่มรวม (ถ่วงตามความแรง)
};

/** ความสว่างที่ผิวหนึ่งจุด (normal n) ได้รับ — ไฟนุ่ม "ห่อ" รอบตัวแบบได้มากกว่า (wrap lighting) */
export function shadeAt(r: StudioResult, n: V3, opts?: { skipBlocked?: boolean }): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  const add = (dir: V3, e: number, c: [number, number, number], wrap: number) => {
    const dot = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2];
    const w = Math.max(0, (dot + wrap) / (1 + wrap));
    for (let j = 0; j < 3; j++) out[j] += (e * w * c[j]) / 255;
  };
  for (const l of r.lights) if (!(opts?.skipBlocked && l.blocked)) add(l.dir, l.e, l.rgb, l.soft * 0.45);
  for (const b of r.bounce) add(b.dir, b.e, b.rgb, 0.6);
  for (let j = 0; j < 3; j++) out[j] += r.fillFloor;
  return out;
}

const F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];

export function computeStudio(s: StudioSetup): StudioResult {
  const lights: LightResult[] = [];
  const flags = s.items.filter((i): i is StudioControl => i.kind === "flag");
  const bgPt: [number, number] = [0, -s.bgDist];
  for (const it of s.items) {
    if (it.kind !== "light") continue;
    const T = LIGHT_TYPES[it.type], M = MODIFIERS[it.type === "window" && it.mod !== "diff" ? "window" : it.mod];
    const d = Math.max(0.3, it.d);
    const out = T.output * M.eff * (it.power / 100);
    const e0 = out / (d * d);
    const pos = planXZ(it.a, d);
    const blocked = flags.some((f) => { const [q1, q2] = flagSeg(f); return segCross(pos, [0, 0], q1, q2); });
    // ฉากหลัง: ระยะไฟ→ฉาก + มุมระหว่างทิศเล็ง (เล็งที่ตัวแบบ) กับทิศไปฉาก เทียบความกว้างลำแสง
    const toS = [-pos[0], -pos[1]], toB = [bgPt[0] - pos[0], bgPt[1] - pos[1]];
    const dB = Math.hypot(toB[0], toB[1]);
    const cosA = (toS[0] * toB[0] + toS[1] * toB[1]) / (Math.hypot(toS[0], toS[1]) * dB || 1);
    const off = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
    const beam = off <= M.spread ? 1 : Math.max(0, 1 - (off - M.spread) / 25);
    const bgBlocked = flags.some((f) => { const [q1, q2] = flagSeg(f); return segCross(pos, bgPt, q1, q2); });
    const bgE = (out / Math.max(0.25, dB * dB)) * beam * (bgBlocked ? 0.12 : 1);
    const apparent = M.size / d;
    const dir = lightDir(it, s.camA);
    lights.push({ id: it.id, dir, e: e0 * (blocked ? 0.06 : 1), soft: clamp01(apparent / 1.1), apparent, rgb: kelvinRgb(it.k), blocked, bgE, shape: M.shape, front: dir[2] > 0.1 });
  }
  const totalE = lights.reduce((a, l) => a + l.e, 0);
  const avgRgb: [number, number, number] = totalE > 0 ? [0, 1, 2].map((j) => lights.reduce((a, l) => a + l.e * l.rgb[j], 0) / totalE) as [number, number, number] : [255, 255, 255];
  // รีเฟล็ก: รับแสงจากไฟทุกดวงตามมุม แล้วสะท้อนเข้าตัวแบบจากตำแหน่งของมัน
  const bounce: StudioResult["bounce"] = [];
  let vflat = 0;
  for (const it of s.items) {
    if (it.kind === "light" || it.kind === "flag") continue;
    const C = CONTROLS[it.kind];
    if (it.kind === "vflat") {
      // ได้ผลเต็มที่เมื่ออยู่ฝั่งตรงข้ามไฟหลัก (ด้านเงา) · อยู่ข้างไฟหลัก = แทบไม่มีผล
      const key = lights.length ? lights.reduce((a, b) => (b.e > a.e ? b : a)) : null;
      const keyA = key ? (s.items.find((x) => x.id === key.id) as StudioLight).a : 0;
      const opp = (1 - Math.cos(((it.a - keyA) * Math.PI) / 180)) / 2;
      vflat += Math.max(0, 1 - Math.abs(it.d - 0.8) / 2) * opp;
      continue;
    }
    const rp = planXZ(it.a, it.d);
    let got = 0;
    for (const l of lights) {
      const src = s.items.find((x) => x.id === l.id) as StudioLight;
      const lp = planXZ(src.a, src.d);
      const toL = [lp[0] - rp[0], lp[1] - rp[1]], face = [-rp[0], -rp[1]];
      const cos = (toL[0] * face[0] + toL[1] * face[1]) / ((Math.hypot(toL[0], toL[1]) * Math.hypot(face[0], face[1])) || 1);
      got += (l.e * src.d * src.d) / Math.max(0.3, (toL[0] ** 2 + toL[1] ** 2)) * Math.max(0, cos) * 0.5;
    }
    const e = (got * C.albedo) / Math.max(0.35, it.d * it.d) * 0.6;
    bounce.push({ dir: lightDir({ a: it.a, h: -5 }, s.camA), e, rgb: C.k ? kelvinRgb(C.k) : avgRgb });
  }
  const fillFloor = Math.max(0, (s.ambient * 0.06 + totalE * 0.03) * (1 - Math.min(0.85, vflat * 0.7)));
  const wbRgb = s.wb === "auto" ? avgRgb : kelvinRgb(s.wb);
  // กล้องวัดแสง: ให้ด้านที่สว่างที่สุดของตัวแบบ ≈ 0.9
  const probe = (n: V3) => { const c = shadeAt({ lights, bounce, fillFloor } as StudioResult, n); return (c[0] + c[1] + c[2]) / 3; };
  const normals: V3[] = [-60, -30, 0, 30, 60].map((t) => [Math.sin(rad(t)), 0.15, Math.cos(rad(t))]);
  const peak = Math.max(0.0001, ...normals.map(probe));
  const exposure = 0.9 / peak;
  const L = probe([-0.7, 0.1, 0.7]), R = probe([0.7, 0.1, 0.7]);
  const ratio = lights.length ? Math.max(L, R) / Math.max(0.001, Math.min(L, R)) : null;
  let bgE = s.ambient * 0.05;
  const bgC: [number, number, number] = [0, 0, 0];
  for (const l of lights) { bgE += l.bgE; for (let j = 0; j < 3; j++) bgC[j] += l.bgE * l.rgb[j]; }
  const bgRgb: [number, number, number] = bgE > 0 ? bgC.map((v) => (v || 255 * s.ambient * 0.05) / bgE) as [number, number, number] : [255, 255, 255];
  const key = lights.length ? lights.reduce((a, b) => (b.e > a.e ? b : a)) : null;
  // ค่ารูรับแสงแนะนำ (ISO 400 · 1/125 · ไฟต่อเนื่อง) — แฟลชแรงกว่า ~3 สต็อป
  let fstop: StudioResult["fstop"] = null;
  if (peak > 0.0001) {
    const raw = 4 * Math.sqrt(peak / 0.35);
    const f = F_STOPS.reduce((a, b) => (Math.abs(Math.log(b / raw)) < Math.abs(Math.log(a / raw)) ? b : a));
    fstop = { f, label: `f/${f}` };
  }
  const softness = totalE > 0 ? lights.reduce((a, l) => a + l.soft * l.e, 0) / totalE : 0;
  return { lights, bounce, fillFloor, bgE: bgE * exposure, bgRgb, keyId: key?.id ?? null, exposure, wbRgb, ratio, fstop, softness };
}

/** อ่านอัตราส่วนไฟเป็นภาษาคน · ต่างกันกี่สต็อป */
export function ratioText(ratio: number | null): string {
  if (ratio === null) return "ยังไม่มีไฟ";
  const stops = Math.log2(Math.max(1, ratio));
  const r = ratio < 1.25 ? "1:1" : `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}:1`;
  const mood = ratio < 1.6 ? "แบนเรียบ (high-key/บิวตี้)" : ratio < 3 ? "นุ่มนวล ดูเป็นธรรมชาติ" : ratio < 6 ? "มีมิติ ดูหนักแน่น" : "ดราม่า (low-key)";
  return `${r} · ต่าง ${stops.toFixed(1)} สต็อป · ${mood}`;
}

// ───────── คำอธิบายผลอัตโนมัติ ─────────

export function explain(s: StudioSetup, r: StudioResult): string[] {
  const out: string[] = [];
  const key = r.lights.find((l) => l.id === r.keyId);
  const keyItem = s.items.find((i) => i.id === r.keyId) as StudioLight | undefined;
  if (!key || !keyItem) return ["ยังไม่มีไฟในฉาก — กด “+ ไฟ” หรือเลือกสูตรไฟด้านบน"];
  const rel = ((keyItem.a - s.camA + 540) % 360) - 180, ar = Math.abs(rel);
  out.push(key.soft > 0.6 ? `ไฟหลักนุ่ม: ${MODIFIERS[keyItem.mod].label} ห่าง ${keyItem.d.toFixed(1)} ม. ดูใหญ่เมื่อเทียบตัวแบบ เงาจึงฟุ้ง ขอบไล่เนียน`
    : key.soft < 0.25 ? `ไฟหลักแข็ง: แหล่งแสงเล็กเมื่อเทียบระยะ เงาคม เห็นผิวสัมผัสชัด — อยากนุ่มขึ้น ใช้ตัวปรับแสงใหญ่ขึ้น หรือลากไฟเข้าใกล้`
      : "ไฟหลักกึ่งนุ่ม: เงายังเห็นทรงชัด แต่ขอบไม่คม");
  out.push(ar < 20 ? "ไฟหลักเกือบตรงกล้อง: สว่างทั่วแต่ภาพแบน มิติน้อย" : ar < 70 ? "ไฟหลักเฉียง: ด้านหนึ่งสว่าง อีกด้านมีเงา ภาพมีมิติ" : ar < 120 ? "ไฟหลักด้านข้าง: ครึ่งมืดครึ่งสว่าง เห็นผิวสัมผัสชัด" : "ไฟหลักอยู่หลังตัวแบบ: เหลือแต่ขอบสว่าง (rim) — ต้องมีไฟเสริมด้านหน้าถ้าอยากเห็นรายละเอียด");
  if (keyItem.h > 50) out.push("ไฟสูงมาก: เงาตกใต้คิ้ว/ใต้จมูกยาว ตาอาจดูลึก");
  else if (keyItem.h < -5) out.push("ไฟต่ำกว่าตัวแบบ: เงาย้อนขึ้นบน ดูน่ากลัวผิดธรรมชาติ (ไฟผี) — ปกติใช้แค่เป็นไฟเสริม");
  if (r.ratio !== null && r.lights.length) out.push(`อัตราส่วนด้านสว่าง:ด้านเงา ${ratioText(r.ratio)}`);
  if (key.blocked) out.push("Flag บังทางไฟหลักอยู่ ตัวแบบจึงมืด — เลื่อน Flag ออกจากเส้นทางไฟ");
  const ks = s.items.filter((i): i is StudioLight => i.kind === "light").map((l) => l.k);
  if (ks.length > 1 && Math.max(...ks) - Math.min(...ks) > 1200) out.push("ไฟในฉากคนละสี: ฝั่งหนึ่งอุ่นอีกฝั่งเย็น — ตั้งใจทำได้ (ลุคหนัง) แต่ถ่ายสินค้าควรให้ทุกดวงสีเดียวกัน");
  if (s.wb !== "auto" && r.lights.length) { const avg = ks.reduce((a, b) => a + b, 0) / ks.length; if (Math.abs(avg - s.wb) > 1000) out.push(`ไวต์บาลานซ์กล้อง ${s.wb}K ไม่ตรงสีไฟ (~${Math.round(avg / 100) * 100}K) ภาพจึง${s.wb > avg ? "ออกส้ม" : "ออกฟ้า"}`); }
  const bgRel = r.bgE;
  if (s.backdrop !== "black" && bgRel < 0.15) out.push(`ฉากหลังมืดลงมาก: ตัวแบบห่างฉาก ${s.bgDist.toFixed(1)} ม. แสงไปไม่ถึง (ยิ่งห่างฉากยิ่งมืด) — อยากให้ฉากสว่าง เพิ่มไฟส่องฉาก`);
  if (s.subject === "bag" && s.bag.material === "gloss") out.push("หนังเงาสะท้อน “รูปทรงไฟ” ออกมาตรง ๆ — ตัวปรับแสงใหญ่ = แถบไล่แสงสวย · ไฟเปล่า = จุดจ้าเล็ก ๆ");
  return out;
}

// ───────── รายการอุปกรณ์ (เอาไปจัดของก่อนถ่าย) ─────────

export function gearList(s: StudioSetup): { item: string; qty: number }[] {
  const m = new Map<string, number>();
  const add = (k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  let stands = 0, booms = 0;
  for (const it of s.items) {
    if (it.kind === "light") {
      add(LIGHT_TYPES[it.type].gear);
      if (it.type !== "window" && it.mod !== "bare") add(MODIFIERS[it.mod].label);
      if (it.type !== "window") { if (it.h > 45 || (it.a === 0 && it.h > 35)) booms++; else stands++; }
      if (it.type === "window" && it.mod === "diff") add("ผ้าม่านขาว/ผ้า Diffuser");
    } else {
      add(CONTROLS[it.kind].gear);
      if (it.kind === "flag") stands++;
      else if (it.kind !== "vflat") stands++;
    }
  }
  if (stands) add("ขาตั้งไฟ", stands);
  if (booms) add("บูมอาร์ม / C-stand (ไฟเหนือหัว)", booms);
  if (stands + booms) add("ถุงทราย (กันขาล้ม)", stands + booms);
  add(`${BACKDROPS[s.backdrop].label} + ขาฉาก`);
  if (s.subject === "bag") add("โต๊ะถ่ายสินค้า");
  if (s.items.some((i) => i.kind === "light" && i.type === "flash")) add("ทริกเกอร์แฟลช (ใส่บนกล้อง)");
  return [...m.entries()].map(([item, qty]) => ({ item, qty }));
}

// ───────── สูตรไฟ Master Class ─────────

export type StudioRecipe = { key: string; label: string; group: "คน" | "สินค้า" | "อารมณ์ภาพ"; why: string; look: string; setup: Partial<StudioSetup> & { items: StudioItem[] } };

const L = (o: Partial<StudioLight> & Pick<StudioLight, "a" | "d">): StudioLight => ({ id: newId(), kind: "light", type: "cob", mod: "softbox", h: 30, power: 100, k: 5600, ...o });
const C = (kind: ControlKind, a: number, d = 0.8): StudioControl => ({ id: newId(), kind, a, d });

export const RECIPES: (() => StudioRecipe)[] = [
  () => ({ key: "rembrandt", label: "Rembrandt", group: "คน", why: "ไฟหลักเฉียง ~45° และสูงกว่าหัว ~40° เงาจมูกไปบรรจบเงาแก้ม เกิด “สามเหลี่ยมแสง” ใต้ตาด้านมืด — ดูขรึม มีมิติ แบบภาพเขียนของ Rembrandt", look: "ดูสามเหลี่ยมแสงใต้ตาข้างที่มืด · ตาข้างนั้นต้องยังมีแววตา", setup: { subject: "face", backdrop: "gray", items: [L({ a: 45, d: 1.2, h: 40 }), C("vflat", -75, 0.8)] } }),
  () => ({ key: "loop", label: "Loop", group: "คน", why: "ไฟหลักเฉียงน้อยกว่า Rembrandt (~30°) เงาจมูกเป็นวงเล็ก ๆ ชี้ลงมุมปาก ไม่แตะเงาแก้ม — สวยเป็นธรรมชาติ ใช้ได้กับเกือบทุกหน้า", look: "เงาจมูกเป็นติ่งเล็ก ๆ เฉียงลง ไม่เชื่อมเงาแก้ม", setup: { subject: "face", backdrop: "gray", items: [L({ mod: "octa", a: 30, d: 1.3, h: 30 }), C("refl-white", -55, 0.9)] } }),
  () => ({ key: "butterfly", label: "Butterfly (Paramount)", group: "คน", why: "Beauty dish ตรงหน้า สูงเหนือหัว เงาใต้จมูกเป็นรูปผีเสื้อ โหนกแก้มเด่น — งานบิวตี้/แฟชั่นคลาสสิก", look: "เงาผีเสื้อใต้จมูกตรงกลาง · เงาใต้คางชัด", setup: { subject: "face", backdrop: "gray", items: [L({ mod: "dish", a: 0, d: 1, h: 50 })] } }),
  () => ({ key: "clamshell", label: "Clamshell", group: "คน", why: "Butterfly + รีเฟล็ก/ไฟอ่อนใต้คาง ประกบเหมือนเปลือกหอย เปิดเงาใต้ตาและคาง ผิวเนียน แววตาสองจุด — บิวตี้ โฆษณาเครื่องสำอาง", look: "เงาใต้คางจางลง · แววตามีทั้งบนและล่าง", setup: { subject: "face", backdrop: "white", items: [L({ mod: "octa", a: 0, d: 1, h: 45 }), C("refl-silver", 0, 0.6)] } }),
  () => ({ key: "split", label: "Split", group: "คน", why: "ไฟข้าง 90° พอดี หน้าแบ่งครึ่งสว่าง-มืด — ดราม่า ลึกลับ ใช้กับภาพบุคลิกแข็ง", look: "เส้นแบ่งแสงผ่านกลางจมูก", setup: { subject: "face", backdrop: "black", ambient: 0, items: [L({ mod: "grid", a: 90, d: 1, h: 10 }), C("vflat", -90, 0.7)] } }),
  () => ({ key: "broad", label: "Broad light", group: "คน", why: "หันหน้าเฉียง แล้วส่องไฟฝั่งแก้มที่หันเข้ากล้อง (ด้านกว้าง) — หน้าดูกว้าง สว่าง เปิดเผย", look: "แก้มฝั่งใกล้กล้องสว่าง", setup: { subject: "face", camA: 25, backdrop: "gray", items: [L({ a: 60, d: 1.3, h: 30 })] } }),
  () => ({ key: "short", label: "Short light", group: "คน", why: "หันหน้าเฉียง ส่องไฟฝั่งแก้มที่หันออกจากกล้อง (ด้านแคบ) — หน้าดูเรียว มีมิติ ช่างภาพบุคคลใช้บ่อยที่สุด", look: "แก้มฝั่งใกล้กล้องอยู่ในเงา", setup: { subject: "face", camA: 25, backdrop: "gray", items: [L({ a: -15, d: 1.3, h: 30 })] } }),
  () => ({ key: "three-point", label: "3 จุด (สัมภาษณ์)", group: "คน", why: "ไฟหลัก (key) + ไฟเสริมเบา ๆ ฝั่งตรงข้าม (fill ~1/3) + ไฟหลังส่องขอบ (rim) แยกคนออกจากฉาก — สูตรพื้นฐานงานสัมภาษณ์/วิดีโอ", look: "ขอบผม/ไหล่มีเส้นสว่าง แยกจากฉากหลัง", setup: { subject: "half", backdrop: "gray", items: [L({ a: 40, d: 1.5, h: 30 }), L({ type: "panel", mod: "umbrella", a: -45, d: 2, h: 10, power: 45 }), L({ type: "tube", mod: "strip", a: 150, d: 1.4, h: 30, power: 80 })] } }),
  () => ({ key: "high-key", label: "High-key", group: "อารมณ์ภาพ", why: "ไฟนุ่มหน้าใหญ่ + ไฟยิงฉากขาวให้สว่างกว่าตัวแบบ ~1 สต็อป เงาน้อยมาก — สดใส สะอาด โฆษณา/อีคอมเมิร์ซ", look: "ฉากหลังขาวสนิทไม่เป็นเทา · เงาบนตัวแบบจาง", setup: { subject: "half", backdrop: "white", bgDist: 1, ambient: 0.3, items: [L({ mod: "octa", a: 15, d: 1.6, h: 25 }), L({ type: "panel", mod: "umbrella", a: -30, d: 1.8, h: 10, power: 70 }), L({ mod: "bare", a: 160, d: 1.3, h: 10, power: 80 }), L({ mod: "bare", a: -160, d: 1.3, h: 10, power: 80 })] } }),
  () => ({ key: "low-key", label: "Low-key", group: "อารมณ์ภาพ", why: "ไฟดวงเดียวลำแคบ (grid) ปิดไฟห้อง ฉากดำ + V-flat ดำด้านเงา — ส่วนใหญ่ของภาพมืด ดึงสายตาไปจุดเดียว หรู ลึกลับ", look: "ด้านเงาดำสนิท · ฉากหลังไม่มีแสงหก", setup: { subject: "half", backdrop: "black", bgDist: 2.5, ambient: 0, items: [L({ mod: "grid", a: 70, d: 1, h: 35 }), C("vflat", -70, 0.7)] } }),
  () => ({ key: "rim", label: "Rim / ขอบสว่าง", group: "อารมณ์ภาพ", why: "Strip box สองดวงหลังตัวแบบซ้าย-ขวา เกิดเส้นสว่างตามขอบ ตัดจากฉากมืด — ภาพกีฬา/รถ/สินค้าโชว์ทรง", look: "เส้นขอบสว่างสองข้าง กลางตัวมืด", setup: { subject: "half", backdrop: "black", ambient: 0, items: [L({ type: "tube", mod: "strip", a: 140, d: 1.2, h: 20 }), L({ type: "tube", mod: "strip", a: -140, d: 1.2, h: 20 })] } }),
  () => ({ key: "window", label: "แสงหน้าต่าง", group: "อารมณ์ภาพ", why: "หน้าต่างด้านข้างคือซอฟต์บ็อกซ์ใหญ่ฟรี + รีเฟล็กขาวเปิดเงาฝั่งตรงข้าม — ภาพไลฟ์สไตล์ อบอุ่น เป็นธรรมชาติ", look: "แสงไล่จากฝั่งหน้าต่างไปเงานุ่ม · แววตาเป็นกรอบหน้าต่าง", setup: { subject: "half", backdrop: "white", ambient: 0.25, items: [L({ type: "window", mod: "window", a: 75, d: 1.2, h: 15, k: 6000 }), C("refl-white", -70, 0.9)] } }),
  () => ({ key: "teal-orange", label: "สองสี (ลุคหนัง)", group: "อารมณ์ภาพ", why: "ไฟหลักอุ่น 3200K + ไฟขอบเย็น 6500K แล้วตั้งไวต์บาลานซ์ 4300K — ผิวอุ่นตัดกับเงาเย็น แบบภาพยนตร์", look: "ฝั่งหน้าอุ่นส้ม · ขอบหลังฟ้า", setup: { subject: "half", backdrop: "black", ambient: 0, wb: 4300, items: [L({ a: 40, d: 1.3, h: 25, k: 3200 }), L({ type: "tube", mod: "strip", a: -145, d: 1.3, h: 20, k: 6500, power: 80 })] } }),
  () => ({ key: "gloss-gradient", label: "สินค้าเงา · ไล่แสง", group: "สินค้า", why: "ผ้า diffuser ใหญ่สองข้าง สินค้าเงาสะท้อนเป็นแถบไล่ระดับ (gradient) บอกทรงโค้ง · ไม่มีไฟด้านหน้า กลางสินค้าจึงดำสะอาด ไม่มีจุดจ้า + Flag ด้านหลังกันแสงหกโดนฉาก — หลักถ่ายหนังเงา/ขวด/โลหะ", look: "แถบสะท้อนยาวนุ่มที่ขอบสองข้าง · กลางสินค้าไม่มีจุดจ้า", setup: { subject: "bag", bag: { shape: "tote", material: "gloss", color: "#1c1c1c" }, backdrop: "gray", items: [L({ type: "panel", mod: "diff", a: -75, d: 1, h: 20, power: 90 }), L({ type: "panel", mod: "diff", a: 75, d: 1, h: 20, power: 70 }), C("flag", 150, 0.9)] } }),
  () => ({ key: "white-product", label: "สินค้าบนฉากขาว", group: "สินค้า", why: "ไฟนุ่มด้านบนเฉียงส่องสินค้า + ไฟสองดวงยิงฉากขาวให้ขาวสนิท (ตัดพื้นหลังง่าย) — ภาพหน้าร้านออนไลน์", look: "ฉากขาวไม่มีเทา · เงาใต้สินค้านุ่มบาง ๆ", setup: { subject: "bag", bag: { shape: "cross", material: "matte", color: "#7a3b16" }, backdrop: "white", bgDist: 1, items: [L({ mod: "octa", a: 25, d: 1.2, h: 45 }), C("refl-white", -60, 0.7), L({ mod: "bare", a: 165, d: 1, h: 10, power: 70 }), L({ mod: "bare", a: -165, d: 1, h: 10, power: 70 })] } }),
  () => ({ key: "texture", label: "โชว์ผิวสัมผัส", group: "สินค้า", why: "ไฟแข็งเฉียงต่ำเลียผิว (grazing light) เงาเม็ดหนัง/ลายผ้าเด่น — ใช้โชว์วัสดุ งานคราฟต์", look: "เห็นลาย/รอยตะเข็บชัด ด้านหนึ่งมืด", setup: { subject: "bag", bag: { shape: "cross", material: "fabric", color: "#2f4a6b" }, backdrop: "black", ambient: 0, items: [L({ mod: "barn", a: 85, d: 1.2, h: 10 }), C("refl-white", -60, 0.7)] } }),
];

/** สร้างชุดไฟจากสูตร (ได้ id ใหม่ทุกครั้ง) */
export function applyRecipe(r: StudioRecipe, base: StudioSetup): StudioSetup {
  const d = defaultSetup();
  return cleanSetup({ ...base, camA: 0, camH: d.camH, wb: "auto", ambient: d.ambient, bgDist: d.bgDist, ...r.setup, bag: r.setup.bag ?? base.bag, items: r.setup.items.map((i) => ({ ...i, id: newId() })) });
}
