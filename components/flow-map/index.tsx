"use client";

/**
 * 🧭 แผนผังการทำงาน — "กดอะไร แล้วไปอัปเดตอะไรต่อ" ของ ซื้อ · ผลิต · จ่ายงาน · ขาย
 * วาดจากทะเบียน lib/flow-map.ts (กล่อง/เส้น/ผัง) + เรขาคณิต lib/flow-map-layout.ts + ตัวเลขสดจาก /api/flow-map/health
 * ของเสริม: ช่องอยากแก้ + สร้าง prompt + ตะกร้า + ส่งรายงานปัญหา (./request) · กดตัวเลขดูรายการ (./metric-list)
 *          แท็บออเดอร์ 1 ใบ (./journey) · ป้ายเพิ่งแก้ (FlowEdge.changed) · พิมพ์ /print/flow-map
 *          ผังการเงิน 5 แท็บ เฉพาะผู้มีสิทธิ์ FLOW_FINANCE_PERM (flowViewsFor) · กล่องสูงหลายแถว · เส้นรวมสาย (feeds)
 *          แท็บแจ้งเตือน (./notify · ทะเบียน lib/flow-map-notify.ts) + กระดิ่งบนกล่อง
 *          กดกล่อง/เส้น → ลิ้นชักขวา (DrawerShell modal={false} — ผังกดต่อได้) แบ่งแท็บ: กล่อง = ภาพรวม/ช่องโหว่/แจ้งเตือน/เส้นเข้า-ออก/โน้ต/อยากแก้อะไร
 *            · เส้น = รายละเอียด/คำแนะนำ/โน้ต/อยากแก้อะไร · กระดิ่ง = เปิดแท็บแจ้งเตือน · แผงขวาของหน้า = ภาพรวมผัง (ช่องโหว่ + ทุกเส้น + โน้ตผัง)
 * ใช้ที่ /master/flow-map · แก้เนื้อหาแผนผังที่ lib/flow-map.ts ที่เดียว (ดู docs/flow-map.md)
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import {
  FLOW_NODES, FLOW_EDGES, FLOW_METRICS, FLOW_EDGE_TYPES, FLOW_AREA_LABEL, FLOW_RECENT_DAYS, FLOW_FINANCE_PERM, flowViewsFor,
  type FlowEdgeType, type FlowMetricKey,
} from "@/lib/flow-map";
import { FM_W, FM_CX, FM_BAND_LABELS, FM_CASHFLOW_DOT, fmXY, fmBox, fmTouches, layoutFlowView, isRecentEdge, type FmDrawn } from "@/lib/flow-map-layout";
import { FlowRequestBox, FlowBasketPanel, useFlowBasket } from "./request";
import { FlowMetricListModal } from "./metric-list";
import { FlowJourney } from "./journey";
import { useFlowNotes, FlowInternalNotes } from "./notes";
import { useFlowNotify, FlowNotifyBoard, FlowNotifyPanel, notifyNodeColor } from "./notify";
import { DrawerShell } from "@/components/modal";
import { ScrollTabs } from "@/components/scroll-tabs";
import { useDrawerResize } from "@/lib/use-drawer-resize";
import { LineConsole } from "@/components/line-console";
import { NotifyEditModal } from "@/components/flow-map/notify-edit";
import { NodeNotifyPanel } from "@/components/flow-map/node-notify";
import { NOTIFY_NODE_SUGGEST, notifyAllTopics, notifyTopicsOfNode } from "@/lib/flow-map-notify";
import { FLOW_ADVICE, FLOW_ADVICE_VERDICTS } from "@/lib/flow-map-advice";

type Sel = { k: "n"; id: string } | { k: "e"; id: string } | null;
/** แท็บในลิ้นชักกล่อง / ลิ้นชักเส้น */
type NodeTab = "ov" | "gaps" | "notify" | "links" | "notes" | "req";
type EdgeTab = "d" | "advice" | "notes" | "req";

/** คำแนะนำของเส้น — ควรทำอัตโนมัติไหม · ข้อดี · ข้อเสีย · จุดเสี่ยง · flow แบบอื่น (lib/flow-map-advice.ts) */
function AdviceBox({ id }: { id: string }) {
  const t = useT();
  const a = FLOW_ADVICE[id];
  if (!a) return null;
  const v = FLOW_ADVICE_VERDICTS[a.verdict];
  const list = (title: string, items: string[] | undefined, mark: ReactNode) => items?.length ? (
    <div className="mt-2">
      <div className="text-[11px] text-slate-500">{title}</div>
      {items.map((x) => <div key={x} className="flex gap-1.5 text-[12.5px] text-slate-700 mt-0.5"><span className="shrink-0 w-3 text-center" aria-hidden="true">{mark}</span>{x}</div>)}
    </div>
  ) : null;
  return (
    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/30 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-medium text-slate-800 flex items-center gap-1.5"><Icon value="💡" />{t("ควรทำอัตโนมัติไหม?", "Automate this?")}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-md border ${v.chip}`}>{t("แนะนำ", "Suggest")}: {v.label}</span>
      </div>
      <div className="mt-1 text-[12.5px] text-slate-700">{a.why}</div>
      {list(t("ข้อดีถ้าทำ", "Pros"), a.pros, <span className="text-green-600">+</span>)}
      {list(t("ข้อเสีย / ทำไมไม่ทำอัตโนมัติเต็ม", "Cons"), a.cons, <span className="text-amber-600">−</span>)}
      {list(t("จุดเสี่ยงตอนนี้", "Risks now"), a.risks, <span className="text-red-600">!</span>)}
      {list(t("flow แบบอื่นที่ควรพิจารณา", "Other flows to consider"), a.alts, <span className="text-violet-600">→</span>)}
    </div>
  );
}
type Health = Partial<Record<FlowMetricKey, number | null>>;
const JOURNEY = "journey";
const NOTIFY = "notify";
/** รูปกระดิ่งเล็กบนกล่อง (ราว 8×8 รอบจุด 0,0) */
const BELL_D = "M0 -4.2c-1.7 0 -3 1.3 -3 3v2.2l-1 1.3h8l-1 -1.3v-2.2c0 -1.7 -1.3 -3 -3 -3zM-1 3.2a1 1 0 0 0 2 0";

const TYPE_CHIP: Record<FlowEdgeType, string> = {
  auto: "bg-green-50 text-green-700 border-green-200",
  live: "bg-blue-50 text-blue-700 border-blue-200",
  manual: "bg-amber-50 text-amber-800 border-amber-200",
  missing: "bg-red-50 text-red-700 border-red-200",
};
const fmtNum = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

function LineSample({ type }: { type: FlowEdgeType }) {
  const t = FLOW_EDGE_TYPES[type];
  return <svg width="22" height="6" aria-hidden="true" className="shrink-0"><line x1="2" y1="3" x2="20" y2="3" stroke={t.color} strokeWidth="2" strokeDasharray={t.dash} strokeLinecap="round" /></svg>;
}
function TypeChip({ type }: { type: FlowEdgeType }) {
  return <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap ${TYPE_CHIP[type]}`}><LineSample type={type} />{FLOW_EDGE_TYPES[type].label}</span>;
}
function NumBadge({ n, type }: { n: number | null; type: FlowEdgeType }) {
  return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border-[1.5px] text-[11px] font-semibold bg-white shrink-0" style={{ borderColor: FLOW_EDGE_TYPES[type].color, color: FLOW_EDGE_TYPES[type].color }}>{n ?? "•"}</span>;
}
function RecentPill({ id }: { id: string }) {
  const t = useT();
  const c = FLOW_EDGES[id]?.changed;
  if (!c || !isRecentEdge(id)) return null;
  return <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap">{t("เพิ่งแก้", "Updated")} {shortDate(c.date)}</span>;
}
function MetricRows({ keys, health, onOpen }: { keys?: FlowMetricKey[]; health: Health | null; onOpen: (k: FlowMetricKey) => void }) {
  const t = useT();
  if (!keys?.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {keys.map((k) => {
        const m = FLOW_METRICS[k], v = health?.[k];
        const bad = m.bad && typeof v === "number" && v > 0;
        return (
          <button key={k} type="button" onClick={() => onOpen(k)} title={t("กดดูรายการ", "Show list")}
            className="w-full flex items-baseline justify-between gap-3 text-[13px] text-left rounded-md px-1 -mx-1 hover:bg-slate-50">
            <span className="text-slate-600">{m.label}</span>
            <span className={`font-semibold tabular-nums whitespace-nowrap underline decoration-dotted underline-offset-2 ${bad ? "text-red-600" : "text-slate-800"}`}>
              {health == null ? "…" : v == null ? "—" : `${fmtNum(v)} ${m.unit}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function FlowMap() {
  const t = useT();
  const { can } = useAuth();
  const canFinance = can(FLOW_FINANCE_PERM);
  const canAdmin = can("admin.users");   // ศูนย์ LINE + หน้าตั้งกฎแจ้งเตือน ใช้สิทธิ์นี้
  const notify = useFlowNotify();
  const [notifySel, setNotifySel] = useState<string | null>(null);
  const [lineOpen, setLineOpen] = useState(false);
  const [notifyEditId, setNotifyEditId] = useState<string | null>(null);   // ป๊อปแก้การแจ้งเตือน (แอดมิน)
  // ลิ้นชักรายละเอียด (เจ้าของเลือก 2026-11-10): กดกล่อง/เส้น → ลิ้นชักขวา ไม่มืดพื้นหลัง (กดกล่องอื่นต่อได้) + แท็บแยกประเภท
  const [dTab, setDTab] = useState<NodeTab>("ov");   // แท็บของกล่อง — จำไว้ตอนกดกล่องอื่น (ไล่เทียบได้)
  const [eTab, setETab] = useState<EdgeTab>("d");    // แท็บของเส้น
  const [backNode, setBackNode] = useState<string | null>(null);   // เปิดเส้นจากแท็บ "เส้นเข้า/ออก" → ปุ่มกลับไปกล่องเดิม
  const drawerSize = useDrawerResize("erp.flowMap.drawerW", 440, 360);
  const views = useMemo(() => flowViewsFor(canFinance), [canFinance]);   // ผังการเงินเฉพาะผู้มีสิทธิ์ (แอดมินมีเสมอ)
  const basket = useFlowBasket();
  const notesApi = useFlowNotes();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewKey, setViewKey] = useState("ov");
  const [sel, setSel] = useState<Sel>(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [metric, setMetric] = useState<FlowMetricKey | null>(null);
  const [hide, setHide] = useState<Partial<Record<FlowEdgeType, boolean>>>({});
  const [health, setHealth] = useState<Health | null>(null);
  const [healthAt, setHealthAt] = useState<string | null>(null);
  const [healthErr, setHealthErr] = useState(false);

  useEffect(() => {
    let off = false;
    apiFetch("/api/flow-map/health").then((r) => r.json()).then((j) => {
      if (off) return;
      if (j?.error) { setHealthErr(true); setHealth({}); return; }
      setHealth((j?.data ?? {}) as Health); setHealthAt((j?.at as string) ?? null);
    }).catch(() => { if (!off) { setHealthErr(true); setHealth({}); } });
    return () => { off = true; };
  }, []);

  const isJourney = viewKey === JOURNEY;
  const isNotify = viewKey === NOTIFY;
  const view = views.find((v) => v.key === viewKey) ?? views[0];
  const drawn = useMemo(() => layoutFlowView(view), [view]);
  const shown = drawn.filter((e) => !hide[e.type]);
  const numOf = (id: string) => { const d = drawn.find((x) => x.id === id); return isJourney || !d ? null : d.i + 1; };
  const counts = useMemo(() => {
    const c: Record<FlowEdgeType, number> = { auto: 0, live: 0, manual: 0, missing: 0 };
    for (const e of drawn) c[e.type]++;
    return c;
  }, [drawn]);
  const isGray = (id: string) => (view.gray ? view.gray.includes(id) : !(view.own ?? []).includes(id));
  const nodeAlert = (id: string) => {
    const n = FLOW_NODES[id];
    return !!n.gaps?.length || !!n.metrics?.some((k) => FLOW_METRICS[k].bad && (health?.[k] ?? 0) > 0);
  };
  const edgeOn = (e: FmDrawn) => !sel || (sel.k === "n" ? fmTouches(e, sel.id) : sel.id === e.id);
  const nodeOn = (id: string) => {
    if (!sel) return true;
    if (sel.k === "n") return sel.id === id || shown.some((e) => fmTouches(e, sel.id) && fmTouches(e, id));
    const d = drawn.find((x) => x.id === sel.id);
    return !d || fmTouches(d, id);
  };
  const pick = (s: Sel) => { setSel(s); setBasketOpen(false); setBackNode(null); };
  /** กดกระดิ่งบนกล่อง = เปิดลิ้นชักกล่องที่แท็บแจ้งเตือน */
  const openBell = (id: string) => { setSel({ k: "n", id }); setBasketOpen(false); setBackNode(null); setDTab("notify"); };
  const closeDrawer = () => { setSel(null); setBackNode(null); };

  // ── โน้ตภายใน (อยู่ในแผงขวาเท่านั้น ไม่วาดบนผัง) ──
  const promptNotes = notesApi.notes.map((n) => ({ attach: n.attach, text: n.text, author: n.author }));
  const notesOf = (kind: "n" | "e", id: string) => notesApi.notes.filter((n) => n.attach?.kind === kind && n.attach.id === id);
  const noteView = isJourney ? views[0].key : view.key;   // แท็บออเดอร์ไม่มีผังของตัวเอง → นับเป็นผังแรก
  const freeNotes = isJourney ? [] : notesApi.notes.filter((n) => !n.attach && n.view === view.key);
  const onNodeClick = (e: RMouseEvent, id: string, picked: boolean) => {
    e.stopPropagation();
    pick(picked ? null : { k: "n", id });
  };
  const onEdgeClick = (e: RMouseEvent, id: string, toggle: boolean) => {
    e.stopPropagation();
    pick(toggle && sel?.k === "e" && sel.id === id ? null : { k: "e", id });
  };
  const pickView = (k: string) => { setViewKey(k); setSel(null); setBackNode(null); };
  /** แท็บแจ้งเตือน → กล่องในผังแรกที่มีกล่องนั้น */
  const openNodeOnMap = (id: string) => { const v = views.find((x) => x.pos[id]); setViewKey(v?.key ?? views[0].key); setSel({ k: "n", id }); setBasketOpen(false); };
  const openNotify = (id: string | null) => { setViewKey(NOTIFY); setSel(null); setBasketOpen(false); setNotifySel(id); };
  const closeLine = () => { setLineOpen(false); void notify.reload(); };

  /** แถวเส้น 1 เส้น — fromNode = เปิดจากแท็บ "เส้นเข้า/ออก" ของกล่องนั้น (ลิ้นชักเส้นมีปุ่มกลับ) */
  const rowFor = (id: string, a: string, b: string, type: FlowEdgeType, fromNode?: string) => (
    <button key={id} type="button" onClick={() => { if (fromNode) { setSel({ k: "e", id }); setBackNode(fromNode); } else pick({ k: "e", id }); }}
      className="w-full flex items-start gap-2.5 px-2 py-2 text-left border-t border-slate-100 hover:bg-slate-50 rounded-md">
      <NumBadge n={numOf(id)} type={type} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-slate-800">{FLOW_NODES[a].label} → {FLOW_NODES[b].label}</span>
        <span className="block text-[12px] text-slate-500">{FLOW_EDGES[id].title} <RecentPill id={id} />
          {FLOW_ADVICE[id] && FLOW_ADVICE[id].verdict !== "keep" && type !== "auto" && <span className="text-violet-600"> · {t("แนะนำ", "Suggest")}: {FLOW_ADVICE_VERDICTS[FLOW_ADVICE[id].verdict].label}</span>}
        </span>
      </span>
      <TypeChip type={type} />
    </button>
  );
  // ── ลิ้นชักรายละเอียดกล่อง / เส้น (DrawerShell ของกลาง แบบไม่มืดพื้นหลัง → กดกล่องอื่นบนผังต่อได้) ──
  const tabBtn = (key: string, active: string, set: (k: string) => void, label: string, count?: number, red?: boolean) => (
    <button key={key} type="button" data-tab-key={key} onClick={() => set(key)}
      className={`h-10 px-2.5 inline-flex items-center gap-1 text-[12.5px] whitespace-nowrap border-b-2 ${active === key ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      {label}
      {count ? <span className={`text-[10.5px] px-1.5 rounded-full tabular-nums ${red ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{count}</span> : null}
    </button>
  );
  const closeX = (
    <button type="button" onClick={closeDrawer} aria-label={t("ปิด", "Close")} title={t("ปิด (Esc)", "Close (Esc)")}
      className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Icon value="i:x" size={16} /></button>
  );
  let drawerHead: ReactNode = null, drawerTabs: ReactNode = null, drawerBody: ReactNode = null;
  if (sel?.k === "n" && !isNotify && !basketOpen) {
    const n = FLOW_NODES[sel.id];
    const rel = isJourney
      ? Object.keys(FLOW_EDGES).filter((id) => FLOW_EDGES[id].from === sel.id || FLOW_EDGES[id].to === sel.id).map((id) => ({ id, a: FLOW_EDGES[id].from, b: FLOW_EDGES[id].to, type: FLOW_EDGES[id].type }))
      : drawn.filter((e) => fmTouches(e, sel.id));
    const badMetrics = (n.metrics ?? []).filter((k) => FLOW_METRICS[k].bad && (health?.[k] ?? 0) > 0);
    const gapCount = (n.gaps?.length ?? 0) + badMetrics.length;
    const topics = notifyTopicsOfNode(sel.id);
    const nNotes = notesOf("n", sel.id);
    const tab: NodeTab = dTab;
    drawerHead = (
      <div className="flex items-start gap-2 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[16px] text-slate-800">{n.label}</div>
          <div className="text-[11.5px] text-slate-500">{FLOW_AREA_LABEL[n.area]} · {n.sub}</div>
        </div>
        {n.href && (
          <Link href={n.href} className="shrink-0 h-8 px-3 inline-flex items-center gap-1 text-[12px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            {t("เปิดหน้า", "Open")} <span aria-hidden="true">↗</span>
          </Link>
        )}
        {closeX}
      </div>
    );
    const set = (k: string) => setDTab(k as NodeTab);
    drawerTabs = (
      <ScrollTabs activeKey={tab} className="border-b border-slate-200 px-2">
        {tabBtn("ov", tab, set, t("ภาพรวม", "Overview"))}
        {tabBtn("gaps", tab, set, t("ช่องโหว่", "Gaps"), gapCount, true)}
        {tabBtn("notify", tab, set, t("แจ้งเตือน", "Notifications"), topics.length)}
        {tabBtn("links", tab, set, t("เส้นเข้า/ออก", "Links"), rel.length)}
        {tabBtn("notes", tab, set, t("โน้ต", "Notes"), nNotes.length)}
        {tabBtn("req", tab, set, t("อยากแก้อะไร", "Request a change"))}
      </ScrollTabs>
    );
    const jump = (k: NodeTab, label: string, count: number, icon: string, tone = "text-slate-500") => (
      <button type="button" onClick={() => setDTab(k)} className="h-9 px-2.5 inline-flex items-center gap-1.5 text-[12.5px] rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
        <Icon value={icon} size={14} className={tone} />{label}<span className="ml-auto tabular-nums font-medium">{count}</span>
      </button>
    );
    drawerBody = tab === "ov" ? (
      <div className="text-[13px] leading-relaxed">
        {n.metrics?.length ? <><div className="text-[11px] text-slate-500">{t("ตัวเลขตอนนี้ (กดดูรายการ)", "Live numbers (click for list)")}</div><MetricRows keys={n.metrics} health={health} onOpen={setMetric} /></> : null}
        <div className="mt-3 text-[11px] text-slate-500">{t("เก็บที่ (ตาราง)", "Stored in")}</div>
        <div className="font-mono text-[12px] text-slate-700 break-all">{n.tables}</div>
        <div className="mt-3 text-[11px] text-slate-500">{t("สถานะ", "Statuses")}</div>
        <div className="text-slate-800">{n.statuses}</div>
        <div className="mt-3 text-[11px] text-slate-500">{t("หน้าที่ใช้", "Pages")}</div>
        <div className="text-[12.5px] text-slate-600">{n.pages}</div>
        <div className="mt-4 text-[11px] text-slate-500">{t("ในแท็บอื่น", "In other tabs")}</div>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {jump("gaps", t("ช่องโหว่", "Gaps"), gapCount, "i:alert-triangle", gapCount ? "text-red-600" : "text-slate-400")}
          {jump("notify", t("แจ้งเตือน", "Notifications"), topics.length, "i:bell")}
          {jump("links", t("เส้นเข้า/ออก", "Links"), rel.length, "i:arrows-exchange")}
          {jump("notes", t("โน้ต", "Notes"), nNotes.length, "i:notes")}
        </div>
      </div>
    ) : tab === "gaps" ? (
      <div className="text-[13px] leading-relaxed">
        {n.gaps?.length ? n.gaps.map((g) => <div key={g} className="flex gap-1.5 text-red-700 mt-1.5"><Icon value="i:alert-triangle" size={14} className="mt-0.5 shrink-0" />{g}</div>) : null}
        {badMetrics.length ? <><div className="mt-3 text-[11px] text-slate-500">{t("ตัวเลขที่ต้องตาม (กดดูรายการ)", "Numbers to follow (click for list)")}</div><MetricRows keys={badMetrics} health={health} onOpen={setMetric} /></> : null}
        {!gapCount && <div className="py-2 text-slate-500">{t("ไม่มีช่องโหว่ที่รู้ในขั้นนี้", "No known gaps here")}</div>}
        {gapCount > 0 && (
          <button type="button" onClick={() => setDTab("req")} className="mt-3 h-8 px-3 inline-flex items-center gap-1 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Icon value="i:edit" size={13} />{t("อยากให้แก้ข้อไหน → เลือกในแท็บอยากแก้อะไร", "Pick what to fix")}
          </button>
        )}
      </div>
    ) : tab === "notify" ? (
      <NodeNotifyPanel bare node={sel.id} api={notify} canAdmin={canAdmin} basket={basket} onEdit={setNotifyEditId}
        onOpenLine={() => setLineOpen(true)} onOpenAll={() => openNotify(null)} />
    ) : tab === "links" ? (
      <div className="-mx-2">
        {rel.length ? rel.map((e) => rowFor(e.id, e.a, e.b, e.type, sel.id)) : <div className="px-2 py-2 text-[13px] text-slate-500">{t("ไม่มีเส้นในมุมมองนี้", "No links in this view")}</div>}
        <div className="px-2 pt-2 text-[11px] text-slate-400">{t("กดบรรทัด = ดูรายละเอียดเส้นในลิ้นชักนี้ (มีปุ่มกลับ)", "Click a line for its details")}</div>
      </div>
    ) : tab === "notes" ? (
      <div className="[&>div:first-child]:mt-0 [&>div:first-child]:border-t-0 [&>div:first-child]:pt-0">
        <FlowInternalNotes notes={nNotes} api={notesApi} attach={{ kind: "n", id: sel.id }} view={noteView} />
      </div>
    ) : (
      <div className="[&>div:first-child]:mt-0 [&>div:first-child]:border-t-0 [&>div:first-child]:pt-0">
        <FlowRequestBox kind="n" target={sel.id} gaps={n.gaps ?? []} health={health} basket={basket} notes={promptNotes} />
      </div>
    );
  } else if (sel?.k === "e" && !isNotify && !basketOpen) {
    const x = FLOW_EDGES[sel.id];
    const d = isJourney ? undefined : drawn.find((e) => e.id === sel.id);   // บางผังเปลี่ยนต้น/ปลายเพื่อวาด (เช่น ภาพรวม) — แท็บออเดอร์ใช้ของจริง
    const a = d?.a ?? x.from, b = d?.b ?? x.to;
    const gaps = [...(x.type === "missing" ? [`${x.title} — ${x.detail}`] : []), ...(x.warn ? [x.warn] : [])];
    const eNotes = notesOf("e", sel.id);
    const adv = FLOW_ADVICE[sel.id];
    const tab: EdgeTab = eTab;
    drawerHead = (
      <div className="flex items-start gap-2 px-4 pt-4 pb-2">
        {backNode && FLOW_NODES[backNode] && (
          <button type="button" onClick={() => { setSel({ k: "n", id: backNode }); setBackNode(null); }} title={t(`กลับไป ${FLOW_NODES[backNode].label}`, "Back")}
            className="shrink-0 h-8 px-2 inline-flex items-center gap-1 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Icon value="i:arrow-left" size={13} />{FLOW_NODES[backNode].label}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <NumBadge n={numOf(sel.id)} type={x.type} />
            <span className="font-semibold text-[15px] text-slate-800">{FLOW_NODES[a].label} → {FLOW_NODES[b].label}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap"><TypeChip type={x.type} /><RecentPill id={sel.id} /></div>
        </div>
        {closeX}
      </div>
    );
    const set = (k: string) => setETab(k as EdgeTab);
    drawerTabs = (
      <ScrollTabs activeKey={tab} className="border-b border-slate-200 px-2">
        {tabBtn("d", tab, set, t("รายละเอียด", "Details"))}
        {tabBtn("advice", tab, set, t("คำแนะนำ", "Advice"), adv && adv.verdict !== "keep" && x.type !== "auto" ? 1 : 0)}
        {tabBtn("notes", tab, set, t("โน้ต", "Notes"), eNotes.length)}
        {tabBtn("req", tab, set, t("อยากแก้อะไร", "Request a change"))}
      </ScrollTabs>
    );
    drawerBody = tab === "d" ? (
      <div className="text-[13px] leading-relaxed">
        <div className="text-[11px] text-slate-500">{t("กด / ทำอะไร", "Trigger")}</div>
        <div className="text-slate-800">{x.title}</div>
        <div className="mt-3 text-[11px] text-slate-500">{t("แล้วระบบทำอะไรต่อ", "What happens next")}</div>
        <div className="text-slate-800">{x.detail}</div>
        {x.warn && <div className="mt-3 flex gap-1.5 text-red-700"><Icon value="i:alert-triangle" size={14} className="mt-0.5 shrink-0" />{x.warn}</div>}
        {x.changed && <div className="mt-3 text-[12px] text-violet-700">{t("แก้ล่าสุด", "Last change")} {shortDate(x.changed.date)} — {x.changed.note}</div>}
        {x.metrics?.length ? <><div className="mt-3 text-[11px] text-slate-500">{t("ตัวเลขตอนนี้ (กดดูรายการ)", "Live numbers (click for list)")}</div><MetricRows keys={x.metrics} health={health} onOpen={setMetric} /></> : null}
        <details className="mt-4 text-[12px] text-slate-500">
          <summary className="cursor-pointer select-none">{t("สำหรับทีมพัฒนา", "For developers")}</summary>
          <div className="mt-1 font-mono break-all">{x.files.join(" · ")}</div>
          {x.workflow && <div className="mt-1 font-mono">npm run where-used -- {x.workflow}</div>}
        </details>
      </div>
    ) : tab === "advice" ? (
      adv ? <div className="[&>div:first-child]:mt-0"><AdviceBox id={sel.id} /></div> : <div className="py-2 text-[13px] text-slate-500">{t("เส้นนี้ยังไม่มีคำแนะนำ", "No advice for this link")}</div>
    ) : tab === "notes" ? (
      <div className="[&>div:first-child]:mt-0 [&>div:first-child]:border-t-0 [&>div:first-child]:pt-0">
        <FlowInternalNotes notes={eNotes} api={notesApi} attach={{ kind: "e", id: sel.id }} view={noteView} />
      </div>
    ) : (
      <div className="[&>div:first-child]:mt-0 [&>div:first-child]:border-t-0 [&>div:first-child]:pt-0">
        <FlowRequestBox kind="e" target={sel.id} gaps={gaps} health={health} basket={basket} notes={promptNotes} />
      </div>
    );
  }

  let panel: ReactNode;
  if (isNotify && !basketOpen) {
    panel = <FlowNotifyPanel api={notify} selected={notifySel} onSelect={setNotifySel} onOpenNode={openNodeOnMap} canAdmin={canAdmin} onOpenLine={() => setLineOpen(true)} onEdit={setNotifyEditId} />;
  } else if (basketOpen) {
    panel = <FlowBasketPanel basket={basket} health={health} notes={promptNotes} onClose={() => setBasketOpen(false)} onPick={(kind, ref) => pick(kind === "n" ? { k: "n", id: ref } : { k: "e", id: ref })} />;
  } else if (isJourney) {
    panel = (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-600 leading-relaxed">
        {t("ไล่ทีละขั้นตั้งแต่ลงออเดอร์จนเก็บเงิน — กดชื่อขั้นดูรายละเอียดกล่อง · กดบรรทัดดูรายละเอียดการส่งต่อ แล้วเขียน “อยากแก้อะไร” ได้เหมือนผัง",
          "Step by step from order to payment — click a step or a line for details")}
      </div>
    );
  } else {
    const gaps = shown.filter((e) => e.type === "missing");
    panel = (
      <div className="space-y-2">
        {gaps.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50/40 p-2">
            <div className="px-2 pt-1 pb-1.5 text-[12px] font-medium text-red-700">{t(`ช่องโหว่ในมุมมองนี้ ${gaps.length} จุด`, `${gaps.length} gaps in this view`)}</div>
            {gaps.map((e) => rowFor(e.id, e.a, e.b, e.type))}
          </div>
        )}
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          <div className="px-2 pt-1 pb-1.5 text-[11px] text-slate-500">{t("เส้นทั้งหมดในมุมมองนี้ — กดเพื่อดูรายละเอียด", "All links in this view — click for details")}</div>
          {shown.filter((e) => e.type !== "missing").map((e) => rowFor(e.id, e.a, e.b, e.type))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 pb-3 [&>div:first-child]:mt-0 [&>div:first-child]:border-t-0">
          <FlowInternalNotes notes={freeNotes} api={notesApi} attach={null} view={view.key} title={t("โน้ตภายในของผังนี้", "Notes for this map")} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-5 py-5">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Icon value="🧭" />{t("แผนผังการทำงาน", "Work flow map")}</h1>
          <p className="text-sm text-slate-500">{t("ซื้อ · ผลิต · จ่ายงาน · ขาย — กดอะไร แล้วไปอัปเดตอะไรต่อ · กดกล่องดูว่าเก็บที่ไหน/สถานะ/ตัวเลขตอนนี้ · กดเลขบนเส้นดูว่าส่งต่อยังไง · เขียน “อยากแก้อะไร” แล้วสร้าง prompt ให้ AI ได้", "Buy · make · dispatch · sell — what each action updates next · click a box or a link number for details")}</p>
        </div>
        <button type="button" onClick={() => { setBasketOpen((o) => !o); setSel(null); }}
          className={`h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border ${basketOpen ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"}`}>
          <Icon value="🧺" />{t("ตะกร้า", "Basket")}{basket.items.length > 0 && <span className={`ml-0.5 text-[11px] px-1.5 rounded-full ${basketOpen ? "bg-white/20" : "bg-indigo-100 text-indigo-700"}`}>{basket.items.length}</span>}
        </button>
        <Link href={`/print/flow-map${isJourney || isNotify ? "" : `?view=${view.key}`}`} target="_blank" className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
          <Icon value="🖨️" />{t("พิมพ์ / PDF", "Print / PDF")}
        </Link>
        <Link href="/master/work-flows" className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
          <Icon value="🗺️" />{t("คู่มือ Flow งาน", "Work flow guide")}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {views.filter((v) => !v.finance).map((v) => (
          <button key={v.key} type="button" onClick={() => pickView(v.key)}
            className={`h-8 px-3 text-[13px] rounded-lg border ${v.key === viewKey ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{v.label}</button>
        ))}
        <button type="button" onClick={() => pickView(JOURNEY)}
          className={`h-8 px-3 text-[13px] rounded-lg border ${isJourney ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{t("ออเดอร์ 1 ใบ เดินทางยังไง", "One order's journey")}</button>
        <button type="button" onClick={() => openNotify(null)}
          className={`h-8 px-3 inline-flex items-center gap-1.5 text-[13px] rounded-lg border ${isNotify ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}><Icon value="🔔" />{t("แจ้งเตือน", "Notifications")}</button>
        {canFinance && <>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          <span className="h-8 px-2 inline-flex items-center gap-1 text-[12px] rounded-lg bg-amber-50 text-amber-800 border border-amber-200" title={t("เห็นเฉพาะผู้มีสิทธิ์ดูผังการเงิน (แอดมินมีเสมอ)", "Only people allowed to see finance maps")}>
            <Icon value="🔒" />{t("การเงิน · เฉพาะแอดมิน", "Finance · admin only")}
          </span>
          {views.filter((v) => v.finance).map((v) => (
            <button key={v.key} type="button" onClick={() => pickView(v.key)}
              className={`h-8 px-3 text-[13px] rounded-lg border ${v.key === viewKey ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{v.label}</button>
          ))}
        </>}
        {!isJourney && !isNotify && <>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          {(Object.keys(FLOW_EDGE_TYPES) as FlowEdgeType[]).map((k) => (
            <button key={k} type="button" aria-pressed={!hide[k]} onClick={() => { setHide((h) => ({ ...h, [k]: !h[k] })); setSel(null); }}
              className={`h-8 px-2.5 inline-flex items-center gap-1.5 text-[12px] rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 ${hide[k] ? "opacity-40" : ""}`}
              title={hide[k] ? t("กดเพื่อแสดง", "Click to show") : t("กดเพื่อซ่อน", "Click to hide")}>
              <LineSample type={k} />{FLOW_EDGE_TYPES[k].label} <span className="tabular-nums text-slate-400">{counts[k]}</span>
            </button>
          ))}
        </>}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        {isNotify ? (
          <FlowNotifyBoard api={notify} selected={notifySel} onSelect={setNotifySel} canAdmin={canAdmin} onOpenLine={() => setLineOpen(true)} onEdit={setNotifyEditId} />
        ) : isJourney ? (
          <FlowJourney onPickNode={(id) => pick({ k: "n", id })} onPickEdge={(id) => pick({ k: "e", id })} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-2 overflow-x-auto">
            <svg ref={svgRef} viewBox={`0 0 680 ${view.height}`} role="img" aria-label={t(`แผนผัง${view.label}`, `${view.label} map`)}
              className="w-full min-w-[560px] h-auto">
              <defs>
                <marker id="fm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>
              {view.bands && (
                <g>
                  {FM_BAND_LABELS.map((h, i) => (
                    <g key={h}>
                      <rect x={FM_CX[i] - 8} y={28} width={FM_W + 16} height={388} rx={12} fill="#f1f5f9" />
                      <text x={FM_CX[i] + FM_W / 2} y={16} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="#334155">{h}</text>
                    </g>
                  ))}
                  <rect x={10} y={424} width={650} height={84} rx={12} fill="none" stroke="#cbd5e1" strokeWidth={0.75} strokeDasharray="4 4" />
                  <text x={22} y={438} dominantBaseline="central" fontSize={11} fill="#64748b">{t("คลังสินค้า (สต็อก)", "Stock")}</text>
                </g>
              )}
              {view.heads?.map((h, i) => (
                <g key={h}>
                  <rect x={FM_CX[i] - 8} y={28} width={FM_W + 16} height={view.height - 34} rx={12} fill="#f8fafc" />
                  <text x={FM_CX[i] + FM_W / 2} y={16} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill="#334155">{h}</text>
                </g>
              ))}
              {shown.map((e) => {
                const ty = FLOW_EDGE_TYPES[e.type], w = e.type === "missing" ? 2 : 1.5;
                return (
                  <g key={e.id} opacity={edgeOn(e) ? 1 : 0.12}>
                    {e.feeds.map((f) => <path key={f.node} d={f.d} fill="none" stroke={ty.color} strokeWidth={w} strokeDasharray={ty.dash} strokeLinecap="round" />)}
                    <path d={e.d} fill="none" stroke={ty.color} strokeWidth={w} strokeDasharray={ty.dash} strokeLinecap="round" markerEnd="url(#fm-arrow)" />
                    {[e.d, ...e.feeds.map((f) => f.d)].map((d) => <path key={d} d={d} fill="none" stroke="transparent" strokeWidth={10} className="cursor-pointer" onClick={(ev) => onEdgeClick(ev, e.id, false)} />)}
                  </g>
                );
              })}
              {Object.entries(view.pos).map(([id, p]) => {
                const { x, y, h } = fmBox(p), n = FLOW_NODES[id], g = isGray(id), on = nodeOn(id), picked = sel?.k === "n" && sel.id === id;
                return (
                  <g key={id} className="cursor-pointer" opacity={on ? 1 : 0.4} onClick={(ev) => onNodeClick(ev, id, picked)}>
                    <title>{n.label}</title>
                    <rect x={x} y={y} width={FM_W} height={h} rx={8} fill={g ? "#f8fafc" : "#eef2ff"} stroke={picked ? "#4f46e5" : g ? "#cbd5e1" : "#a5b4fc"} strokeWidth={picked ? 2 : 0.75} />
                    <text x={x + FM_W / 2} y={y + h / 2 - 6} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill={g ? "#334155" : "#312e81"}>{n.label}</text>
                    <text x={x + FM_W / 2} y={y + h / 2 + 10} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={g ? "#64748b" : "#6366f1"}>{n.sub}</text>
                    {nodeAlert(id) && <circle cx={x + FM_W - 9} cy={y + 9} r={3.5} fill="#dc2626" />}
                    {view.finance && n.cashflow && <circle cx={x + 9} cy={y + 9} r={3.5} fill={FM_CASHFLOW_DOT}><title>{t("นับในกระแสเงินสด", "Counted in cash flow")}</title></circle>}
                    {(() => {
                      const nt = notifyTopicsOfNode(id);
                      const bx = x + (view.finance && n.cashflow ? 21 : 10), by = y + 10;
                      if (!nt.length) {
                        // ยังไม่มีแจ้งเตือนแต่มีข้อเสนอ (NOTIFY_NODE_SUGGEST) → กระดิ่งเส้นประ กดดูข้อเสนอ
                        if (!NOTIFY_NODE_SUGGEST[id]?.length) return null;
                        return (
                          <g transform={`translate(${bx} ${by})`} onClick={(ev) => { ev.stopPropagation(); openBell(id); }}>
                            <title>{t("ยังไม่มีแจ้งเตือน — กดดูข้อเสนอ", "No notifications — see suggestions")}</title>
                            <circle r={7} fill="#fff" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" />
                            <path d="M0 -3.5v7M-3.5 0h7" stroke="#94a3b8" strokeWidth={1.2} strokeLinecap="round" />
                          </g>
                        );
                      }
                      return (
                        <g transform={`translate(${bx} ${by})`} onClick={(ev) => { ev.stopPropagation(); openBell(id); }}>
                          <title>{t(`แจ้งเตือน ${nt.length} เรื่อง: ${nt.map((tp) => tp.label).join(" · ")} — กดดู/จัดการ`, `${nt.length} notifications — click to view/manage`)}</title>
                          <circle r={7} fill="#fff" stroke={notifyNodeColor(nt, notify.live)} strokeWidth={1.25} />
                          <path d={BELL_D} fill={notifyNodeColor(nt, notify.live)} stroke={notifyNodeColor(nt, notify.live)} strokeWidth={0.6} strokeLinecap="round" strokeLinejoin="round" />
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
              {shown.map((e) => {
                const ty = FLOW_EDGE_TYPES[e.type];
                return (
                  <g key={`b${e.id}`} className="cursor-pointer" opacity={edgeOn(e) ? 1 : 0.12} onClick={(ev) => onEdgeClick(ev, e.id, true)}>
                    <title>{FLOW_EDGES[e.id].title}</title>
                    <circle cx={e.badge[0]} cy={e.badge[1]} r={9} fill="#fff" stroke={ty.color} strokeWidth={1.5} />
                    <text x={e.badge[0]} y={e.badge[1]} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill={ty.color}>{e.i + 1}</text>
                    {isRecentEdge(e.id) && <circle cx={e.badge[0] + 7} cy={e.badge[1] - 7} r={3.5} fill="#7c3aed" stroke="#fff" strokeWidth={1} />}
                  </g>
                );
              })}
            </svg>
            <div className="px-2 pt-1 text-[11px] text-slate-400 flex flex-wrap gap-x-3">
              <span><span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-1 align-middle" />{t("มีช่องโหว่ / ตัวเลขที่ต้องตาม", "Gap or number to follow")}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-violet-600 mr-1 align-middle" />{t(`เพิ่งแก้ (${FLOW_RECENT_DAYS} วัน)`, `Updated (${FLOW_RECENT_DAYS} days)`)}</span>
              <span className="inline-flex items-center gap-1"><Icon value="🔔" />{t("กดกระดิ่งดู/จัดการแจ้งเตือน (เขียว = ถึงคนครบ · เหลือง = บางทางยังเงียบ · เส้นประ = ยังไม่มี มีข้อเสนอ)", "Click a bell to view/manage (green = reaches · amber = partly silent · dashed = none yet)")}</span>
              {view.finance && <span><span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: FM_CASHFLOW_DOT }} />{t("นับในกระแสเงินสด /cashflow", "Counted in /cashflow")}</span>}
              <span>{t("กล่องสีเทา = อยู่ส่วนอื่น", "Grey box = other area")}</span>
              <span>{t("โน้ต: ลากแถบบนเพื่อย้าย · กดรูปกุญแจ/คน สลับส่วนตัว ↔ ทั้งทีม", "Notes: drag the top strip · toggle private / team")}</span>
            </div>
          </div>
        )}
        <div>{panel}</div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        {t("แผนผังนี้อ่านจากทะเบียนกลาง lib/flow-map.ts (ตรวจกับระบบจริง 2 พ.ย. 2569 · ผังการเงิน 3 พ.ย.) · แก้ระบบแล้วต้องแก้ทะเบียน มีเทสต์เตือนเมื่อไฟล์ที่อ้างหายไป", "Built from the central registry lib/flow-map.ts — update it when the system changes")}
        {healthErr ? t(" · โหลดตัวเลขสดไม่สำเร็จ", " · live numbers failed to load") : healthAt ? t(` · ตัวเลขสด ณ ${new Date(healthAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`, ` · numbers as of ${new Date(healthAt).toLocaleTimeString()}`) : ""}
      </p>
      {/* ลิ้นชักรายละเอียด — ไม่มืดพื้นหลัง: ผังกดต่อได้ · ลากขอบซ้ายปรับกว้าง (จำไว้) · Esc / ✕ ปิด */}
      <DrawerShell open={!!drawerHead} modal={false} onClose={closeDrawer} width={drawerSize.width}>
        <div onMouseDown={drawerSize.startResize} onDoubleClick={drawerSize.resetWidth}
          title={t("ลากเพื่อปรับความกว้าง · ดับเบิลคลิก = คืนค่าเดิม", "Drag to resize · double-click to reset")}
          className="absolute left-0 top-0 z-10 hidden h-full w-1.5 cursor-ew-resize hover:bg-indigo-200 sm:block" />
        {drawerHead}
        {drawerTabs}
        <div className="flex-1 overflow-y-auto px-4 py-3">{drawerBody}</div>
      </DrawerShell>
      <FlowMetricListModal metric={metric} onClose={() => setMetric(null)} />
      {canAdmin && <LineConsole open={lineOpen} onClose={closeLine} />}
      {canAdmin && notifyEditId && (
        <NotifyEditModal open topic={notifyAllTopics(notify.live).find((x) => x.id === notifyEditId) ?? null} live={notify.live}
          onClose={() => setNotifyEditId(null)} onSaved={() => void notify.reload()}
          onOpenLine={() => { setNotifyEditId(null); setLineOpen(true); }} />
      )}
    </div>
  );
}
