"use client";
/**
 * หน้าขอซื้อ › แท็บใบสั่งผลิต › มุมมอง "รวมตามรุ่น" (Parent SKU) — กดการ์ดรุ่นแล้วเห็นวัตถุดิบของทุกใบรวมเป็นการ์ดเดียวต่อวัตถุดิบ
 *   ✓ มีของแล้ว (ทุกใบ) · 🔢 นับครั้งเดียว แบ่งให้ใบใกล้กำหนดก่อน · 🛒 ขอซื้อรวม 1 บรรทัด ผูกเลขใบครบ
 * เจ้าของสั่ง 2026-11-02 (widget "รวมตามรุ่น")
 * ของกลางที่ใช้: /api/mo/material-status?mo_nos= · PATCH /api/mo/material {items} · /api/inventory/quick-count · /api/mo/material-allocations
 *   lib/mo-group-materials (รวมยอด/แบ่งสต๊อก) · oddMos (ใบที่ใช้ต่อชิ้นผิดปกติ ไม่รวมในขอซื้อ — กติกาเดียวกับ "ซื้อรวมทั้งกลุ่ม")
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MO_SEGS, MoProgressBar } from "@/components/mo-material-progress";
import { ceil2, oddMos } from "@/components/mo-shortage-picker";
import { groupMaterials, haveItems, planStockUse, type GroupMatRow } from "@/lib/mo-group-materials";
import { matStage, countStages } from "@/lib/mo-material-stage";
import type { MoMaterialStatus, MoMaterialStatusResult } from "@/app/api/mo/material-status/route";
import type { PurchaseNeedRow } from "@/app/api/mo/purchase-needs/route";

export type ParentGroupMo = { mo_no: string; product_label: string; product_image: string | null; due_date: string | null };
/** 1 บรรทัดที่จะใส่ตะกร้า — หน้าแปลงเป็นบรรทัดตะกร้าเอง (ตัวเดียวกับ "ซื้อรวมทั้งกลุ่ม") */
export type GroupCartLine = { code: string | null; name: string | null; uom: string; qty: number; nos: string[] };

type UndoItem = { id: string; on_hand_qty: number; purchase_override: number | null };

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 });

export function MoParentGroup({ title, mos, needs, cols, canEdit, canStock, canStockView, inCartQty, onBack, onOpenMo, onHistory, onAddCart, onChanged }: {
  title: string; mos: ParentGroupMo[]; needs: PurchaseNeedRow[] | null; cols: number;
  canEdit: boolean; canStock: boolean; canStockView: boolean;
  inCartQty: (code: string | null, nos: string[]) => number;
  onBack: () => void; onOpenMo: (moNo: string) => void; onHistory: (it: MoMaterialStatus) => void;
  onAddCart: (lines: GroupCartLine[]) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [results, setResults] = useState<MoMaterialStatusResult[] | null>(null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  const variantOf = useMemo(() => { const m = new Map(mos.map((x) => [x.mo_no, x.product_label])); return (n: string) => m.get(n) ?? n; }, [mos]);
  const dueOf = useMemo(() => { const m = new Map(mos.map((x) => [x.mo_no, x.due_date])); return (n: string) => m.get(n) ?? null; }, [mos]);
  const variants = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of mos) m.set(x.product_label, (m.get(x.product_label) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [mos]);
  const [include, setInclude] = useState<Set<string>>(() => new Set(mos.map((x) => x.product_label)));
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<Record<string, UndoItem[]>>({});   // กด "มีของแล้ว" ในรอบนี้ → เก็บค่าเดิมไว้ยกเลิก
  const [counting, setCounting] = useState<GroupMatRow | null>(null);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());   // การ์ดที่กาง "ดูรายใบ"
  const [showMos, setShowMos] = useState(false);

  const moKey = mos.map((m) => m.mo_no).join(",");
  useEffect(() => {
    let alive = true;
    setErr(false);
    apiFetch(`/api/mo/material-status?mo_nos=${encodeURIComponent(moKey)}`).then((r) => r.json())
      .then((j) => { if (!alive) return; if (Array.isArray(j.data)) setResults(j.data as MoMaterialStatusResult[]); else setErr(true); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [moKey, tick]);

  const rows = useMemo(() => (results ? groupMaterials(results, variantOf, dueOf, include) : []), [results, variantOf, dueOf, include]);
  const multiColor = [...include].length > 1;
  // แถบ 6 ขั้น (ลำดับเดียวกับ MO_SEGS) นับเป็นบรรทัด วัตถุดิบ × ใบ — ใบที่จ่ายงานแล้ว = ปิดงาน
  const lineCounts = useMemo(() => {
    const disp = new Set((results ?? []).filter((r) => r.dispatch).map((r) => r.mo_no));
    return countStages(rows.flatMap((r) => r.mos.map((m) => matStage({ ...m.it, dispatched: m.it.dispatched || disp.has(m.mo_no) }))));
  }, [rows, results]);
  const oddOf = (r: GroupMatRow) => {
    const n = needs?.find((x) => (x.component_sku ?? `nm:${x.component_name ?? ""}`) === r.key);
    return n ? oddMos(n.mos) : new Set<string>();
  };
  const reload = () => { setTick((t) => t + 1); onChanged(); };

  const saveItems = async (items: UndoItem[] | { id: string; on_hand_qty: number; purchase_override: null }[], label: string) => {
    const res = await apiFetch("/api/mo/material", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, label }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
  };
  const markHave = async (list: GroupMatRow[]) => {
    const targets = list.filter((r) => r.buy.length > 0);
    if (targets.length === 0) return;
    const { items } = haveItems(targets);
    setBusy(true);
    try {
      await saveItems(items, `มีของแล้ว · รวมรุ่น ${title}`);
      setUndo((u) => ({ ...u, ...Object.fromEntries(targets.map((r) => [r.key, haveItems([r]).undo])) }));
      setPick(new Set());
      toast.success(targets.length === 1 ? `บันทึกแล้ว: มี ${targets[0].name ?? targets[0].code} แล้ว ${targets[0].buy.length} ใบ` : `บันทึกแล้ว: มีของแล้ว ${targets.length} วัตถุดิบ (${items.length} บรรทัด)`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const unHave = async (r: GroupMatRow) => {
    const items = undo[r.key];
    if (!items?.length) return;
    setBusy(true);
    try {
      await saveItems(items, `ยกเลิกมีของแล้ว · รวมรุ่น ${title}`);
      setUndo((u) => { const n = { ...u }; delete n[r.key]; return n; });
      toast.success(`ยกเลิก "มีของแล้ว" ของ ${r.name ?? r.code} (${items.length} ใบ)`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const addCart = (list: GroupMatRow[]) => {
    const lines: GroupCartLine[] = [];
    for (const r of list) {
      const odd = oddOf(r);
      const ok = r.buy.filter((m) => !odd.has(m.mo_no));
      const qty = ceil2(ok.reduce((n, m) => n + m.it.remaining, 0));
      if (qty > 0) lines.push({ code: r.code, name: r.name, uom: r.uom ?? "", qty, nos: ok.map((m) => m.mo_no) });
    }
    if (lines.length === 0) { toast.warning("ไม่มีวัตถุดิบที่ต้องซื้อในที่เลือก"); return; }
    onAddCart(lines);
    setPick(new Set());
  };

  const buyRows = rows.filter((r) => r.status === "buy");
  const sections: { title: string; hint: string; list: GroupMatRow[] }[] = [
    { title: multiColor ? "ต้องซื้อ · ใช้ร่วมหลายสี" : "ต้องซื้อ", hint: multiColor ? "กดครั้งเดียวได้ทุกใบ" : "", list: buyRows.filter((r) => !multiColor || r.shared) },
    { title: "ต้องซื้อ · เฉพาะสี", hint: "ผ้า/หนังตามสี", list: multiColor ? buyRows.filter((r) => !r.shared) : [] },
    { title: "ขอซื้อ / สั่งซื้อแล้ว", hint: "รอของเข้า", list: rows.filter((r) => r.status === "requested" || r.status === "ordered") },
    { title: "มีของ / ได้ของแล้ว", hint: "", list: rows.filter((r) => r.status === "done") },
  ];
  const picked = rows.filter((r) => pick.has(r.key));
  const toggleVariant = (v: string) => setInclude((s) => {
    const n = new Set(s);
    if (n.has(v)) { if (n.size > 1) n.delete(v); } else n.add(v);
    return n;
  });

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button onClick={onBack} className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex-shrink-0">← รุ่นอื่น</button>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">{title} <span className="text-xs font-normal text-slate-400">· รวมทั้งรุ่น</span></div>
          <div className="text-[11px] text-slate-400">{mos.length} ใบสั่งผลิต · วัตถุดิบ {results ? rows.length : "…"} รายการ{results ? ` · ต้องซื้อ ${buyRows.length}` : ""}</div>
        </div>
        <button type="button" onClick={() => setShowMos((v) => !v)} className="ml-auto h-8 px-2.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">
          ใบในรุ่นนี้ {mos.length} ใบ {showMos ? "▴" : "▾"}
        </button>
      </div>
      {showMos && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {mos.map((m) => (
            <button key={m.mo_no} type="button" onClick={() => onOpenMo(m.mo_no)} title="เปิดดูทีละใบ"
              className="h-7 px-2 text-[11px] rounded-md border border-slate-200 bg-white hover:border-rose-300 text-slate-600">
              <span className="font-mono">{m.mo_no}</span> · {m.product_label}{m.due_date ? ` · ส่ง ${m.due_date}` : ""} ›
            </button>
          ))}
        </div>
      )}
      {variants.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="text-xs text-slate-400 mr-0.5">รวมสี</span>
          {variants.map(([v, n]) => (
            <button key={v} type="button" onClick={() => toggleVariant(v)}
              className={`h-7 px-2.5 text-xs rounded-full border transition-colors ${include.has(v) ? "bg-rose-50 border-rose-300 text-rose-700 font-medium" : "bg-white border-slate-200 text-slate-400 line-through"}`}>
              {v} <b>{n}</b> ใบ
            </button>
          ))}
          <span className="text-[11px] text-slate-400">กดปิดสีที่ยังไม่ทำ</span>
        </div>
      )}
      {err && <div className="text-sm text-rose-600 py-8 text-center">โหลดวัตถุดิบของรุ่นนี้ไม่สำเร็จ <button onClick={() => setTick((t) => t + 1)} className="underline">ลองใหม่</button></div>}
      {!err && !results && <div className="text-center text-slate-400 py-16 text-sm">กำลังรวมวัตถุดิบของ {mos.length} ใบ…</div>}
      {results && rows.length > 0 && (
        <div className="mb-4">
          <MoProgressBar counts={lineCounts} className="h-2" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
            {MO_SEGS.map(([cls, label], i) => <span key={label} className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-sm ${cls}`} />{label} <b className="text-slate-700">{lineCounts[i]}</b></span>)}
            <span className="text-slate-400">(นับเป็นบรรทัด วัตถุดิบ × ใบ)</span>
          </div>
        </div>
      )}
      {results && rows.length === 0 && <div className="text-center text-slate-300 py-16">ใบในรุ่นนี้ยังไม่มีสูตรวัตถุดิบ (BOM)</div>}
      {picked.length > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-2 flex-wrap mb-3 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-sm">
          <span>เลือก <b>{picked.length}</b> วัตถุดิบ</span>
          {canEdit && (
            <button type="button" disabled={busy} onClick={() => void markHave(picked)}
              className="h-8 px-3 text-xs font-medium text-emerald-700 bg-white border border-emerald-200 rounded-md hover:bg-emerald-50 disabled:opacity-50">
              <Icon value="✅" /> มีของแล้วทั้งหมด
            </button>
          )}
          <button type="button" onClick={() => addCart(picked)}
            className="h-8 px-3 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-md hover:bg-rose-50">
            <Icon value="🛒" /> ใส่ตะกร้าทั้งหมด
          </button>
          <button type="button" onClick={() => setPick(new Set())} className="ml-auto text-xs text-blue-600 hover:underline">ไม่เลือก</button>
        </div>
      )}
      {sections.map((s) => s.list.length > 0 && (
        <div key={s.title} className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2 flex-wrap">
            {s.title} <span className="text-xs font-normal text-slate-400">{s.list.length} รายการ{s.hint ? ` · ${s.hint}` : ""}</span>
            {s.list[0].status === "buy" && (
              <button type="button" onClick={() => setPick((p) => { const all = s.list.every((r) => p.has(r.key)); const n = new Set(p); for (const r of s.list) { if (all) n.delete(r.key); else n.add(r.key); } return n; })}
                className="text-xs font-normal text-blue-600 hover:underline">{s.list.every((r) => pick.has(r.key)) ? "ไม่เลือกกลุ่มนี้" : "เลือกทั้งกลุ่ม"}</button>
            )}
          </div>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": cols } as CSSProperties}>
            {s.list.map((r) => (
              <GroupMatCard key={r.key} r={r} odd={oddOf(r)} multiColor={multiColor} picked={pick.has(r.key)} busy={busy}
                inCart={inCartQty(r.code, r.mos.map((m) => m.mo_no))} canEdit={canEdit} canStock={canStock} canStockView={canStockView}
                canUndo={!!undo[r.key]?.length} open={openRows.has(r.key)}
                onPick={() => setPick((p) => { const n = new Set(p); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}
                onToggleOpen={() => setOpenRows((o) => { const n = new Set(o); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}
                onHave={() => void markHave([r])} onUndo={() => void unHave(r)} onCount={() => setCounting(r)}
                onCart={() => addCart([r])} onHistory={() => onHistory(r.mos[0].it)} onOpenMo={onOpenMo} />
            ))}
          </div>
        </div>
      ))}
      {counting && (
        <GroupStockCountDialog r={counting} title={title} onClose={() => setCounting(null)}
          onSaved={() => { setCounting(null); reload(); }} />
      )}
    </>
  );
}

const STATUS_TEXT: Record<string, string> = { buy: "ต้องซื้อ", requested: "ขอแล้ว", ordered: "สั่งแล้ว", have: "มีของแล้ว", received: "ได้ของแล้ว", ready: "เตรียมแล้ว", skip: "ไม่ต้องซื้อ" };

function GroupMatCard({ r, odd, multiColor, picked, busy, inCart, canEdit, canStock, canStockView, canUndo, open, onPick, onToggleOpen, onHave, onUndo, onCount, onCart, onHistory, onOpenMo }: {
  r: GroupMatRow; odd: Set<string>; multiColor: boolean; picked: boolean; busy: boolean; inCart: number;
  canEdit: boolean; canStock: boolean; canStockView: boolean; canUndo: boolean; open: boolean;
  onPick: () => void; onToggleOpen: () => void; onHave: () => void; onUndo: () => void; onCount: () => void; onCart: () => void;
  onHistory: () => void; onOpenMo: (moNo: string) => void;
}) {
  const isBuy = r.status === "buy";
  const u = r.uom ?? "";
  const oddBuy = r.buy.filter((m) => odd.has(m.mo_no));
  const s = r.stock;
  const tag = (cls: string, text: string) => <span className={`inline-block max-w-full truncate text-[11px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{text}</span>;
  const others = [r.counts.requested && `ขอแล้ว ${r.counts.requested}`, r.counts.ordered && `สั่งแล้ว ${r.counts.ordered}`, r.counts.done && `ครบ ${r.counts.done}`].filter(Boolean).join(" · ");
  return (
    <div className={`relative text-left bg-white border rounded-xl overflow-hidden flex flex-col ${picked ? "border-blue-400 ring-1 ring-blue-200" : isBuy ? "border-slate-200" : "border-slate-100"}`}>
      {isBuy && (
        <label className="absolute top-2 left-2 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-white/90 border border-slate-200 cursor-pointer" title="เลือกเพื่อทำทีเดียวหลายวัตถุดิบ">
          <input type="checkbox" checked={picked} onChange={onPick} className="rounded border-slate-300" />
        </label>
      )}
      <div className={`aspect-[4/3] bg-slate-50 flex items-center justify-center ${isBuy ? "" : "opacity-60"}`}>
        {r.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-3xl"><Icon value="📦" /></span>}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <div className={`font-medium text-[13px] leading-snug line-clamp-2 ${isBuy ? "text-slate-800" : "text-slate-500"}`} title={r.name ?? ""}>{r.name}</div>
        {r.code && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded max-w-full truncate self-start">{r.code}</div>}
        <div>
          {multiColor && r.shared
            ? tag("bg-violet-50 text-violet-700 border-violet-200", `ใช้ร่วม ${r.mos.length} ใบ`)
            : tag("bg-amber-50 text-amber-700 border-amber-200", `${multiColor ? `เฉพาะ ${r.variants.join(", ")} · ` : ""}${r.mos.length} ใบ`)}
        </div>
        <div className="text-xs text-slate-400">ใช้รวม {fmt(r.required)} {u}</div>
        {isBuy && (
          <>
            <div className="text-sm font-semibold text-rose-600">ต้องซื้อ {fmt(r.remaining)}<span className="text-xs font-normal text-slate-400"> {u}</span></div>
            <div className="text-[11px] text-slate-500">ต้องซื้อ {r.buy.length} ใบ{others ? ` · ${others}` : ""}</div>
            {oddBuy.length > 0 && <div className="text-[11px] text-amber-600" title={oddBuy.map((m) => m.mo_no).join(", ")}>⚠ {oddBuy.length} ใบใช้ต่อชิ้นสูงผิดปกติ — ไม่รวมในขอซื้อรวม</div>}
            {inCart > 0 && <div>{tag("bg-blue-50 text-blue-700 border-blue-200", `ในตะกร้า ${fmt(inCart)} ${u}`)}</div>}
          </>
        )}
        {r.status === "requested" && <div>{tag("bg-amber-50 text-amber-700 border-amber-200", `ขอแล้ว · รออนุมัติ ${r.counts.requested} ใบ`)}</div>}
        {r.status === "ordered" && <div>{tag("bg-blue-50 text-blue-700 border-blue-200", `สั่งแล้ว ${r.counts.ordered} ใบ`)}</div>}
        {r.status === "done" && <div>{tag("bg-emerald-50 text-emerald-700 border-emerald-200", `ครบแล้ว ${r.mos.length} ใบ`)}</div>}
        {s && r.status !== "done" && (() => {
          const when = s.counted_at ? new Date(s.counted_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : null;
          const text = s.counted_at ? `นับแล้ว ${fmt(s.on_hand ?? s.counted_qty ?? 0)} ${u} · ${when}` : s.on_hand != null ? `ในระบบ ${fmt(s.on_hand)} ${u} · ยังไม่เคยนับ` : "สต๊อก: ยังไม่เคยนับ";
          const cls = s.counted_at ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200";
          return canStockView && r.code
            ? <button type="button" onClick={onHistory} title="ดูความเคลื่อนไหวสต๊อก" className={`self-start max-w-full truncate text-[11px] font-medium px-1.5 py-0.5 rounded border hover:brightness-95 ${cls}`}><Icon value="📦" /> {text} ›</button>
            : <div>{tag(cls, text)}</div>;
        })()}
        <button type="button" onClick={onToggleOpen} className="self-start text-[11px] text-blue-600 hover:underline">{open ? "ซ่อนรายใบ ▴" : `ดูรายใบ (${r.mos.length}) ▾`}</button>
        {open && (
          <div className="border border-slate-100 rounded-md divide-y divide-slate-100">
            {r.mos.map((m) => (
              <button key={m.it.summary_id} type="button" onClick={() => onOpenMo(m.mo_no)} title="เปิดใบนี้"
                className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-left hover:bg-slate-50">
                <span className="font-mono text-slate-500 shrink-0">{m.mo_no.replace(/^MO-\d{4}-/, "")}</span>
                <span className="text-slate-400 truncate min-w-0 flex-1">{m.variant}</span>
                <span className={`shrink-0 ${m.it.status === "buy" ? "text-rose-600" : "text-slate-500"}`}>
                  {m.it.status === "buy" ? `ต้องซื้อ ${fmt(m.it.remaining)}` : STATUS_TEXT[m.it.status] ?? m.it.status}{odd.has(m.mo_no) ? " ⚠" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
        {isBuy && (
          <div className="mt-auto pt-2 flex flex-wrap gap-1.5">
            {canEdit && (
              <button type="button" disabled={busy} onClick={onHave}
                className="flex-1 min-w-[6.5rem] h-8 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md hover:bg-emerald-50 disabled:opacity-50">
                <Icon value="✅" /> มีของแล้ว {r.buy.length} ใบ
              </button>
            )}
            {canStock && r.code && (
              <button type="button" onClick={onCount} title="นับสต๊อกครั้งเดียว แล้วแบ่งให้ใบที่ใกล้กำหนดก่อน"
                className="shrink-0 px-2 h-8 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"><Icon value="🔢" /> นับ</button>
            )}
            <button type="button" onClick={onCart} title="ใส่ตะกร้า 1 บรรทัด ยอดรวมทุกใบ ผูกเลขใบครบ"
              className="flex-1 min-w-[6.5rem] h-8 text-xs font-medium text-rose-700 border border-rose-200 rounded-md hover:bg-rose-50"><Icon value="🛒" /> ขอซื้อรวม</button>
          </div>
        )}
        {canEdit && canUndo && !isBuy && (
          <button type="button" disabled={busy} onClick={onUndo} className="mt-1 self-start text-xs text-blue-600 hover:underline disabled:opacity-50">ยกเลิก (คืนค่าเดิมทุกใบ)</button>
        )}
      </div>
    </div>
  );
}

// ป๊อป "นับสต๊อกครั้งเดียว" ของทั้งรุ่น — ตั้งยอด WH-RAW ผ่าน /api/inventory/quick-count แล้ว (ถ้าเลือก) แบ่งของให้ใบที่ยังต้องซื้อ
//   เรียงใบใกล้กำหนดก่อน (lib/mo-group-materials planStockUse) ผ่าน /api/mo/material-allocations (สมุดแบ่งของ + audit)
//   ของที่ใช้ได้ = นับได้ − ที่แบ่งให้ใบอื่นไว้แล้ว − ที่แบ่งให้ใบในรุ่นนี้ไว้แล้ว (ของยังอยู่ในคลัง แต่จองแล้ว)
function GroupStockCountDialog({ r, title, onClose, onSaved }: { r: GroupMatRow; title: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const s = r.stock;
  const u = r.uom ?? "";
  const [val, setVal] = useState("");
  const [useIt, setUseIt] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const counted = val === "" ? null : Number(val);
  const reserved = (s?.reserved_other ?? 0) + (s?.reserved_this ?? 0);
  const avail = counted == null || !isFinite(counted) ? null : Math.max(0, counted - reserved);
  const plan = avail == null ? [] : planStockUse(r, avail);
  const used = ceil2(plan.reduce((n, p) => n + p.qty, 0));
  const short = Math.max(0, r.remaining - used);
  const save = async () => {
    setErr(null);
    if (counted == null || !isFinite(counted) || counted < 0) { setErr("ใส่จำนวนที่นับได้ก่อน (นับแล้วไม่มีเลย ใส่ 0)"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/inventory/quick-count", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: r.code, counted, warehouse_code: "WH-RAW", ref_label: `นับจากหน้าขอซื้อ · รวมรุ่น ${title}` }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error ?? "บันทึกยอดสต๊อกไม่สำเร็จ"); return; }
      if (useIt && plan.length > 0) {
        const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short" });
        const r2 = await apiFetch("/api/mo/material-allocations", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: plan.map((p) => ({ summary_id: p.summary_id, qty: p.qty })), source: "stock", ref_type: "stock_count", ref_label: `ของในสต๊อก WH-RAW (นับ ${today})` }) });
        const j2 = await r2.json().catch(() => ({}));
        if (!r2.ok || j2.error) toast.warning(`บันทึกยอดสต๊อกแล้ว แต่แบ่งให้ใบงานไม่สำเร็จ: ${j2.error ?? "ลองกดอีกครั้ง"}`);
        else toast.success(`นับแล้ว ${fmt(counted)} ${u} · แบ่งให้ ${plan.length} ใบ รวม ${fmt(used)} ${u}`);
      } else toast.success(`บันทึกยอดสต๊อกแล้ว ${fmt(counted)} ${u}`);
      onSaved();
    } catch { setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSaving(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="sm" storageKey="mo-group-stock-count" title="นับสต๊อกครั้งเดียว · ทั้งรุ่น"
      footer={<>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={() => void save()} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึกยอดสต๊อก"}</button>
      </>}>
      <div className="text-sm font-medium text-slate-800">{r.name}</div>
      {r.code && <div className="text-[11px] font-mono text-slate-400">{r.code}</div>}
      <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
        <div><div className="text-slate-500">รุ่นนี้ยังต้องซื้อ</div><div className="text-sm text-slate-700 mt-0.5 tabular-nums">{fmt(r.remaining)} {u} · {r.buy.length} ใบ</div></div>
        <div><div className="text-slate-500">ระบบมีอยู่ (WH-RAW)</div><div className="text-sm text-slate-700 mt-0.5 tabular-nums">{s?.on_hand == null ? <span className="text-slate-400">— ยังไม่มียอด</span> : `${fmt(s.on_hand)} ${u}`}</div></div>
      </div>
      {reserved > 0 && <div className="mt-2 text-[11px] text-slate-400">แบ่งให้ใบงานไว้แล้ว (ยังไม่จ่ายงาน) {fmt(reserved)} {u} — ไม่นำมาแบ่งซ้ำ</div>}
      <label className="block text-xs font-medium text-slate-600 mt-3 mb-1">นับได้จริงตอนนี้</label>
      <div className="relative">
        <input type="number" inputMode="decimal" min={0} step="any" autoFocus value={val} placeholder="0" onFocus={(e) => e.target.select()}
          onChange={(e) => { setVal(e.target.value); setErr(null); }}
          className="w-full h-11 px-16 text-center text-lg font-medium border border-slate-200 rounded-md tabular-nums" />
        {u && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 max-w-[4.5rem] truncate text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-0.5">{u}</span>}
      </div>
      {plan.length > 0 && (
        <label className="mt-3 flex items-start gap-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md px-2.5 py-2">
          <input type="checkbox" checked={useIt} onChange={(e) => setUseIt(e.target.checked)} className="mt-0.5 rounded border-emerald-300" />
          <span className="min-w-0">
            แบ่งของให้ใบที่ใกล้กำหนดก่อน <b>{plan.length} ใบ รวม {fmt(used)} {u}</b>
            {short > 0.0001 ? ` · ยังขาด ${fmt(short)} ${u} (ต้องซื้อเพิ่ม)` : " · พอทุกใบ"}
            <span className="block mt-1 text-[11px] text-emerald-700">
              {plan.map((p) => `${p.mo_no.replace(/^MO-\d{4}-/, "")} ${fmt(p.qty)}${p.full ? " ✓" : " (บางส่วน)"}`).join(" · ")}
            </span>
          </span>
        </label>
      )}
      {counted != null && avail === 0 && r.remaining > 0 && <div className="mt-2 text-[11px] text-amber-700">ของที่นับได้ไม่เหลือให้แบ่ง (จองให้ใบอื่นไว้แล้ว) — จะบันทึกแค่ยอดสต๊อก</div>}
      {err && <div className="mt-3 text-sm text-rose-600">{err}</div>}
    </ERPModal>
  );
}
