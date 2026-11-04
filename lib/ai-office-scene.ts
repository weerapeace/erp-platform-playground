/**
 * 🏢 ฉากออฟฟิศพิกเซลของ "ออฟฟิศทีม AI" — ค่าตกแต่ง (ตัวละคร · โต๊ะ · ธีม) + กติกา "สถานะ → อยู่ห้องไหน"
 *
 * - pure (ไม่มี DB/React/canvas) · ตัววาดอยู่ components/ai-office/pixel · ทะเบียนผู้ช่วยอยู่ lib/ai-office.ts
 * - บันทึกผ่าน /api/ai-office/scene → ui_config key `ai_office_scene` (แถวเดียว ไม่ต้องมีตารางใหม่)
 * - ค่าที่เก็บไม่ผูกกับสไตล์การวาด (ชนิด/สีขน/สีเสื้อ/ชื่อเล่น) → วันหลังเพิ่มสไตล์ใหม่ได้โดยไม่ต้องแต่งตัวละครใหม่
 * - ค่าที่เสีย/ไม่ครบ → cleanScene เติมค่าเริ่มต้นให้เสมอ (ผู้ช่วยใหม่ในทะเบียนได้โต๊ะว่างอัตโนมัติ)
 */
import { OFFICE_WORKERS, CRON_SECRET_FIX, WORKER_BY_ID, type OfficeWorker, type OfficeZoneId, type WorkerLive } from "@/lib/ai-office";

export const SCENE_CONFIG_KEY = "ai_office_scene";
/** จำนวนโต๊ะในห้องทำงาน (4 แถวนอน × 5 แถวตั้ง) — ต้อง ≥ จำนวนผู้ช่วยในทะเบียน (เทสต์เช็ก) */
export const SCENE_DESKS = 20;
export const NICK_MAX = 16;

export type Species = "cat" | "dog" | "human";
export const SPECIES: { id: Species; th: string; en: string }[] = [
  { id: "cat", th: "แมว", en: "Cat" },
  { id: "dog", th: "หมา", en: "Dog" },
  { id: "human", th: "คน", en: "Human" },
];

export type SceneTheme = "day" | "night" | "minimal";
export const SCENE_THEMES: { id: SceneTheme; th: string; en: string }[] = [
  { id: "day", th: "กลางวัน", en: "Day" },
  { id: "night", th: "กะดึก", en: "Night" },
  { id: "minimal", th: "มินิมอล", en: "Minimal" },
];

/** สีขน (แมว/หมา) หรือสีผม (คน) */
export const FUR_COLORS = ["#F2A65A", "#F4ECDC", "#9A9890", "#4A3B30", "#C68A5E", "#E8D27A"];
export const SHIRT_COLORS = ["#534AB7", "#378ADD", "#D85A30", "#1D9E75", "#D4537E", "#5F5E5A", "#EFB627"];
/** เสื้อเริ่มต้นตามแผนก = เห็นแล้วรู้ว่าอยู่ฝ่ายไหน */
const ZONE_SHIRT: Record<OfficeZoneId, string> = {
  control: "#534AB7", sales: "#378ADD", purchase: "#D85A30", production: "#1D9E75", marketing: "#D4537E", finance: "#5F5E5A",
};

export type CharacterLook = { species: Species; fur: string; shirt: string; nick: string };
export type SceneConfig = { v: 1; theme: SceneTheme; desks: string[]; looks: Record<string, CharacterLook> };

const HEX = /^#[0-9a-f]{6}$/i;
const isSpecies = (v: unknown): v is Species => SPECIES.some((s) => s.id === v);
const isTheme = (v: unknown): v is SceneTheme => SCENE_THEMES.some((s) => s.id === v);

export function defaultLook(w: OfficeWorker, i: number): CharacterLook {
  const species: Species = w.kind === "ai" ? "cat" : i % 2 ? "dog" : "human";
  return { species, fur: FUR_COLORS[i % FUR_COLORS.length], shirt: ZONE_SHIRT[w.zone], nick: "" };
}

export function defaultScene(): SceneConfig {
  const desks = Array.from({ length: SCENE_DESKS }, (_, i) => OFFICE_WORKERS[i]?.id ?? "");
  const looks: Record<string, CharacterLook> = {};
  OFFICE_WORKERS.forEach((w, i) => { looks[w.id] = defaultLook(w, i); });
  return { v: 1, theme: "day", desks, looks };
}

/** ทำให้ค่าที่ได้มา (จาก DB หรือจากหน้าจอ) ใช้ได้เสมอ — ตัดของแปลก เติมค่าเริ่มต้น ผู้ช่วยทุกตัวมีโต๊ะ 1 ตัวพอดี */
export function cleanScene(raw: unknown): SceneConfig {
  const base = defaultScene();
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SceneConfig> & Record<string, unknown>;
  const theme = isTheme(r.theme) ? r.theme : base.theme;

  const seen = new Set<string>();
  const src = Array.isArray(r.desks) ? r.desks.slice(0, SCENE_DESKS) : base.desks;
  const desks = Array.from({ length: SCENE_DESKS }, (_, i) => {
    const id = typeof src[i] === "string" ? String(src[i]) : "";
    if (!id || !WORKER_BY_ID[id] || seen.has(id)) return "";
    seen.add(id);
    return id;
  });
  for (const w of OFFICE_WORKERS) {
    if (seen.has(w.id)) continue;
    const free = desks.indexOf("");
    if (free < 0) break;
    desks[free] = w.id;
    seen.add(w.id);
  }

  const rawLooks = (r.looks && typeof r.looks === "object" ? r.looks : {}) as Record<string, Partial<CharacterLook>>;
  const looks: Record<string, CharacterLook> = {};
  for (const w of OFFICE_WORKERS) {
    const d = base.looks[w.id], x = rawLooks[w.id] ?? {};
    looks[w.id] = {
      species: isSpecies(x.species) ? x.species : d.species,
      fur: typeof x.fur === "string" && HEX.test(x.fur) ? x.fur.toUpperCase() : d.fur,
      shirt: typeof x.shirt === "string" && HEX.test(x.shirt) ? x.shirt.toUpperCase() : d.shirt,
      nick: typeof x.nick === "string" ? x.nick.replace(/\s+/g, " ").trim().slice(0, NICK_MAX) : "",
    };
  }
  return { v: 1, theme, desks, looks };
}

/** สลับโต๊ะ 2 ตัว (โต๊ะว่างก็สลับได้ = ย้ายไปนั่งโต๊ะว่าง) */
export function swapDesks(cfg: SceneConfig, a: number, b: number): SceneConfig {
  if (a === b || a < 0 || b < 0 || a >= SCENE_DESKS || b >= SCENE_DESKS) return cfg;
  const desks = cfg.desks.slice();
  [desks[a], desks[b]] = [desks[b], desks[a]];
  return { ...cfg, desks };
}

/** ชื่อที่โชว์บนป้าย — ชื่อเล่น ถ้าไม่มีใช้ชื่อตำแหน่ง */
export const displayName = (cfg: SceneConfig, w: OfficeWorker) => cfg.looks[w.id]?.nick || w.title;

/**
 * ท่าทาง = อยู่ห้องไหน ทำอะไร
 * work นั่งโต๊ะพิมพ์งาน · sleep หลับที่โต๊ะ + นาฬิกาปลุกแดง (งานตั้งเวลาที่ติดแค่รหัสลับ) · lounge มุมพัก (ว่าง)
 * counter เคาน์เตอร์ (รอคน) · repair ห้องซ่อม (ติดปัญหา) · away นั่งโต๊ะจอดับ (ยังไม่มีบันทึก)
 */
export type Pose = "work" | "sleep" | "lounge" | "counter" | "repair" | "away";
export function workerPose(w: OfficeWorker, live: WorkerLive | undefined): Pose {
  const s = live?.status;
  if (!s || s === "unknown") return "away";
  if (s === "error") return w.cron && live?.fix === CRON_SECRET_FIX ? "sleep" : "repair";
  if (s === "warn") return "counter";
  if (s === "idle") return "lounge";
  return "work";
}

export const POSE_LABEL: Record<Pose, { th: string; en: string }> = {
  work: { th: "นั่งโต๊ะ · ทำงานปกติ", en: "At desk · working" },
  sleep: { th: "หลับ · นาฬิกาปลุกเสีย", en: "Asleep · alarm broken" },
  lounge: { th: "มุมพัก · ว่าง", en: "Lounge · idle" },
  counter: { th: "เคาน์เตอร์ · รอคน", en: "Counter · waiting" },
  repair: { th: "ห้องซ่อม · ติดปัญหา", en: "Repair room · problem" },
  away: { th: "จอดับ · ยังไม่มีบันทึก", en: "Screen off · no record" },
};

/** สรุปสิ่งที่เปลี่ยน (ใช้เขียนประวัติ audit) */
export function sceneChanges(before: SceneConfig, after: SceneConfig): string[] {
  const out: string[] = [];
  if (before.theme !== after.theme) out.push(`theme:${before.theme}→${after.theme}`);
  const moved = OFFICE_WORKERS.filter((w) => before.desks.indexOf(w.id) !== after.desks.indexOf(w.id)).map((w) => w.id);
  if (moved.length) out.push(`desks:${moved.join(",")}`);
  for (const w of OFFICE_WORKERS) {
    const a = before.looks[w.id], b = after.looks[w.id];
    if (!a || !b) continue;
    const f = (["species", "fur", "shirt", "nick"] as const).filter((k) => a[k] !== b[k]);
    if (f.length) out.push(`look:${w.id}(${f.join("/")})`);
  }
  return out;
}
