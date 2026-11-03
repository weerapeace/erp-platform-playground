"use client";

/**
 * 🧭 แผนผังการทำงาน — "กดอะไร แล้วไปอัปเดตอะไรต่อ" ของ ซื้อ · ผลิต · จ่ายงาน · ขาย
 * วาดจากทะเบียน lib/flow-map.ts (กล่อง/เส้น/ผัง) + เรขาคณิต lib/flow-map-layout.ts + ตัวเลขสดจาก /api/flow-map/health
 * ของเสริม: ช่องอยากแก้ + สร้าง prompt + ตะกร้า + ส่งรายงานปัญหา (./request) · กดตัวเลขดูรายการ (./metric-list)
 *          แท็บออเดอร์ 1 ใบ (./journey) · ป้ายเพิ่งแก้ (FlowEdge.changed) · พิมพ์ /print/flow-map
 * ใช้ที่ /master/flow-map · แก้เนื้อหาแผนผังที่ lib/flow-map.ts ที่เดียว (ดู docs/flow-map.md)
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import {
  FLOW_NODES, FLOW_EDGES, FLOW_VIEWS, FLOW_METRICS, FLOW_EDGE_TYPES, FLOW_AREA_LABEL, FLOW_RECENT_DAYS,
  type FlowEdgeType, type FlowMetricKey,
} from "@/lib/flow-map";
import { FM_W, FM_H, FM_CX, FM_BAND_LABELS, fmXY, layoutFlowView, isRecentEdge, type FmDrawn } from "@/lib/flow-map-layout";
import { FlowRequestBox, FlowBasketPanel, useFlowBasket } from "./request";
import { FlowMetricListModal } from "./metric-list";
import { FlowJourney } from "./journey";

type Sel = { k: "n"; id: string } | { k: "e"; id: string } | null;
type Health = Partial<Record<FlowMetricKey, number | null>>;
const JOURNEY = "journey";

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
  const basket = useFlowBasket();
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
  const view = FLOW_VIEWS.find((v) => v.key === viewKey) ?? FLOW_VIEWS[0];
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
  const edgeOn = (e: FmDrawn) => !sel || (sel.k === "n" ? e.a === sel.id || e.b === sel.id : sel.id === e.id);
  const nodeOn = (id: string) => {
    if (!sel) return true;
    if (sel.k === "n") return sel.id === id || shown.some((e) => (e.a === sel.id && e.b === id) || (e.b === sel.id && e.a === id));
    const d = drawn.find((x) => x.id === sel.id);
    return !d || d.a === id || d.b === id;
  };
  const pick = (s: Sel) => { setSel(s); setBasketOpen(false); };
  const pickView = (k: string) => { setViewKey(k); setSel(null); };

  const rowFor = (id: string, a: string, b: string, type: FlowEdgeType) => (
    <button key={id} type="button" onClick={() => pick({ k: "e", id })}
      className="w-full flex items-start gap-2.5 px-2 py-2 text-left border-t border-slate-100 hover:bg-slate-50 rounded-md">
      <NumBadge n={numOf(id)} type={type} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-slate-800">{FLOW_NODES[a].label} → {FLOW_NODES[b].label}</span>
        <span className="block text-[12px] text-slate-500">{FLOW_EDGES[id].title} <RecentPill id={id} /></span>
      </span>
      <TypeChip type={type} />
    </button>
  );
  const closeBtn = <button type="button" onClick={() => setSel(null)} className="mt-3 h-8 px-3 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">{t("ดูทุกเส้น", "Show all")}</button>;

  let panel: ReactNode;
  if (basketOpen) {
    panel = <FlowBasketPanel basket={basket} health={health} onClose={() => setBasketOpen(false)} onPick={(kind, ref) => pick(kind === "n" ? { k: "n", id: ref } : { k: "e", id: ref })} />;
  } else if (sel?.k === "e") {
    const x = FLOW_EDGES[sel.id];
    const d = isJourney ? undefined : drawn.find((e) => e.id === sel.id);   // บางผังเปลี่ยนต้น/ปลายเพื่อวาด (เช่น ภาพรวม) — แท็บออเดอร์ใช้ของจริง
    const a = d?.a ?? x.from, b = d?.b ?? x.to;
    const gaps = [...(x.type === "missing" ? [`${x.title} — ${x.detail}`] : []), ...(x.warn ? [x.warn] : [])];
    panel = (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <NumBadge n={numOf(sel.id)} type={x.type} />
          <span className="font-semibold text-[15px] text-slate-800">{FLOW_NODES[a].label} → {FLOW_NODES[b].label}</span>
          <TypeChip type={x.type} />
          <RecentPill id={sel.id} />
        </div>
        <div className="text-[11px] text-slate-500">{t("กด / ทำอะไร", "Trigger")}</div>
        <div className="text-slate-800">{x.title}</div>
        <div className="mt-2 text-[11px] text-slate-500">{t("แล้วระบบทำอะไรต่อ", "What happens next")}</div>
        <div className="text-slate-800">{x.detail}</div>
        {x.warn && <div className="mt-2 flex gap-1.5 text-red-700"><Icon value="⚠️" className="mt-0.5 shrink-0" />{x.warn}</div>}
        {x.changed && <div className="mt-2 text-[12px] text-violet-700">{t("แก้ล่าสุด", "Last change")} {shortDate(x.changed.date)} — {x.changed.note}</div>}
        {x.metrics?.length ? <><div className="mt-2 text-[11px] text-slate-500">{t("ตัวเลขตอนนี้ (กดดูรายการ)", "Live numbers (click for list)")}</div><MetricRows keys={x.metrics} health={health} onOpen={setMetric} /></> : null}
        <details className="mt-3 text-[12px] text-slate-500">
          <summary className="cursor-pointer select-none">{t("สำหรับทีมพัฒนา", "For developers")}</summary>
          <div className="mt-1 font-mono break-all">{x.files.join(" · ")}</div>
          {x.workflow && <div className="mt-1 font-mono">npm run where-used -- {x.workflow}</div>}
        </details>
        <FlowRequestBox kind="e" target={sel.id} gaps={gaps} health={health} basket={basket} />
        {closeBtn}
      </div>
    );
  } else if (sel?.k === "n") {
    const n = FLOW_NODES[sel.id];
    const rel = isJourney
      ? Object.keys(FLOW_EDGES).filter((id) => FLOW_EDGES[id].from === sel.id || FLOW_EDGES[id].to === sel.id).map((id) => ({ id, a: FLOW_EDGES[id].from, b: FLOW_EDGES[id].to, type: FLOW_EDGES[id].type }))
      : drawn.filter((e) => e.a === sel.id || e.b === sel.id);
    panel = (
      <div className="space-y-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px] text-slate-800">{n.label}</div>
              <div className="text-[11px] text-slate-500">{FLOW_AREA_LABEL[n.area]} · {n.pages}</div>
            </div>
            {n.href && (
              <Link href={n.href} className="shrink-0 h-8 px-3 inline-flex items-center gap-1 text-[12px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                {t("เปิดหน้า", "Open")} <span aria-hidden="true">↗</span>
              </Link>
            )}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">{t("เก็บที่ (ตาราง)", "Stored in")}</div>
          <div className="font-mono text-[12px] text-slate-700 break-all">{n.tables}</div>
          <div className="mt-2 text-[11px] text-slate-500">{t("สถานะ", "Statuses")}</div>
          <div className="text-slate-800">{n.statuses}</div>
          {n.metrics?.length ? <><div className="mt-2 text-[11px] text-slate-500">{t("ตัวเลขตอนนี้ (กดดูรายการ)", "Live numbers (click for list)")}</div><MetricRows keys={n.metrics} health={health} onOpen={setMetric} /></> : null}
          {n.gaps?.length ? (
            <div className="mt-2">
              <div className="text-[11px] text-slate-500">{t("ช่องโหว่ / ข้อควรระวัง", "Gaps / cautions")}</div>
              {n.gaps.map((g) => <div key={g} className="flex gap-1.5 text-red-700 mt-0.5"><span aria-hidden="true">•</span>{g}</div>)}
            </div>
          ) : null}
          <FlowRequestBox kind="n" target={sel.id} gaps={n.gaps ?? []} health={health} basket={basket} />
          {closeBtn}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          <div className="px-2 pt-1 pb-1.5 text-[11px] text-slate-500">{t("เส้นที่เข้า/ออกจากกล่องนี้", "Links in/out of this box")}</div>
          {rel.map((e) => rowFor(e.id, e.a, e.b, e.type))}
        </div>
      </div>
    );
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
        <Link href={`/print/flow-map${isJourney ? "" : `?view=${view.key}`}`} target="_blank" className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
          <Icon value="🖨️" />{t("พิมพ์ / PDF", "Print / PDF")}
        </Link>
        <Link href="/master/work-flows" className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
          <Icon value="🗺️" />{t("คู่มือ Flow งาน", "Work flow guide")}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {FLOW_VIEWS.map((v) => (
          <button key={v.key} type="button" onClick={() => pickView(v.key)}
            className={`h-8 px-3 text-[13px] rounded-lg border ${v.key === viewKey ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{v.label}</button>
        ))}
        <button type="button" onClick={() => pickView(JOURNEY)}
          className={`h-8 px-3 text-[13px] rounded-lg border ${isJourney ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{t("ออเดอร์ 1 ใบ เดินทางยังไง", "One order's journey")}</button>
        {!isJourney && <>
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
        {isJourney ? (
          <FlowJourney onPickNode={(id) => pick({ k: "n", id })} onPickEdge={(id) => pick({ k: "e", id })} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-2 overflow-x-auto">
            <svg viewBox={`0 0 680 ${view.height}`} className="w-full min-w-[560px] h-auto" role="img" aria-label={t(`แผนผัง${view.label}`, `${view.label} map`)}>
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
              {shown.map((e) => {
                const ty = FLOW_EDGE_TYPES[e.type];
                return (
                  <g key={e.id} opacity={edgeOn(e) ? 1 : 0.12}>
                    <path d={e.d} fill="none" stroke={ty.color} strokeWidth={e.type === "missing" ? 2 : 1.5} strokeDasharray={ty.dash} strokeLinecap="round" markerEnd="url(#fm-arrow)" />
                    <path d={e.d} fill="none" stroke="transparent" strokeWidth={10} className="cursor-pointer" onClick={() => pick({ k: "e", id: e.id })} />
                  </g>
                );
              })}
              {Object.entries(view.pos).map(([id, p]) => {
                const [x, y] = fmXY(p), n = FLOW_NODES[id], g = isGray(id), on = nodeOn(id), picked = sel?.k === "n" && sel.id === id;
                return (
                  <g key={id} className="cursor-pointer" opacity={on ? 1 : 0.4} onClick={() => pick(picked ? null : { k: "n", id })}>
                    <title>{n.label}</title>
                    <rect x={x} y={y} width={FM_W} height={FM_H} rx={8} fill={g ? "#f8fafc" : "#eef2ff"} stroke={picked ? "#4f46e5" : g ? "#cbd5e1" : "#a5b4fc"} strokeWidth={picked ? 2 : 0.75} />
                    <text x={x + FM_W / 2} y={y + 16} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill={g ? "#334155" : "#312e81"}>{n.label}</text>
                    <text x={x + FM_W / 2} y={y + 32} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={g ? "#64748b" : "#6366f1"}>{n.sub}</text>
                    {nodeAlert(id) && <circle cx={x + FM_W - 9} cy={y + 9} r={3.5} fill="#dc2626" />}
                  </g>
                );
              })}
              {shown.map((e) => {
                const ty = FLOW_EDGE_TYPES[e.type];
                return (
                  <g key={`b${e.id}`} className="cursor-pointer" opacity={edgeOn(e) ? 1 : 0.12} onClick={() => pick(sel?.k === "e" && sel.id === e.id ? null : { k: "e", id: e.id })}>
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
              <span>{t("กล่องสีเทา = อยู่ส่วนอื่น", "Grey box = other area")}</span>
            </div>
          </div>
        )}
        <div>{panel}</div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        {t("แผนผังนี้อ่านจากทะเบียนกลาง lib/flow-map.ts (ตรวจกับระบบจริง 2 พ.ย. 2569) · แก้ระบบแล้วต้องแก้ทะเบียน มีเทสต์เตือนเมื่อไฟล์ที่อ้างหายไป", "Built from the central registry lib/flow-map.ts — update it when the system changes")}
        {healthErr ? t(" · โหลดตัวเลขสดไม่สำเร็จ", " · live numbers failed to load") : healthAt ? t(` · ตัวเลขสด ณ ${new Date(healthAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`, ` · numbers as of ${new Date(healthAt).toLocaleTimeString()}`) : ""}
      </p>
      <FlowMetricListModal metric={metric} onClose={() => setMetric(null)} />
    </div>
  );
}
