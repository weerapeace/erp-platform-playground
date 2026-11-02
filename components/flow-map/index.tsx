"use client";

/**
 * 🧭 แผนผังการทำงาน — "กดอะไร แล้วไปอัปเดตอะไรต่อ" ของ ซื้อ · ผลิต · จ่ายงาน · ขาย
 * วาดจากทะเบียน lib/flow-map.ts (กล่อง/เส้น/ผัง) + ตัวเลขสดจาก /api/flow-map/health
 * ใช้ที่ /master/flow-map · แก้เนื้อหาแผนผังที่ lib/flow-map.ts ที่เดียว (ดู docs/flow-map.md)
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import {
  FLOW_NODES, FLOW_EDGES, FLOW_VIEWS, FLOW_METRICS, FLOW_EDGE_TYPES, FLOW_AREA_LABEL,
  type FlowEdgeType, type FlowMetricKey, type FlowPos, type FlowView,
} from "@/lib/flow-map";

const W = 130, H = 44, CX = [20, 185, 350, 515];
type Pt = [number, number];
type Side = "l" | "r" | "t" | "b";
type Drawn = { i: number; id: string; a: string; b: string; type: FlowEdgeType; d: string; badge: Pt };
type Sel = { k: "n"; id: string } | { k: "e"; i: number } | null;
type Health = Partial<Record<FlowMetricKey, number | null>>;

const xy = (p: FlowPos): Pt => [CX[p[0]], p[1] === "s" ? 450 : 40 + p[1] * 76];
function anchor([x, y]: Pt, s: Side, o: number): Pt {
  return s === "l" ? [x, y + H / 2 + o] : s === "r" ? [x + W, y + H / 2 + o] : s === "t" ? [x + W / 2 + o, y] : [x + W / 2 + o, y + H];
}
/** เส้นหักมุมฉาก: ด้านข้าง→ด้านข้าง / บน-ล่าง→บน-ล่าง เลี้ยวที่แนว c (ไม่ส่ง = กึ่งกลาง) · ข้าง↔บนล่าง เลี้ยวมุมเดียว */
function route(a: Pt, b: Pt, fs: Side, ts: Side, c?: number): Pt[] {
  const h = (s: Side) => s === "l" || s === "r";
  let mid: Pt[] = [];
  if (h(fs) && h(ts)) { if (a[1] !== b[1]) { const cx = c ?? (a[0] + b[0]) / 2; mid = [[cx, a[1]], [cx, b[1]]]; } }
  else if (!h(fs) && !h(ts)) { if (a[0] !== b[0]) { const cy = c ?? (a[1] + b[1]) / 2; mid = [[a[0], cy], [b[0], cy]]; } }
  else if (h(fs)) mid = [[b[0], a[1]]];
  else mid = [[a[0], b[1]]];
  return [a, ...mid, b];
}
function layout(v: FlowView): Drawn[] {
  return v.edges.map(([id, fs, fo, ts, to, o], i) => {
    const e = FLOW_EDGES[id];
    const a = o?.a ?? e.from, b = o?.b ?? e.to;
    const pts = route(anchor(xy(v.pos[a]), fs, fo), anchor(xy(v.pos[b]), ts, to), fs, ts, o?.c);
    let best = 0, bi = 0;
    for (let j = 0; j < pts.length - 1; j++) {
      const len = Math.abs(pts[j + 1][0] - pts[j][0]) + Math.abs(pts[j + 1][1] - pts[j][1]);
      if (len > best) { best = len; bi = j; }
    }
    const f = o?.bf ?? 0.5, p0 = pts[bi], p1 = pts[bi + 1];
    return { i, id, a, b, type: e.type, d: "M" + pts.map((p) => p.join(" ")).join(" L"), badge: [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f] };
  });
}

const TYPE_CHIP: Record<FlowEdgeType, string> = {
  auto: "bg-green-50 text-green-700 border-green-200",
  live: "bg-blue-50 text-blue-700 border-blue-200",
  manual: "bg-amber-50 text-amber-800 border-amber-200",
  missing: "bg-red-50 text-red-700 border-red-200",
};
const fmtNum = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

function LineSample({ type }: { type: FlowEdgeType }) {
  const t = FLOW_EDGE_TYPES[type];
  return <svg width="22" height="6" aria-hidden="true" className="shrink-0"><line x1="2" y1="3" x2="20" y2="3" stroke={t.color} strokeWidth="2" strokeDasharray={t.dash} strokeLinecap="round" /></svg>;
}
function TypeChip({ type }: { type: FlowEdgeType }) {
  return <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap ${TYPE_CHIP[type]}`}><LineSample type={type} />{FLOW_EDGE_TYPES[type].label}</span>;
}
function NumBadge({ n, type }: { n: number; type: FlowEdgeType }) {
  return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border-[1.5px] text-[11px] font-semibold bg-white shrink-0" style={{ borderColor: FLOW_EDGE_TYPES[type].color, color: FLOW_EDGE_TYPES[type].color }}>{n}</span>;
}
function MetricRows({ keys, health }: { keys?: FlowMetricKey[]; health: Health | null }) {
  if (!keys?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {keys.map((k) => {
        const m = FLOW_METRICS[k], v = health?.[k];
        const bad = m.bad && typeof v === "number" && v > 0;
        return (
          <div key={k} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-slate-600">{m.label}</span>
            <span className={`font-semibold tabular-nums whitespace-nowrap ${bad ? "text-red-600" : "text-slate-800"}`}>
              {health == null ? "…" : v == null ? "—" : `${fmtNum(v)} ${m.unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FlowMap() {
  const t = useT();
  const [viewKey, setViewKey] = useState("ov");
  const [sel, setSel] = useState<Sel>(null);
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

  const view = FLOW_VIEWS.find((v) => v.key === viewKey) ?? FLOW_VIEWS[0];
  const drawn = useMemo(() => layout(view), [view]);
  const shown = drawn.filter((e) => !hide[e.type]);
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
  const edgeOn = (e: Drawn) => !sel || (sel.k === "n" ? e.a === sel.id || e.b === sel.id : sel.i === e.i);
  const nodeOn = (id: string) => !sel || (sel.k === "n"
    ? sel.id === id || shown.some((e) => (e.a === sel.id && e.b === id) || (e.b === sel.id && e.a === id))
    : drawn[sel.i].a === id || drawn[sel.i].b === id);
  const pickView = (k: string) => { setViewKey(k); setSel(null); };

  const rowFor = (e: Drawn) => {
    const x = FLOW_EDGES[e.id];
    return (
      <button key={e.i} type="button" onClick={() => setSel({ k: "e", i: e.i })}
        className="w-full flex items-start gap-2.5 px-2 py-2 text-left border-t border-slate-100 hover:bg-slate-50 rounded-md">
        <NumBadge n={e.i + 1} type={e.type} />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] text-slate-800">{FLOW_NODES[e.a].label} → {FLOW_NODES[e.b].label}</span>
          <span className="block text-[12px] text-slate-500">{x.title}</span>
        </span>
        <TypeChip type={e.type} />
      </button>
    );
  };

  let panel: ReactNode;
  if (sel?.k === "e") {
    const e = drawn[sel.i], x = FLOW_EDGES[e.id];
    panel = (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <NumBadge n={e.i + 1} type={e.type} />
          <span className="font-semibold text-[15px] text-slate-800">{FLOW_NODES[e.a].label} → {FLOW_NODES[e.b].label}</span>
          <TypeChip type={e.type} />
        </div>
        <div className="text-[11px] text-slate-500">{t("กด / ทำอะไร", "Trigger")}</div>
        <div className="text-slate-800">{x.title}</div>
        <div className="mt-2 text-[11px] text-slate-500">{t("แล้วระบบทำอะไรต่อ", "What happens next")}</div>
        <div className="text-slate-800">{x.detail}</div>
        {x.warn && <div className="mt-2 flex gap-1.5 text-red-700"><Icon value="⚠️" className="mt-0.5 shrink-0" />{x.warn}</div>}
        <MetricRows keys={x.metrics} health={health} />
        <details className="mt-3 text-[12px] text-slate-500">
          <summary className="cursor-pointer select-none">{t("สำหรับทีมพัฒนา", "For developers")}</summary>
          <div className="mt-1 font-mono break-all">{x.files.join(" · ")}</div>
          {x.workflow && <div className="mt-1 font-mono">npm run where-used -- {x.workflow}</div>}
        </details>
        <button type="button" onClick={() => setSel(null)} className="mt-3 h-8 px-3 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">{t("ดูทุกเส้น", "Show all")}</button>
      </div>
    );
  } else if (sel?.k === "n") {
    const n = FLOW_NODES[sel.id];
    const rel = drawn.filter((e) => e.a === sel.id || e.b === sel.id);
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
          {n.metrics?.length ? <><div className="mt-2 text-[11px] text-slate-500">{t("ตัวเลขตอนนี้", "Live numbers")}</div><MetricRows keys={n.metrics} health={health} /></> : null}
          {n.gaps?.length ? (
            <div className="mt-2">
              <div className="text-[11px] text-slate-500">{t("ช่องโหว่ / ข้อควรระวัง", "Gaps / cautions")}</div>
              {n.gaps.map((g) => <div key={g} className="flex gap-1.5 text-red-700 mt-0.5"><span aria-hidden="true">•</span>{g}</div>)}
            </div>
          ) : null}
          <button type="button" onClick={() => setSel(null)} className="mt-3 h-8 px-3 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">{t("ดูทุกเส้น", "Show all")}</button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          <div className="px-2 pt-1 pb-1.5 text-[11px] text-slate-500">{t("เส้นที่เข้า/ออกจากกล่องนี้", "Links in/out of this box")}</div>
          {rel.map(rowFor)}
        </div>
      </div>
    );
  } else {
    const gaps = shown.filter((e) => e.type === "missing");
    panel = (
      <div className="space-y-2">
        {gaps.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50/40 p-2">
            <div className="px-2 pt-1 pb-1.5 text-[12px] font-medium text-red-700">{t(`ช่องโหว่ในมุมมองนี้ ${gaps.length} จุด`, `${gaps.length} gaps in this view`)}</div>
            {gaps.map(rowFor)}
          </div>
        )}
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          <div className="px-2 pt-1 pb-1.5 text-[11px] text-slate-500">{t("เส้นทั้งหมดในมุมมองนี้ — กดเพื่อดูรายละเอียด", "All links in this view — click for details")}</div>
          {shown.filter((e) => e.type !== "missing").map(rowFor)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-5 py-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Icon value="🧭" />{t("แผนผังการทำงาน", "Work flow map")}</h1>
          <p className="text-sm text-slate-500">{t("ซื้อ · ผลิต · จ่ายงาน · ขาย — กดอะไร แล้วไปอัปเดตอะไรต่อ · กดกล่องดูว่าเก็บที่ไหน/สถานะ/ตัวเลขตอนนี้ · กดเลขบนเส้นดูว่าส่งต่อยังไง", "Buy · make · dispatch · sell — what each action updates next · click a box or a link number for details")}</p>
        </div>
        <Link href="/master/work-flows" className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Icon value="🗺️" />{t("คู่มือ Flow งาน (เก็บไฟล์ที่ไหน)", "Work flow guide")}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {FLOW_VIEWS.map((v) => (
          <button key={v.key} type="button" onClick={() => pickView(v.key)}
            className={`h-8 px-3 text-[13px] rounded-lg border ${v.key === viewKey ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{v.label}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {(Object.keys(FLOW_EDGE_TYPES) as FlowEdgeType[]).map((k) => (
          <button key={k} type="button" aria-pressed={!hide[k]} onClick={() => { setHide((h) => ({ ...h, [k]: !h[k] })); setSel(null); }}
            className={`h-8 px-2.5 inline-flex items-center gap-1.5 text-[12px] rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 ${hide[k] ? "opacity-40" : ""}`}
            title={hide[k] ? t("กดเพื่อแสดง", "Click to show") : t("กดเพื่อซ่อน", "Click to hide")}>
            <LineSample type={k} />{FLOW_EDGE_TYPES[k].label} <span className="tabular-nums text-slate-400">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="rounded-xl border border-slate-200 bg-white p-2 overflow-x-auto">
          <svg viewBox={`0 0 680 ${view.height}`} className="w-full min-w-[560px] h-auto" role="img" aria-label={t(`แผนผัง${view.label}`, `${view.label} map`)}>
            <defs>
              <marker id="fm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            {view.bands && (
              <g>
                {["ซื้อ", "ผลิต", "จ่ายงาน", "ขาย"].map((h, i) => (
                  <g key={h}>
                    <rect x={CX[i] - 8} y={28} width={W + 16} height={388} rx={12} fill="#f1f5f9" />
                    <text x={CX[i] + W / 2} y={16} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="#334155">{h}</text>
                  </g>
                ))}
                <rect x={10} y={424} width={650} height={84} rx={12} fill="none" stroke="#cbd5e1" strokeWidth={0.75} strokeDasharray="4 4" />
                <text x={22} y={438} dominantBaseline="central" fontSize={11} fill="#64748b">{t("คลังสินค้า (สต็อก)", "Stock")}</text>
              </g>
            )}
            {shown.map((e) => {
              const ty = FLOW_EDGE_TYPES[e.type];
              return (
                <g key={e.i} opacity={edgeOn(e) ? 1 : 0.12}>
                  <path d={e.d} fill="none" stroke={ty.color} strokeWidth={e.type === "missing" ? 2 : 1.5} strokeDasharray={ty.dash} strokeLinecap="round" markerEnd="url(#fm-arrow)" />
                  <path d={e.d} fill="none" stroke="transparent" strokeWidth={10} className="cursor-pointer" onClick={() => setSel({ k: "e", i: e.i })} />
                </g>
              );
            })}
            {Object.entries(view.pos).map(([id, p]) => {
              const [x, y] = xy(p), n = FLOW_NODES[id], g = isGray(id), on = nodeOn(id), picked = sel?.k === "n" && sel.id === id;
              return (
                <g key={id} className="cursor-pointer" opacity={on ? 1 : 0.4} onClick={() => setSel(picked ? null : { k: "n", id })}>
                  <title>{n.label}</title>
                  <rect x={x} y={y} width={W} height={H} rx={8} fill={g ? "#f8fafc" : "#eef2ff"} stroke={picked ? "#4f46e5" : g ? "#cbd5e1" : "#a5b4fc"} strokeWidth={picked ? 2 : 0.75} />
                  <text x={x + W / 2} y={y + 16} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill={g ? "#334155" : "#312e81"}>{n.label}</text>
                  <text x={x + W / 2} y={y + 32} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={g ? "#64748b" : "#6366f1"}>{n.sub}</text>
                  {nodeAlert(id) && <circle cx={x + W - 9} cy={y + 9} r={3.5} fill="#dc2626" />}
                </g>
              );
            })}
            {shown.map((e) => {
              const ty = FLOW_EDGE_TYPES[e.type];
              return (
                <g key={`b${e.i}`} className="cursor-pointer" opacity={edgeOn(e) ? 1 : 0.12} onClick={() => setSel(sel?.k === "e" && sel.i === e.i ? null : { k: "e", i: e.i })}>
                  <title>{FLOW_EDGES[e.id].title}</title>
                  <circle cx={e.badge[0]} cy={e.badge[1]} r={9} fill="#fff" stroke={ty.color} strokeWidth={1.5} />
                  <text x={e.badge[0]} y={e.badge[1]} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill={ty.color}>{e.i + 1}</text>
                </g>
              );
            })}
          </svg>
          <div className="px-2 pt-1 text-[11px] text-slate-400">
            {t("จุดแดงมุมกล่อง = มีช่องโหว่/ตัวเลขที่ต้องตาม · กล่องสีเทา = อยู่ส่วนอื่น", "Red dot = gap or number to follow up · grey box = other area")}
          </div>
        </div>
        <div>{panel}</div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        {t("แผนผังนี้อ่านจากทะเบียนกลาง lib/flow-map.ts (ตรวจกับระบบจริง 2 พ.ย. 2569) · แก้ระบบแล้วต้องแก้ทะเบียน มีเทสต์เตือนเมื่อไฟล์ที่อ้างหายไป", "Built from the central registry lib/flow-map.ts — update it when the system changes")}
        {healthErr ? t(" · โหลดตัวเลขสดไม่สำเร็จ", " · live numbers failed to load") : healthAt ? t(` · ตัวเลขสด ณ ${new Date(healthAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`, ` · numbers as of ${new Date(healthAt).toLocaleTimeString()}`) : ""}
      </p>
    </div>
  );
}
