/**
 * ศูนย์งานแก้แอป — ตัวช่วยกลาง (pure ไม่แตะ DB)
 *
 * งานแก้ 1 ใบ (แถวใน issue_reports) ผูกกับ:
 *   page_path = หน้าที่ขอแก้ (เช่น /quotations)
 *   parts     = ของกลางที่เกี่ยว (key ใน lib/shared-parts-registry)
 *   flow_refs = จุดในแผนผังการทำงาน (กล่อง n / เส้น e ใน lib/flow-map)
 *
 * ข้อมูล "หน้านี้ใช้ของกลางอะไร" กลับด้านจาก lib/shared-parts-usage.json (นับจากโค้ดตอน build)
 * ข้อมูล "หน้านี้อยู่กล่องไหนในแผนผัง" จาก FLOW_NODES[].href
 */
import type { SharedPart } from "@/lib/shared-parts-registry";
import { sourceId } from "@/lib/shared-parts-registry";

export type FlowRef = { kind: "n" | "e"; ref: string };
export type PagePart = { key: string; label: string; category: string };
export type PartPlace = { label: string; href: string | null };
type UsagePlace = { label: string; href: string | null; kind?: string };
type Usage = { sources: Record<string, { places?: UsagePlace[] } | undefined> };
type NodeLike = { label: string; href?: string };

const MAX_PARTS = 12;
const MAX_FLOW = 8;

/** ตัด query/hash/ / ท้าย → "/quotations" · ค่าแปลก (ไม่ขึ้นต้น / หรือ //) = null */
export function normalizePagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.trim().split(/[?#]/)[0];
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p.slice(0, 300) || null;
}

/** หน้าจริงตรงกับแบบเส้นทางไหม — "[id]" / "[...slug]" ในแบบ = ช่องอะไรก็ได้ */
export function pathMatchesRoute(path: string, route: string): boolean {
  const a = path.split("/").filter(Boolean);
  const b = route.split("/").filter(Boolean);
  for (let i = 0; i < b.length; i++) {
    const seg = b[i];
    if (/^\[\.\.\..+\]$/.test(seg) || /^\[\[\.\.\..+\]\]$/.test(seg)) return a.length >= i + (seg.startsWith("[[") ? 0 : 1);
    if (i >= a.length) return false;
    if (/^\[.+\]$/.test(seg)) continue;
    if (seg !== a[i]) return false;
  }
  return a.length === b.length;
}

function placeRoute(p: UsagePlace): string | null {
  const r = p.href ?? p.label;
  return typeof r === "string" && r.startsWith("/") ? r : null;
}

/** ของกลางที่หน้านี้ใช้ (เฉพาะตัวที่ลงทะเบียน · ไม่รวมตัวที่ถูกแทนแล้ว) เรียงตามชื่อ */
export function partsForPage(path: string, parts: SharedPart[], usage: Usage): PagePart[] {
  const out: PagePart[] = [];
  for (const p of parts) {
    if (p.replacedBy) continue;
    const places = usage.sources[sourceId(p.source)]?.places ?? [];
    if (places.some((pl) => { const r = placeRoute(pl); return r ? pathMatchesRoute(path, r) : false; })) {
      out.push({ key: p.key, label: p.label, category: p.category });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "th"));
}

/** หน้าทั้งหมดที่ใช้ของกลางตัวนี้ (ไว้บอก "แก้ตัวนี้แล้วกระทบหน้าไหน") */
export function pagesForPart(key: string, parts: SharedPart[], usage: Usage): PartPlace[] {
  const p = parts.find((x) => x.key === key);
  if (!p) return [];
  const seen = new Set<string>();
  const out: PartPlace[] = [];
  for (const pl of usage.sources[sourceId(p.source)]?.places ?? []) {
    if (pl.kind && pl.kind !== "page") continue;
    const k = pl.href ?? pl.label;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label: pl.label, href: pl.href });
  }
  return out;
}

/** กล่องในแผนผังที่ปุ่ม "เปิดหน้า" ชี้มาหน้านี้ (หรือหน้าย่อย) */
export function flowNodesForPage(path: string, nodes: Record<string, NodeLike>): FlowRef[] {
  const out: FlowRef[] = [];
  for (const [id, n] of Object.entries(nodes)) {
    const h = n.href ? normalizePagePath(n.href) : null;
    if (h && h !== "/" && (path === h || path.startsWith(h + "/"))) out.push({ kind: "n", ref: id });
  }
  return out;
}

/** ล้างค่าที่รับเข้า API — key ของกลางต้องมีในทะเบียน */
export function cleanParts(raw: unknown, known: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && known.has(x)))].slice(0, MAX_PARTS);
}

/** ล้างค่าจุดในแผนผัง — ต้องมีกล่อง/เส้นนั้นจริง */
export function cleanFlowRefs(raw: unknown, nodes: Record<string, unknown>, edges: Record<string, unknown>): FlowRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FlowRef[] = [];
  for (const x of raw) {
    const r = x as { kind?: unknown; ref?: unknown };
    if ((r?.kind !== "n" && r?.kind !== "e") || typeof r.ref !== "string") continue;
    if (r.kind === "n" ? !(r.ref in nodes) : !(r.ref in edges)) continue;
    const k = `${r.kind}:${r.ref}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ kind: r.kind, ref: r.ref });
  }
  return out.slice(0, MAX_FLOW);
}

/** สถานะงานแก้ (ใช้ status เดิมของ issue_reports) → ป้ายภาษาคน */
export const CHANGE_STATUS: Record<string, { label: string; tone: "warn" | "info" | "ok" | "muted" }> = {
  open: { label: "รอทำ", tone: "warn" },
  in_progress: { label: "กำลังทำ", tone: "info" },
  resolved: { label: "ขึ้นเว็บแล้ว", tone: "ok" },
  closed: { label: "ปิด", tone: "muted" },
};

/** จัดกลุ่มงานแก้ตามหน้า / ของกลาง / สถานะ — รายการที่มีหลายของกลางอยู่หลายกลุ่มได้ */
export type ChangeGroupBy = "page" | "part" | "status";
export function groupChanges<T extends { page_path: string | null; parts: string[]; status: string }>(
  rows: T[], by: ChangeGroupBy, partLabel: (k: string) => string = (k) => k,
): { key: string; label: string; rows: T[] }[] {
  const map = new Map<string, { key: string; label: string; rows: T[] }>();
  const put = (key: string, label: string, r: T) => {
    const g = map.get(key) ?? { key, label, rows: [] };
    g.rows.push(r); map.set(key, g);
  };
  for (const r of rows) {
    if (by === "page") put(r.page_path ?? "", r.page_path ?? "ไม่ระบุหน้า", r);
    else if (by === "status") put(r.status, CHANGE_STATUS[r.status]?.label ?? r.status, r);
    else if (!r.parts?.length) put("", "ไม่ผูกของกลาง", r);
    else for (const k of r.parts) put(k, partLabel(k), r);
  }
  const order = by === "status" ? Object.keys(CHANGE_STATUS) : null;
  return [...map.values()].sort((a, b) => {
    if (order) return order.indexOf(a.key) - order.indexOf(b.key);
    if (!a.key) return 1;
    if (!b.key) return -1;
    return b.rows.length - a.rows.length || a.label.localeCompare(b.label, "th");
  });
}

// ─── รหัสงานแก้ + ป้าย "ขึ้นเว็บแล้ว" ───────────────────────────────────────────
// AI ใส่รหัส [CH-xxxxxx] ไว้ในข้อความ commit → ระบบเทียบกับ commit ที่รอขึ้นเว็บ / อยู่บนเว็บจริงแล้ว (lib/deploy-status)

/** รหัสสั้นของงานแก้ = CH- + 6 ตัวแรกของ id */
export function changeCode(id: string): string {
  return `CH-${id.replace(/-/g, "").slice(0, 6).toLowerCase()}`;
}

/** หา [CH-xxxxxx] ทุกตัวในข้อความ commit (ตัวเล็กหมด) */
export function codesInText(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\bCH-([0-9a-f]{6})\b/gi)) out.add(`CH-${m[1].toLowerCase()}`);
  return [...out];
}

export type DeployMark = "waiting" | "live";
/** commit ที่รอขึ้น + commit บนเว็บจริงล่าสุด → รหัสงานแก้ไหนอยู่สถานะไหน (รอขึ้นชนะ ถ้ามีทั้งคู่ = ยังแก้ต่ออยู่) */
export function deployMarks(waitingMsgs: string[], liveMsgs: string[]): Record<string, DeployMark> {
  const out: Record<string, DeployMark> = {};
  for (const m of liveMsgs) for (const c of codesInText(m)) out[c] = "live";
  for (const m of waitingMsgs) for (const c of codesInText(m)) out[c] = "waiting";
  return out;
}

/** ป้ายที่โชว์ = สถานะในใบ + ร่องรอยใน commit */
export function changeBadge(status: string, mark: DeployMark | undefined): { label: string; tone: "warn" | "info" | "ok" | "muted" | "wait" } {
  if (status === "closed") return CHANGE_STATUS.closed;
  if (mark === "waiting") return { label: "รอขึ้นเว็บ", tone: "wait" };
  if (mark === "live" || status === "resolved") return CHANGE_STATUS.resolved;
  return CHANGE_STATUS[status] ?? { label: status, tone: "muted" };
}

// ─── คำสั่งให้ AI ────────────────────────────────────────────────────────────────
export type PromptItem = {
  id: string; description: string; page_path: string | null;
  parts: { key: string; label: string; pages?: number }[];
  flow: string[]; images: number;
};

/** รวมงานแก้หลายข้อเป็นข้อความเดียว ให้คัดลอกไปวางใน Claude */
export function buildChangePrompt(items: PromptItem[]): string {
  const lines: string[] = [
    "อ่าน CLAUDE.md ก่อน",
    "",
    `ช่วยแก้แอปตามงานแก้ ${items.length} ข้อนี้ (จากศูนย์งานแก้แอป /admin/app-changes)`,
    "",
  ];
  items.forEach((it, i) => {
    lines.push(`${i + 1}. [${changeCode(it.id)}] ${it.description.trim()}`);
    if (it.page_path) lines.push(`   หน้า: ${it.page_path}`);
    if (it.parts.length) lines.push(`   ของกลาง: ${it.parts.map((p) => `${p.label} (${p.key}${p.pages ? ` · ใช้ ${p.pages} หน้า` : ""})`).join(", ")}`);
    if (it.flow.length) lines.push(`   แผนผังการทำงาน: ${it.flow.join(", ")}`);
    if (it.images) lines.push(`   มีภาพหน้าจอ ${it.images} รูป (เปิดดูที่ /admin/app-changes)`);
  });
  lines.push(
    "",
    "กติกา:",
    "- ถ้าแก้ของกลาง ให้รัน npm run where-used แล้วบอกหน้าที่กระทบก่อนแก้",
    "- งานที่มีหน้าจอ ทำ widget PC + มือถือให้ดูก่อน (CLAUDE.md §46 Step 3.5)",
    "- ใส่รหัส [CH-…] ของข้อที่ทำไว้ในบรรทัดแรกของข้อความ commit → ระบบติดป้าย \"รอขึ้นเว็บ / ขึ้นเว็บแล้ว\" ให้เอง",
  );
  return lines.join("\n");
}
