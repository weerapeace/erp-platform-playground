"use client";
/**
 * 🧵 SewView — เครื่องมือเย็บของสตูดิโอแพทเทิร์น (รอบ 2): บอกว่าขอบไหนเย็บติดกับขอบไหน แล้วระบบตรวจความยาวให้
 *   วิธีใช้: คลิกขอบของชิ้นแรก (คลิกขอบที่ติดกันต่อได้ = ด้านยาวหลายขอบ) → คลิกขอบของอีกชิ้น → กด "เย็บติดกัน"
 *   ความยาวสองด้านต่างกันเกิน 0.1 ซม. = เตือน "ยาวไม่เท่ากัน" (ไม่ปรับขนาดชิ้นให้เอง — ต้องกลับไปแก้ที่ชิ้น)
 *   ชิ้นถูกเพิ่ม/ลบจุดจนจำนวนขอบเปลี่ยน หรือชิ้นถูกลบ = "ต้องกำหนดใหม่"
 *   ดูอย่างเดียว (readonly) = เห็นตะเข็บ แต่เพิ่ม/ลบไม่ได้
 *
 *   <SewView pieces={[{ pid, name, shape }]} seams={seams} onChange={setSeams} />
 * สูตร: lib/pattern-seams · ใช้ที่: app/pattern-studio/[id] · คู่มือ: docs/pattern-studio.md
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { shapePathD, type Pt, type Shape } from "@/lib/pattern-shape";
import { SEAM_TOL, checkSeam, extendSide, pieceEdges, seamLabel, sideHasEdge, sideLength, sidePoints, type Seam, type SeamSide } from "@/lib/pattern-seams";

export type SewPiece = { pid: string; name: string; shape: Shape; holes?: Shape[] };
const COLORS = ["#c2410c", "#1d5fd6", "#8b2fc9", "#0f766e", "#b91c5c", "#4d7c0f", "#b45309", "#4338ca"];
const f1 = (x: number) => x.toFixed(1);
const dOf = (P: Pt[]) => "M" + P.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L");
const midOf = (P: Pt[]): Pt => {
  let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  let t = L / 2;
  for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (t <= d || i === P.length - 1) { const f = d ? Math.min(1, t / d) : 0; return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]; } t -= d; }
  return P[0];
};

export function SewView({ pieces, seams, onChange, readonly = false, onBack }: {
  /** ฝังในหน้าวาดชิ้น: มีแถบเครื่องมือซ้าย (ลูกศร = กลับไปวาด · เข็ม = กำลังใช้อยู่) — ไม่ส่ง = ไม่มีแถบ */
  onBack?: () => void;
  pieces: SewPiece[];
  seams: Seam[];
  onChange: (next: Seam[]) => void;
  readonly?: boolean;
}) {
  const t = useT();
  const [a, setA] = useState<SeamSide | null>(null);
  const [b, setB] = useState<SeamSide | null>(null);
  const [hover, setHover] = useState<string | null>(null);        // "pid:i" ขอบที่ชี้อยู่
  const [hot, setHot] = useState<string | null>(null);            // ตะเข็บที่ชี้อยู่ในรายการ

  const byPid = useMemo(() => new Map(pieces.map((p) => [p.pid, p])), [pieces]);
  const shapes = useMemo(() => new Map(pieces.map((p) => [p.pid, p.shape])), [pieces]);
  const edges = useMemo(() => new Map(pieces.map((p) => [p.pid, pieceEdges(p.shape)])), [pieces]);
  const box = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const E of edges.values()) for (const e of E) for (const [x, y] of e.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (!(x1 > x0)) return { x: 0, y: 0, w: 60, h: 40 };
    const pad = Math.max(3, (x1 - x0) * 0.04);
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  }, [edges]);
  const u = box.w / 100;                                           // หน่วยวาด (ให้เส้น/ตัวหนังสือขนาดคงที่เทียบกับภาพ)
  const checks = useMemo(() => seams.map((s) => checkSeam(shapes, s)), [seams, shapes]);

  const nameOf = (pid: string) => byPid.get(pid)?.name || t("ชิ้นไม่มีชื่อ", "Unnamed piece");
  const sideText = (s: SeamSide) => `${nameOf(s.pid)} · ${s.count > 1 ? t(`${s.count} ขอบติดกัน`, `${s.count} joined edges`) : t(`ขอบ ${s.from + 1}`, `edge ${s.from + 1}`)}`;
  const lenOfSide = (s: SeamSide | null) => { const sh = s ? shapes.get(s.pid) : null; return s && sh ? sideLength(sh, s) : null; };
  const la = lenOfSide(a), lb = lenOfSide(b), diff = la != null && lb != null ? Math.abs(la - lb) : null;

  const clickEdge = (pid: string, i: number, n: number) => {
    if (readonly) return;
    const fresh: SeamSide = { pid, from: i, count: 1, n };
    if (!a) { setA(fresh); return; }
    if (!b) {
      if (a.pid === pid) { if (sideHasEdge(a, i)) return; const ext = extendSide(a, i); if (ext) { setA(ext); return; } }
      setB(fresh); return;
    }
    if (b.pid === pid) { if (sideHasEdge(b, i)) return; const ext = extendSide(b, i); if (ext) { setB(ext); return; } }
    setB(fresh);
  };
  const clear = () => { setA(null); setB(null); };
  const sew = () => {
    if (!a || !b) return;
    onChange([...seams, { id: `s${Date.now().toString(36)}${seams.length}`, a, b }]);
    clear();
  };

  const seamOfEdge = (pid: string, i: number) => seams.findIndex((s) => (s.a.pid === pid && s.a.n === (edges.get(pid)?.length ?? -1) && sideHasEdge(s.a, i)) || (s.b.pid === pid && s.b.n === (edges.get(pid)?.length ?? -1) && sideHasEdge(s.b, i)));
  const pill = (c: (typeof checks)[number]) => c.status === "ok"
    ? <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{t("ยาวเท่ากัน", "Same length")}</span>
    : c.status === "mismatch"
      ? <span className="whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">{t(`ยาวไม่เท่ากัน ต่าง ${f1(c.diff)} ซม.`, `Length mismatch ${f1(c.diff)} cm`)}</span>
      : <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{t("ต้องกำหนดใหม่", "Needs redoing")}</span>;
  const bad = checks.filter((c) => c.status !== "ok").length;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-2">
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
          {onBack && (
            <div className="absolute left-2 top-2 z-10 flex flex-col gap-0.5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm" aria-label={t("เครื่องมือ", "Tools")}>
              <button type="button" onClick={onBack} title={t("กลับไปวาดชิ้น", "Back to drawing")} aria-label={t("กลับไปวาดชิ้น", "Back to drawing")} className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><Icon value="i:pointer" className="text-[16px]" /></button>
              <span className="my-0.5 h-px w-5 self-center bg-slate-200" />
              <span title={t("เครื่องมือเย็บ (กำลังใช้)", "Sewing tool (active)")} aria-current="true" className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon value="i:needle-thread" className="text-[16px]" /></span>
            </div>
          )}
          <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="block max-h-[640px] w-full" role="img" aria-label={t("ชิ้นแพทเทิร์นสำหรับกำหนดตะเข็บ", "Pattern pieces for assigning seams")}>
            {pieces.map((p) => (
              <g key={p.pid}>
                <path d={shapePathD(p.shape) + (p.holes ?? []).map((h) => shapePathD(h)).join("")} fill="#f1f5f9" fillRule="evenodd" stroke="none" />
                {(p.holes ?? []).map((h, hi) => <path key={`h${hi}`} d={shapePathD(h)} fill="none" stroke="#94a3b8" strokeWidth={0.18 * u} strokeDasharray={`${0.6 * u} ${0.4 * u}`} />)}
                {(edges.get(p.pid) ?? []).map((e) => {
                  const key = `${p.pid}:${e.i}`, si = seamOfEdge(p.pid, e.i);
                  const inA = !!a && a.pid === p.pid && sideHasEdge(a, e.i), inB = !!b && b.pid === p.pid && sideHasEdge(b, e.i);
                  const color = inA ? "#f59e0b" : inB ? "#0ea5e9" : si >= 0 ? COLORS[si % COLORS.length] : "#94a3b8";
                  const strong = inA || inB || si >= 0 || hover === key || (hot != null && si >= 0 && seams[si].id === hot);
                  return (
                    <g key={e.i}>
                      <path d={dOf(e.pts)} fill="none" stroke={color} strokeWidth={(strong ? 0.55 : 0.22) * u * (hot != null && si >= 0 && seams[si].id === hot ? 1.6 : 1)} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={dOf(e.pts)} fill="none" stroke="transparent" strokeWidth={2.2 * u} style={{ cursor: readonly ? "default" : "pointer" }}
                        onPointerEnter={() => setHover(key)} onPointerLeave={() => setHover((h) => (h === key ? null : h))} onClick={() => clickEdge(p.pid, e.i, (edges.get(p.pid) ?? []).length)}>
                        <title>{`${nameOf(p.pid)} · ${t("ขอบ", "edge")} ${e.i + 1} · ${f1(e.len)} ${t("ซม.", "cm")}`}</title>
                      </path>
                    </g>
                  );
                })}
                {(() => { const E = edges.get(p.pid) ?? []; let cx = 0, cy = 0, n = 0; for (const e of E) for (const q of e.pts) { cx += q[0]; cy += q[1]; n++; } return n ? <text x={cx / n} y={cy / n} fontSize={1.5 * u} textAnchor="middle" dominantBaseline="middle" fill="#475569" style={{ pointerEvents: "none" }}>{p.name || "—"}</text> : null; })()}
              </g>
            ))}
            {/* ป้ายชื่อตะเข็บ กลางแต่ละด้าน */}
            {seams.map((s, i) => [s.a, s.b].map((side, k) => {
              const sh = shapes.get(side.pid), P = sh ? sidePoints(sh, side) : null;
              if (!P) return null;
              const m = midOf(P);
              return (
                <g key={`${s.id}-${k}`} style={{ pointerEvents: "none" }}>
                  <circle cx={m[0]} cy={m[1]} r={1.25 * u} fill={COLORS[i % COLORS.length]} />
                  <text x={m[0]} y={m[1]} fontSize={1.4 * u} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill="#fff">{seamLabel(i)}</text>
                </g>
              );
            }))}
          </svg>
        </div>
        <p className="text-[11px] text-slate-400">{readonly
          ? t("ดูอย่างเดียว · ชี้ที่ขอบเพื่อดูความยาว", "View only · hover an edge to see its length")
          : t("คลิกขอบของชิ้นแรก (คลิกขอบที่ติดกันเพื่อต่อให้ยาวขึ้น) แล้วคลิกขอบของอีกชิ้น · ชี้ที่ขอบเพื่อดูความยาว", "Click an edge on the first piece (click a neighbouring edge to extend), then click an edge on the other piece · hover an edge for its length")}</p>
      </div>

      <aside className="min-w-0 space-y-3 text-sm">
        {!readonly && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500">{t("กำลังจับคู่ขอบ", "Pairing edges")}</div>
            <div className="flex items-start gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" /><span className="min-w-0 flex-1">{a ? <>{sideText(a)} <b className="tabular-nums">{la != null ? `${f1(la)} ${t("ซม.", "cm")}` : ""}</b></> : <span className="text-slate-400">{t("ด้านที่ 1: คลิกขอบบนภาพ", "Side 1: click an edge")}</span>}</span></div>
            <div className="flex items-start gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" /><span className="min-w-0 flex-1">{b ? <>{sideText(b)} <b className="tabular-nums">{lb != null ? `${f1(lb)} ${t("ซม.", "cm")}` : ""}</b></> : <span className="text-slate-400">{a ? t("ด้านที่ 2: คลิกขอบของอีกชิ้น", "Side 2: click an edge on the other piece") : "—"}</span>}</span></div>
            {diff != null && (diff > SEAM_TOL
              ? <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{t(`สองด้านยาวต่างกัน ${f1(diff)} ซม. เย็บได้ แต่จะย่นหรือเหลือปลาย ควรกลับไปแก้ขนาดชิ้นให้เท่ากัน`, `The two sides differ by ${f1(diff)} cm. It can be sewn but will pucker or leave an end over. Fix the piece sizes so they match.`)}</p>
              : <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">{t("สองด้านยาวเท่ากัน เย็บได้พอดี", "Both sides are the same length")}</p>)}
            <div className="flex gap-2">
              <button type="button" disabled={!a || !b} onClick={sew} className="h-8 rounded-lg bg-blue-600 px-3 text-xs text-white hover:bg-blue-700 disabled:opacity-40">{t("เย็บติดกัน", "Sew together")}</button>
              <button type="button" disabled={!a} onClick={clear} className="h-8 rounded-lg border border-slate-200 px-3 text-xs hover:bg-slate-50 disabled:opacity-40">{t("ล้างที่เลือก", "Clear selection")}</button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-medium text-slate-500">{t(`ตะเข็บ ${seams.length} แนว`, `${seams.length} seams`)}</span>
            {bad > 0 && <span className="text-[11px] text-red-600">{t(`${bad} แนวต้องแก้`, `${bad} need attention`)}</span>}
          </div>
          {seams.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">{t("ยังไม่มีตะเข็บ — สร้างชิ้นจากแม่แบบทรงจะได้ตะเข็บตั้งต้นมาเลย หรือจับคู่ขอบเองจากภาพ", "No seams yet — pieces from a bag template come with seams, or pair edges yourself on the drawing")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {seams.map((s, i) => (
                <li key={s.id} onPointerEnter={() => setHot(s.id)} onPointerLeave={() => setHot(null)} className={`flex items-start gap-2 px-3 py-2 ${hot === s.id ? "bg-slate-50" : ""}`}>
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>{seamLabel(i)}</span>
                  <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                    <div className="truncate">{sideText(s.a)}</div>
                    <div className="truncate text-slate-500">↔ {sideText(s.b)}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {checks[i].la != null && checks[i].lb != null && <span className="tabular-nums text-slate-600">{f1(checks[i].la!)} ↔ {f1(checks[i].lb!)} {t("ซม.", "cm")}</span>}
                      {pill(checks[i])}
                    </div>
                  </div>
                  {!readonly && <button type="button" onClick={() => onChange(seams.filter((x) => x.id !== s.id))} title={t("เลิกเย็บแนวนี้", "Remove this seam")} aria-label={t("เลิกเย็บแนวนี้", "Remove this seam")} className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"><Icon value="i:x" className="text-sm" /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1.5 rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
          <div className="flex items-center gap-1.5 font-medium text-blue-800"><Icon value="i:bulb" className="text-sm" />{t("ช่างคิดยังไง", "How a pattern maker thinks")}</div>
          <p>{t("ตะเข็บ 1 แนว คือขอบ 2 ขอบที่จะถูกเย็บติดกัน กฎข้อแรกคือสองขอบต้องยาวเท่ากัน ถ้าไม่เท่า ชิ้นที่ยาวกว่าจะย่นหรือเหลือปลาย", "A seam is two edges that get sewn together. Rule one: they must be the same length, or the longer one puckers or overhangs.")}</p>
          <p>{t("ขอบโค้งหลายช่วงที่ต่อกัน (เช่น ข้าง–ก้น–ข้าง ของตัวหน้า) นับเป็นด้านเดียว เพราะเย็บรวดเดียวกับชิ้นข้างยาว", "Several joined edges (like the side–bottom–side of a front panel) count as one side, because they are sewn in one run to the gusset strip.")}</p>
          <p className="text-slate-500">{t("ระบบไม่ปรับขนาดชิ้นให้เอง ถ้ายาวไม่เท่ากันให้กลับไปแก้ที่แท็บวาดชิ้น แล้วความยาวตรงนี้จะคิดใหม่ทันที", "Piece sizes are never changed for you. If lengths differ, fix the piece in the Draw tab and the lengths here update at once.")}</p>
        </div>
      </aside>
    </div>
  );
}
