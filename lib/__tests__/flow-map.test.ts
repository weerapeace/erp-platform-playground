import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FLOW_NODES, FLOW_EDGES, FLOW_VIEWS, FLOW_METRICS, FLOW_JOURNEY, FLOW_ISSUE_APP, FLOW_FINANCE_ONLY, flowViewsFor } from "@/lib/flow-map";
import { flowGeometryProblems, isRecentEdge } from "@/lib/flow-map-layout";
import { buildFlowPrompt } from "@/lib/flow-map-prompt";
import { FLOW_ADVICE, FLOW_ADVICE_VERDICTS } from "@/lib/flow-map-advice";
import { cleanFlowNote, FLOW_NOTE_MAX } from "@/lib/flow-map-notes";
import { WORKFLOWS } from "@/lib/workflow-registry";
import { LINE_SLOTS, LINE_ALL_EVENTS } from "@/lib/line-registry";
import {
  NOTIFY_TOPICS, NOTIFY_AREAS, NOTIFY_REPORT_FILES, notifyTargetCell, notifyTopicState, notifyGhostRules, notifyReportTopics, notifyDaysText, notifyGapNodes,
  NOTIFY_SAMPLES, NOTIFY_NODE_SUGGEST, notifyTopicSwitch, notifyTestGroup, notifyTopicStat,
  type NotifyLive,
} from "@/lib/flow-map-notify";

const NOTIFY_LIVE: NotifyLive = {
  line: { token: true, main: true, groups: { purchase_request: true, creative: true }, off: { qc_defect: true } },
  rules: [{ event: "pr.submitted", name: "เก่า", active: true }, { event: "qc.pending", name: "รอ QC", active: true }, { event: "wo.due_soon", name: "ใกล้กำหนด", active: false }],
  staff: { active: 60, linked: 0 }, push: 0, email: true,
  shops: { total: 3, line: 0, email: 0, oa: 0 }, stats: {}, channels: { email: true, popup: true, discord: true, line: true },
  reports: [{ id: "r1", name: "งานค้าง", time: "08:00:00", days: [1, 2, 3, 4, 5, 6], on: true, email: false, popup: true, discord: true, line: false }],
};

describe("แผนผังการทำงาน — แท็บแจ้งเตือน", () => {
  it("ทะเบียนอ้างของจริง: ไฟล์มีอยู่ · กล่อง/กลุ่ม LINE/สวิตช์ LINE มีจริง · id ไม่ซ้ำ", () => {
    const ids = NOTIFY_TOPICS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of NOTIFY_TOPICS) {
      expect(NOTIFY_AREAS[x.area], x.id).toBeTruthy();
      if (x.node) expect(FLOW_NODES[x.node], `${x.id}: กล่อง ${x.node}`).toBeTruthy();
      expect(x.send.length, x.id).toBeGreaterThan(0);
      for (const f of x.files) expect(existsSync(resolve(process.cwd(), f)), `${x.id}: ${f}`).toBe(true);
      for (const t of x.send) if (t.kind === "group") {
        for (const g of t.groups) if (g !== "main") expect(LINE_SLOTS[g], `${x.id}: กลุ่ม ${g}`).toBeTruthy();
        if (t.event) expect(LINE_ALL_EVENTS, `${x.id}: สวิตช์ ${t.event}`).toContain(t.event);
      }
    }
    for (const f of NOTIFY_REPORT_FILES) expect(existsSync(resolve(process.cwd(), f)), f).toBe(true);
    for (const a of Object.values(NOTIFY_AREAS)) for (const n of a.nodes) expect(FLOW_NODES[n], n).toBeTruthy();
  });
  it("สวิตช์เหตุการณ์ในศูนย์ LINE ทุกตัวมีเรื่องในทะเบียน", () => {
    const used = new Set(NOTIFY_TOPICS.flatMap((x) => x.send.flatMap((t) => (t.kind === "group" && t.event ? [t.event] : []))));
    expect(LINE_ALL_EVENTS.filter((e) => !used.has(e))).toEqual([]);
  });
  it("สถานะ: กลุ่มไม่ตั้ง = เงียบ · fallback ใช้กลุ่มถัดไป · ปิดสวิตช์ = ปิด · กฎปิด = ปิด · ช่างไม่ผูก = เงียบ", () => {
    expect(notifyTargetCell({ kind: "group", to: "กลุ่มผลิต", groups: ["production"], event: "wo_dispatched" }, NOTIFY_LIVE).state).toBe("warn");
    const fb = notifyTargetCell({ kind: "group", to: "กลุ่มใบสั่งซื้อ", groups: ["purchase_order", "purchase_request"] }, NOTIFY_LIVE);
    expect(fb.state).toBe("ok");
    expect(fb.text).toContain(LINE_SLOTS.purchase_request.label);
    expect(notifyTargetCell({ kind: "group", to: "กลุ่ม QC", groups: ["qc"], event: "qc_defect" }, NOTIFY_LIVE).state).toBe("off");
    expect(notifyTargetCell({ kind: "bell", to: "ผู้จัดการ", rule: "wo.due_soon" }, NOTIFY_LIVE).state).toBe("off");
    expect(notifyTargetCell({ kind: "bell", to: "ผู้จัดการ", rule: "ไม่มีกฎ" }, NOTIFY_LIVE).state).toBe("warn");
    expect(notifyTargetCell({ kind: "dm", to: "ช่าง" }, NOTIFY_LIVE).state).toBe("warn");
    expect(notifyTargetCell({ kind: "email", to: "ลูกค้า", shop: true }, NOTIFY_LIVE).state).toBe("warn");
    expect(notifyTargetCell({ kind: "group", to: "ครีเอทีฟ", groups: ["creative", "main"] }, { ...NOTIFY_LIVE, line: { ...NOTIFY_LIVE.line, token: false } }).state).toBe("warn");
    const pr = NOTIFY_TOPICS.find((x) => x.id === "pr_created")!;
    expect(notifyTopicState(pr, NOTIFY_LIVE)).toEqual({ state: "ok", silent: 0 });
    const wo = NOTIFY_TOPICS.find((x) => x.id === "wo_dispatched")!;
    expect(notifyTopicState(wo, NOTIFY_LIVE)).toEqual({ state: "warn", silent: 2 });
  });
  it("กฎกระดิ่งที่ไม่มีโค้ดยิง · รายงานตามเวลา · ขั้นที่ยังไม่มีแจ้งเตือน", () => {
    expect(notifyGhostRules(NOTIFY_LIVE).map((r) => r.event)).toEqual(["pr.submitted"]);
    const [r] = notifyReportTopics(NOTIFY_LIVE);
    expect(r.when).toBe("08:00 น. จ–ส");
    expect(r.send.map((x) => x.kind)).toEqual(["popup", "discord"]);
    expect(notifyTopicState({ ...r, paused: true }, NOTIFY_LIVE).state).toBe("off");
    expect(notifyDaysText([0, 1, 2, 3, 4, 5, 6])).toBe("ทุกวัน");
    expect(notifyGapNodes("sell")).toContain("qt");
    expect(notifyGapNodes("sell")).not.toContain("bill");
  });
});

describe("แผนผังการทำงาน — แผงกระดิ่งบนกล่อง", () => {
  const topic = (id: string) => NOTIFY_TOPICS.find((x) => x.id === id)!;
  it("ทุกเรื่องที่ผูกกล่องมีตัวอย่างข้อความ · เรื่องที่ลงกระดิ่งมีตัวอย่างกระดิ่ง · ไม่มีตัวเลขเงินจริง", () => {
    for (const k of Object.keys(NOTIFY_SAMPLES)) expect(NOTIFY_TOPICS.some((x) => x.id === k), `ตัวอย่างของเรื่องที่ไม่มี: ${k}`).toBe(true);
    for (const x of NOTIFY_TOPICS.filter((y) => y.node)) {
      const s = NOTIFY_SAMPLES[x.id];
      expect(s?.bell || s?.line, `${x.id}: ไม่มีตัวอย่างข้อความ`).toBeTruthy();
      if (x.send.some((t) => t.kind === "bell")) expect(s?.bell, `${x.id}: ลงกระดิ่งแต่ไม่มีตัวอย่างกระดิ่ง`).toBeTruthy();
      if (x.send.some((t) => t.kind === "group" || t.kind === "dm")) expect(s?.line, `${x.id}: ส่ง LINE แต่ไม่มีตัวอย่าง LINE`).toBeTruthy();
      expect(JSON.stringify(s), `${x.id}: มีตัวเลขเงิน`).not.toMatch(/฿\s*\d/);
    }
  });
  it("ข้อเสนอชี้กล่องที่มีจริง", () => {
    for (const [n, list] of Object.entries(NOTIFY_NODE_SUGGEST)) {
      expect(FLOW_NODES[n], n).toBeTruthy();
      expect(list.length, n).toBeGreaterThan(0);
    }
  });
  it("สวิตช์ทั้งเรื่อง: นับกฎที่มีจริง + สวิตช์ LINE (ไม่นับที่กดส่งเอง)", () => {
    expect(notifyTopicSwitch(topic("pr_created"), NOTIFY_LIVE)).toEqual({ rules: [], events: ["pr_created"], can: true, on: true });
    expect(notifyTopicSwitch(topic("qc_defect"), NOTIFY_LIVE)).toMatchObject({ rules: [], events: ["qc_defect"], can: true, on: false });
    expect(notifyTopicSwitch(topic("qc_pending"), NOTIFY_LIVE)).toMatchObject({ rules: ["qc.pending"], events: ["qc_pending"], on: true });
    expect(notifyTopicSwitch(topic("wo_due_soon"), { ...NOTIFY_LIVE, line: { ...NOTIFY_LIVE.line, off: { wo_due_soon: true } } }).on).toBe(false);
    expect(notifyTopicSwitch(topic("china_pay"), NOTIFY_LIVE).can).toBe(false);
    expect(notifyTopicSwitch(topic("catch_up_request"), NOTIFY_LIVE).can).toBe(false);
  });
  it("กลุ่มทดสอบ LINE = กลุ่มแรกที่ตั้งแล้ว · ไม่ตั้ง / ปิดสวิตช์ / ไม่มีบอท = ทดสอบไม่ได้", () => {
    expect(notifyTestGroup(topic("pr_created"), NOTIFY_LIVE)).toBe("purchase_request");
    expect(notifyTestGroup(topic("po_created"), NOTIFY_LIVE)).toBe("purchase_request");
    expect(notifyTestGroup(topic("subtask_submitted"), NOTIFY_LIVE)).toBe("creative");
    expect(notifyTestGroup(topic("wo_dispatched"), NOTIFY_LIVE)).toBeNull();
    expect(notifyTestGroup(topic("qc_defect"), NOTIFY_LIVE)).toBeNull();
    expect(notifyTestGroup(topic("pr_created"), { ...NOTIFY_LIVE, line: { ...NOTIFY_LIVE.line, token: false } })).toBeNull();
  });
  it("ตัวเลข 7 วันรวมหลาย event_type", () => {
    const live = { ...NOTIFY_LIVE, stats: { task_overdue: { n: 10, read: 2, users: 3, last: "2026-11-09", n7: 4, read7: 1 }, task_due_soon: { n: 5, read: 0, users: 2, last: "2026-11-08", n7: 2, read7: 1 } } };
    expect(notifyTopicStat(topic("task_due"), live)).toMatchObject({ n: 15, n7: 6, read7: 2, last: "2026-11-09" });
  });
});

describe("แผนผังการทำงาน — คำแนะนำ + โน้ต", () => {
  it("คำแนะนำชี้เส้นที่มีอยู่จริง · คำตัดสินมีป้าย · มีเหตุผล", () => {
    for (const [id, a] of Object.entries(FLOW_ADVICE)) {
      expect(FLOW_EDGES[id], `ไม่มีเส้น ${id}`).toBeTruthy();
      expect(FLOW_ADVICE_VERDICTS[a.verdict], id).toBeTruthy();
      expect(a.why.length, id).toBeGreaterThan(5);
    }
  });
  it("เส้นที่ยังไม่เชื่อม / คนต้องกด มีคำแนะนำครบทุกเส้น", () => {
    const missing = Object.entries(FLOW_EDGES).filter(([id, e]) => (e.type === "missing" || e.type === "manual") && !FLOW_ADVICE[id]).map(([id]) => id);
    expect(missing).toEqual([]);
  });
  it("ตัวตรวจโน้ต: ข้อความยาวตัด · สี/ตำแหน่งผิดใช้ค่าตั้งต้น · ผังผิด = null", () => {
    const d = cleanFlowNote({ text: "ก".repeat(FLOW_NOTE_MAX + 50), color: "ม่วง", view: "ov", x: 9999, y: -5, attach: { kind: "e", id: "S4" } });
    expect(d?.text.length).toBe(FLOW_NOTE_MAX);
    expect(d?.color).toBe("yellow");
    expect(d?.x).toBeLessThanOrEqual(680);
    expect(d?.y).toBe(0);
    expect(d?.attach).toEqual({ kind: "e", id: "S4" });
    expect(cleanFlowNote({ text: "x", view: "<script>" })).toBeNull();
    expect(cleanFlowNote({ text: "x", view: "ov", attach: { kind: "x", id: "1" } })?.attach).toBeNull();
  });
  it("prompt แนบคำแนะนำของเส้น + โน้ตที่แปะไว้", () => {
    const p = buildFlowPrompt([{ kind: "e", ref: "P1", text: "ทำกึ่งอัตโนมัติ" }], null, undefined, [{ attach: { kind: "e", id: "P1" }, text: "ซิปต้องสั่งคู่หัวซิป", author: "ตุ้ย" }]);
    expect(p).toContain("คำแนะนำในแผนผัง");
    expect(p).toContain("ซิปต้องสั่งคู่หัวซิป");
  });
});

describe("แผนผังการทำงาน — การวาดและของเสริม", () => {
  it("ทุกผัง: เส้นไม่ทับกล่องอื่น · เลขบนเส้นไม่ซ้อนกัน/ไม่ชนกล่อง · ไม่หลุดขอบ", () => {
    expect(FLOW_VIEWS.flatMap(flowGeometryProblems)).toEqual([]);
  });
  it("แท็บออเดอร์ 1 ใบ อ้างกล่อง/เส้นที่มีอยู่จริง", () => {
    for (const s of FLOW_JOURNEY) {
      expect(FLOW_NODES[s.node], s.title).toBeTruthy();
      for (const id of s.edges) expect(FLOW_EDGES[id], `${s.title}: ${id}`).toBeTruthy();
    }
  });
  it("ป้าย “เพิ่งแก้”: วันที่รูปแบบ YYYY-MM-DD · หมดอายุตามจำนวนวัน", () => {
    for (const [id, e] of Object.entries(FLOW_EDGES)) if (e.changed) expect(e.changed.date, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isRecentEdge("X8", new Date("2026-11-03T10:00:00+07:00"))).toBe(true);
    expect(isRecentEdge("X8", new Date("2027-01-15T10:00:00+07:00"))).toBe(false);
    expect(isRecentEdge("P3", new Date("2026-11-03T10:00:00+07:00"))).toBe(false);
  });
  it("ทุกส่วนมีแอปปลายทางของรายงานปัญหา", () => {
    for (const n of Object.values(FLOW_NODES)) expect(FLOW_ISSUE_APP[n.area]).toBeTruthy();
  });
  it("prompt แนบข้อมูลของส่วนนั้น + สิ่งที่อยากแก้ + ข้อกำหนด", () => {
    const p = buildFlowPrompt([{ kind: "n", ref: "pay", text: "ดึงค่าเหมาเข้าเงินเดือนเอง" }, { kind: "e", ref: "S4", text: "ตั้งวันเริ่มนับ" }], { stock_fg: 5 });
    expect(p).toContain("CLAUDE.md");
    expect(p).toContain("เงินเดือน");
    expect(p).toContain("payroll_adjustments");
    expect(p).toContain("ดึงค่าเหมาเข้าเงินเดือนเอง");
    expect(p).toContain("ตั้งวันเริ่มนับ");
    expect(p).toContain("npm run where-used -- sales-order");
    expect(p).toContain("lib/flow-map.ts");
  });
});

// แผนผังการทำงาน (/master/flow-map) ต้องไม่ตกยุค: ไฟล์ที่อ้างต้องมีจริง · กล่อง/เส้น/ผังต้องชี้กันถูก
const root = resolve(__dirname, "../..");

describe("ทะเบียนแผนผังการทำงาน", () => {
  it("ไฟล์ที่เส้นอ้างว่า “ทำจริง” มีอยู่ทุกไฟล์ (ย้าย/ลบไฟล์แล้วต้องแก้ lib/flow-map.ts)", () => {
    const missing = Object.entries(FLOW_EDGES).flatMap(([id, e]) => e.files.filter((f) => !existsSync(resolve(root, f))).map((f) => `${id}: ${f}`));
    expect(missing).toEqual([]);
  });

  it("เส้นทุกเส้นชี้กล่องที่มีอยู่ · workflow ชี้ทะเบียน workflow ที่มีอยู่", () => {
    const keys = new Set(WORKFLOWS.map((w) => w.key));
    const bad = Object.entries(FLOW_EDGES).filter(([, e]) => !FLOW_NODES[e.from] || !FLOW_NODES[e.to] || (e.workflow && !keys.has(e.workflow))).map(([id]) => id);
    expect(bad).toEqual([]);
  });

  it("ตัวเลขสดที่อ้างมีนิยาม", () => {
    const used = [...Object.values(FLOW_NODES), ...Object.values(FLOW_EDGES)].flatMap((x) => x.metrics ?? []);
    expect(used.filter((m) => !FLOW_METRICS[m])).toEqual([]);
  });

  it("ทุกผัง: เส้นที่วาดมีอยู่จริง และต้น/ปลายอยู่ในผังนั้น · ไม่มีกล่องทับตำแหน่งกัน", () => {
    for (const v of FLOW_VIEWS) {
      for (const [id, , , , , o] of v.edges) {
        const e = FLOW_EDGES[id];
        expect(e, `${v.key}: ไม่มีเส้น ${id}`).toBeTruthy();
        expect(v.pos[o?.a ?? e.from], `${v.key}/${id}: ต้นทาง`).toBeTruthy();
        expect(v.pos[o?.b ?? e.to], `${v.key}/${id}: ปลายทาง`).toBeTruthy();
      }
      for (const id of Object.keys(v.pos)) expect(FLOW_NODES[id], `${v.key}: ไม่มีกล่อง ${id}`).toBeTruthy();
      const spots = Object.values(v.pos).map((p) => p.join(","));
      expect(new Set(spots).size, `${v.key}: กล่องทับกัน`).toBe(spots.length);
    }
  });

  it("ผังการเงิน: คนไม่มีสิทธิ์ไม่เห็นสักผัง · มีสิทธิ์เห็นครบ · มีหัวคอลัมน์ 4 ช่อง", () => {
    const fin = FLOW_VIEWS.filter((v) => v.finance);
    expect(fin.map((v) => v.key)).toEqual(["cash", "cashin", "cashout", "debt", "acct"]);
    expect(flowViewsFor(false).some((v) => v.finance)).toBe(false);
    expect(flowViewsFor(true).length).toBe(FLOW_VIEWS.length);
    for (const v of fin) expect(v.heads?.length, v.key).toBe(4);
  });

  it("ผังการเงิน: ตัวเลขเงินติดได้แค่กล่อง/เส้นที่มีแค่ในผังการเงิน (ผังทั่วไปไม่โชว์ช่องว่าง/ไม่หลุด)", () => {
    const leak = [
      ...Object.entries(FLOW_NODES).filter(([id]) => !FLOW_FINANCE_ONLY.nodes.has(id)),
      ...Object.entries(FLOW_EDGES).filter(([id]) => !FLOW_FINANCE_ONLY.edges.has(id)),
    ].flatMap(([id, x]) => (x.metrics ?? []).filter((m) => FLOW_METRICS[m].finance).map((m) => `${id}: ${m}`));
    expect(leak).toEqual([]);
    expect(FLOW_FINANCE_ONLY.nodes.has("bank")).toBe(true);
    expect(FLOW_FINANCE_ONLY.nodes.has("bill")).toBe(false);
    expect(FLOW_FINANCE_ONLY.edges.has("F16")).toBe(true);
    expect(FLOW_FINANCE_ONLY.edges.has("S7")).toBe(false);
  });

  it("ภาพรวมมีครบ 4 ส่วน", () => {
    const ov = FLOW_VIEWS.find((v) => v.key === "ov")!;
    const areas = new Set(Object.keys(ov.pos).map((id) => FLOW_NODES[id].area));
    for (const a of ["buy", "make", "dispatch", "sell"] as const) expect(areas.has(a)).toBe(true);
  });
});
