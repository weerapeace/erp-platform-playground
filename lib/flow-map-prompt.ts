/**
 * สร้าง prompt บอก AI (Claude / Codex) จากรายการที่อยากแก้ในหน้าแผนผังการทำงาน — ไม่มี React ใช้ได้ทั้งหน้าจอและเทสต์
 * รายการอยากแก้ผูกกับกล่อง (kind "n") หรือเส้น (kind "e") → แนบข้อมูลของส่วนนั้นจาก lib/flow-map.ts ให้ AI เริ่มงานถูกที่
 */
import { FLOW_NODES, FLOW_EDGES, FLOW_EDGE_TYPES, FLOW_METRICS, FLOW_AREA_LABEL, type FlowMetricKey } from "@/lib/flow-map";

export type FlowRequestItem = { kind: "n" | "e"; ref: string; text: string };
export type FlowPromptOpts = { links: boolean; numbers: boolean; planFirst: boolean };
export const FLOW_PROMPT_DEFAULTS: FlowPromptOpts = { links: true, numbers: true, planFirst: true };
type Health = Partial<Record<FlowMetricKey, number | null>> | null;

/** ชื่อส่วน: กล่อง = ชื่อกล่อง · เส้น = "ต้น → ปลาย" */
export function flowSourceLabel(kind: "n" | "e", ref: string): string {
  if (kind === "n") return FLOW_NODES[ref]?.label ?? ref;
  const e = FLOW_EDGES[ref];
  return e ? `${FLOW_NODES[e.from]?.label ?? e.from} → ${FLOW_NODES[e.to]?.label ?? e.to}` : ref;
}

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const metricLine = (keys: FlowMetricKey[] | undefined, health: Health) =>
  (keys ?? []).map((k) => { const m = FLOW_METRICS[k], v = health?.[k]; return `${m.label} = ${typeof v === "number" ? `${fmt(v)} ${m.unit}` : "ไม่ทราบ"}`; }).join(" · ");
const edgeLine = (id: string) => {
  const e = FLOW_EDGES[id];
  return `[${FLOW_EDGE_TYPES[e.type].label}] ${flowSourceLabel("e", id)}: ${e.title} — ${e.detail}${e.warn ? ` (ระวัง: ${e.warn})` : ""} · ไฟล์ ${e.files.join(", ")}`;
};

/** workflow key ที่เกี่ยวกับส่วนนี้ (สำหรับ npm run where-used) */
function workflowsOf(kind: "n" | "e", ref: string): string[] {
  const ids = kind === "e" ? [ref] : Object.keys(FLOW_EDGES).filter((id) => FLOW_EDGES[id].from === ref || FLOW_EDGES[id].to === ref);
  return ids.map((id) => FLOW_EDGES[id]?.workflow).filter((w): w is string => !!w);
}

export function buildFlowPrompt(items: FlowRequestItem[], health: Health, opts: FlowPromptOpts = FLOW_PROMPT_DEFAULTS): string {
  const groups = new Map<string, { kind: "n" | "e"; ref: string; texts: string[] }>();
  for (const it of items) {
    const k = `${it.kind}:${it.ref}`;
    const g = groups.get(k) ?? { kind: it.kind, ref: it.ref, texts: [] };
    if (it.text.trim() && !g.texts.includes(it.text.trim())) g.texts.push(it.text.trim());
    groups.set(k, g);
  }
  const L: string[] = [];
  L.push("อ่าน CLAUDE.md ก่อน · โค้ดเว็บจริงอยู่สาขา feat/host-portable (เว็บจริง https://erp-platform-playground.vercel.app)");
  L.push(`งาน: แก้ระบบตามรายการด้านล่าง ${groups.size > 1 ? `(${groups.size} ส่วน) ` : ""}— มาจากหน้า "แผนผังการทำงาน" /master/flow-map (ทะเบียน lib/flow-map.ts)`);
  const wf = new Set<string>();
  let n = 0;
  for (const g of groups.values()) {
    n += 1;
    L.push("");
    if (g.kind === "n") {
      const node = FLOW_NODES[g.ref];
      L.push(`## ${n}. ${node.label} (ส่วน${FLOW_AREA_LABEL[node.area]})`);
      L.push(`- หน้า: ${node.pages}`);
      L.push(`- เก็บที่: ${node.tables}`);
      L.push(`- สถานะ: ${node.statuses}`);
      if (opts.numbers && node.metrics?.length) L.push(`- ตัวเลขตอนนี้: ${metricLine(node.metrics, health)}`);
      if (node.gaps?.length) L.push(`- ช่องโหว่ที่รู้แล้ว: ${node.gaps.join(" · ")}`);
      if (opts.links) {
        const rel = Object.keys(FLOW_EDGES).filter((id) => FLOW_EDGES[id].from === g.ref || FLOW_EDGES[id].to === g.ref);
        if (rel.length) { L.push("- เส้นที่เข้า/ออก:"); for (const id of rel) L.push(`  · ${edgeLine(id)}`); }
      }
    } else {
      const e = FLOW_EDGES[g.ref];
      L.push(`## ${n}. เส้น ${flowSourceLabel("e", g.ref)} [${FLOW_EDGE_TYPES[e.type].label}]`);
      L.push(`- กด/ทำอะไร: ${e.title}`);
      L.push(`- ระบบทำอะไรต่อ: ${e.detail}`);
      if (e.warn) L.push(`- ระวัง: ${e.warn}`);
      if (opts.links) L.push(`- ไฟล์ที่ทำจริง: ${e.files.join(", ")}`);
      if (opts.numbers && e.metrics?.length) L.push(`- ตัวเลขตอนนี้: ${metricLine(e.metrics, health)}`);
    }
    workflowsOf(g.kind, g.ref).forEach((w) => wf.add(w));
    L.push("สิ่งที่เจ้าของอยากแก้:");
    if (g.texts.length) g.texts.forEach((t, i) => L.push(`${i + 1}. ${t}`));
    else L.push("(ยังไม่ได้ระบุ — ถามเจ้าของก่อน)");
  }
  L.push("");
  L.push("ข้อกำหนด:");
  if (opts.planFirst) {
    L.push(`- ก่อนแก้: ${wf.size ? `รัน npm run where-used -- ${[...wf].join(" / ")} ` : "เช็กว่าใครใช้ไฟล์/ตารางที่จะแตะ "}แล้วบอกเป็นภาษาคนว่ากระทบหน้าไหน`);
    L.push("- เสนอแผนเป็นภาษาไทยก่อนลงมือ · ห้ามแก้ข้อมูลจริง/ฐานข้อมูลโดยไม่ถามเจ้าของ");
  }
  L.push("- ใช้ของกลางตาม CLAUDE.md (ตาราง/ป๊อป/ฟอร์ม/ตัวเลือกกลาง) ไม่สร้างเองเฉพาะหน้า");
  L.push("- แก้เสร็จ: อัปเดต lib/flow-map.ts (แบบเส้น / ข้อความ / ช่องโหว่ + changed วันที่แก้) แล้วตรวจหลัง deploy ครบ 4 ชั้น");
  return L.join("\n");
}
