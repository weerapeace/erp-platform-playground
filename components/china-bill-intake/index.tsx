"use client";

/**
 * ChinaBillIntake (ของกลาง) — ออกใบสำคัญรับจาก "บิลโอนเงินจีน" (แอป China Pay) · เลือกได้หลายบิล (Mass)
 *   รายการบิลโอน (ยังไม่ออกใบ / ทั้งหมด · รอโอน / โอนแล้ว) → ติ๊กหลายบิล → หน้า "ตรวจก่อนสร้าง" → สร้างทีละบิล + แถบความคืบหน้า + ปุ่มเปิดแต่ละใบ
 *   แต่ละใบ: ร้าน/สกุล ¥/วันที่/เรท จากบิลโอน · รายการจากรูปบิล (AI) หรือ PO ที่ผูก · ไม่มีทั้งคู่ = ใบเปล่า (ถ้าติ๊ก)
 *   ★ 2026-11-04 เจ้าของขอ "ตอนกดสร้างอยากให้มีสรุปให้ดูก่อนยืนยัน" → หน้าตรวจก่อนสร้าง: บิลละจะได้อะไร · เตือนร้านที่ไม่มีใบค้าง (+ร้านชื่อคล้าย)
 *     · บิลที่จะถูกข้ามกด "สร้างเป็นใบเปล่าแทน" ได้รายบิล · กดสร้างแล้วเกิดอะไร 4 ข้อ — กติกา "จะได้อะไร" = lib/china-bill-voucher-plan (pure, เทสต์)
 * ใช้: <ChinaBillIntake onDone={() => …} onCount={(n) => …} />  · API /api/purchasing/seller-bills/china-bills · logic lib/china-bill-voucher.ts
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { billPlan, durationLabel, planSummary, type PlanKind } from "@/lib/china-bill-voucher-plan";

type Bill = {
  id: string; bill_date: string | null; supplier_id: string | null; shop: string | null; amount_rmb: number; rate: number | null;
  status: string; is_shipping: boolean; files: number; po_links: { po_id: string; po_no: string }[];
  voucher: { id: string; pv_no: string | null; status: string } | null;
  open_pos?: number; similar?: { id: string; name: string; open_pos: number } | null;
};
type Prog = { bill: Bill; state: "wait" | "run" | "ok" | "warn" | "skip" | "err"; text: string; voucher_id?: string };

const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const chip = "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap";
const C_OK = `${chip} bg-emerald-50 text-emerald-700 border-emerald-200`;
const C_WARN = `${chip} bg-amber-50 text-amber-700 border-amber-200`;
const C_NEU = `${chip} bg-slate-50 text-slate-600 border-slate-200`;
const C_ACC = `${chip} bg-blue-50 text-blue-700 border-blue-200`;
const isDupShop = (s: string | null) => /ซ้ำ/.test(s ?? "");
const KIND_CHIP: Record<PlanKind, string> = { ai: C_ACC, po: C_ACC, blank: C_NEU, skip: C_WARN, blocked: C_NEU };

export function ChinaBillIntake({ onDone, onCount }: { onDone: () => void | Promise<void>; onCount?: (n: number) => void }) {
  const toast = useToast();
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [st, setSt] = useState<"all" | "รอโอน" | "โอนแล้ว">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [blank, setBlank] = useState(false);
  const [blankIds, setBlankIds] = useState<Set<string>>(new Set());   // "สร้างเป็นใบเปล่าแทน" รายบิล (หน้าตรวจก่อนสร้าง)
  const [review, setReview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [prog, setProg] = useState<Prog[] | null>(null);
  const running = !!prog && prog.some((p) => p.state === "wait" || p.state === "run");

  const load = useCallback(async () => {
    try {
      const j = await apiFetch("/api/purchasing/seller-bills/china-bills").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const rows = (j.data ?? []) as Bill[];
      setBills(rows); setErr(null);
      onCount?.(rows.filter((b) => !b.voucher && !b.is_shipping && b.supplier_id).length);
    } catch (e) { setErr(String((e as Error).message ?? e)); setBills([]); }
  }, [onCount]);
  useEffect(() => { void load(); }, [load]);

  const usable = (b: Bill) => !b.voucher && !b.is_shipping && !!b.supplier_id;
  const list = useMemo(() => (bills ?? []).filter((b) => (showAll || !b.voucher) && (st === "all" || b.status === st)), [bills, showAll, st]);
  const toggle = (id: string) => { setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); setMsg(null); };
  const chosen = (bills ?? []).filter((b) => sel.has(b.id));
  const total = chosen.reduce((a, b) => a + b.amount_rmb, 0);
  const blankFor = useCallback((id: string) => blank || blankIds.has(id), [blank, blankIds]);
  const sum = useMemo(() => planSummary(chosen, blankFor), [chosen, blankFor]);
  const willGet = (b: Bill) => {
    if (b.voucher) return <span className={C_OK}>ออกแล้ว {b.voucher.pv_no ?? "(ร่าง)"}</span>;
    if (b.is_shipping) return <span className={C_NEU}>ผูกที่การ์ดค่าส่งในใบ</span>;
    if (!b.supplier_id) return <span className={C_WARN}>ยังไม่ผูกร้าน</span>;
    const p = billPlan(b, blankFor(b.id));
    const short = p.kind === "ai" ? "AI อ่านรูป" : p.kind === "po" ? `ใส่ ${b.po_links.length} PO ที่ผูก` : p.kind === "blank" ? "ใบเปล่า" : "ไม่มีรูป/PO";
    return <span className={p.warn ? C_WARN : KIND_CHIP[p.kind]} title={p.warn ?? p.label}>{short}{p.warn ? " ⚠" : ""}</span>;
  };

  const openReview = () => {
    if (chosen.length === 0) { setMsg("ติ๊กเลือกบิลอย่างน้อย 1 ใบ"); return; }
    setMsg(null); setReview(true);
  };

  // สร้างทีละบิล (AI อ่านรูปใช้เวลา) — โชว์ความคืบหน้ารายบิล · ล้มบางใบไม่หยุดใบอื่น · บิลที่ "ข้าม" ไม่ต้องยิง API
  const run = async () => {
    const items: Prog[] = chosen.map((b) => {
      const k = billPlan(b, blankFor(b.id)).kind;
      return k === "skip" || k === "blocked"
        ? { bill: b, state: "skip", text: `ข้าม — ${billPlan(b, blankFor(b.id)).label.replace(/^ข้าม — /, "")}` }
        : { bill: b, state: "wait", text: "รอคิว" };
    });
    setReview(false);
    setProg(items);
    const upd = (i: number, p: Partial<Prog>) => setProg((cur) => cur && cur.map((x, k) => (k === i ? { ...x, ...p } : x)));
    let made = 0;
    for (const [i, it] of items.entries()) {
      if (it.state === "skip") continue;
      upd(i, { state: "run", text: it.bill.files ? "กำลังอ่านรูปบิล + จับคู่…" : "กำลังสร้าง…" });
      try {
        const res = await apiFetch("/api/purchasing/seller-bills/china-bills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bill_id: it.bill.id, blank_if_none: blankFor(it.bill.id) }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
        const r = j.data as { status: string; reason?: string; voucher_id?: string; mode?: string; ok?: number; mid?: number; no?: number; po_lines?: number; total_warn?: string | null; warn?: string | null };
        if (r.status === "skipped") { upd(i, { state: "skip", text: `ข้าม — ${r.reason ?? ""}` }); continue; }
        made++;
        const base = r.mode === "ai" ? `ใบร่าง · มั่นใจ ${r.ok} · ให้เช็ก ${r.mid} · ไม่เจอ ${r.no}` : r.mode === "po" ? `ใบร่าง · ใส่ ${r.po_lines} บรรทัดจาก PO ที่ผูก` : "ใบเปล่า (อัปบิลทีหลังในหน้าใบ)";
        const w = [r.total_warn, r.warn].filter(Boolean).join(" · ");
        upd(i, { state: w ? "warn" : "ok", text: w ? `${base} · ${w}` : base, voucher_id: r.voucher_id });
      } catch (e) { upd(i, { state: "err", text: String((e as Error).message ?? e) }); }
    }
    setSel(new Set()); setBlankIds(new Set());
    if (made) toast.success(`สร้างใบสำคัญรับ ${made} ใบจากบิลโอนเงินจีน — กด "เปิด" เพื่อเช็กรายการทีละใบ`);
    await load();
    await onDone();
  };

  if (bills == null) return <div className="py-8 text-center text-xs text-slate-400">กำลังโหลดบิลโอนเงินจีน…</div>;

  // ── หน้า "ตรวจก่อนสร้าง" ──
  if (review) {
    const stat = (n: number, label: string, warn?: boolean) => (
      <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
        <div className={`text-lg font-semibold tabular-nums ${warn && n > 0 ? "text-amber-700" : "text-slate-800"}`}>{n}</div>
        <div className="text-[11px] text-slate-500">{label}</div>
      </div>
    );
    const step = (n: number, body: React.ReactNode) => (
      <li className="flex gap-2"><span className="w-5 h-5 shrink-0 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold flex items-center justify-center">{n}</span><span className="text-xs text-slate-600 leading-relaxed">{body}</span></li>
    );
    const time = durationLabel(sum.seconds);
    return (
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">ตรวจก่อนสร้าง</div>
          <div className="text-xs text-slate-500 mt-0.5">
            เลือก {chosen.length} บิล · รวม ¥{n2(sum.amount_all)} → ได้ใบสำคัญร่าง <b className="text-slate-800">{sum.make} ใบ</b>{sum.skip ? ` · ข้าม ${sum.skip} บิล` : ""}{time ? ` · ใช้เวลา${time}` : ""}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {stat(sum.ai, `AI อ่านรูป${sum.files ? ` (${sum.files} รูป)` : ""}`)}
          {stat(sum.po, "จาก PO ที่ผูก")}
          {stat(sum.blank, "ใบเปล่า")}
          {stat(sum.skip, "ข้าม", true)}
        </div>
        <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
          {chosen.map((b) => {
            const p = billPlan(b, blankFor(b.id));
            return (
              <div key={b.id} className={`rounded-lg border px-3 py-2 ${p.warn ? "border-amber-300 bg-amber-50/40" : p.kind === "skip" ? "border-slate-200 bg-slate-50 opacity-80" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 break-words">{b.shop ?? "—"}</div>
                    <div className="text-[11px] text-slate-400">{b.bill_date ? formatDate(b.bill_date) : "—"} · {b.status || "—"}{typeof b.open_pos === "number" && p.kind === "ai" && b.open_pos > 0 ? ` · ร้านนี้มีใบค้าง ${b.open_pos} ใบ` : ""}</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-slate-800 shrink-0">¥{n2(b.amount_rmb)}</div>
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className={KIND_CHIP[p.kind]}>{p.label}</span>
                  {p.kind === "skip" && !blank && (
                    <button type="button" onClick={() => setBlankIds((s) => new Set(s).add(b.id))} className="text-[11px] text-blue-600 hover:underline">สร้างเป็นใบเปล่าแทน</button>
                  )}
                  {p.kind === "blank" && !blank && blankIds.has(b.id) && (
                    <button type="button" onClick={() => setBlankIds((s) => { const n = new Set(s); n.delete(b.id); return n; })} className="text-[11px] text-slate-500 hover:underline">ไม่ต้อง (ข้าม)</button>
                  )}
                </div>
                {p.warn && <div className="mt-1 text-[11px] text-amber-800">⚠ {p.warn}</div>}
              </div>
            );
          })}
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <div className="text-xs font-semibold text-slate-700 mb-1.5">กดสร้างแล้วจะเกิดอะไร</div>
          <ol className="space-y-1.5">
            {step(1, <>ได้ใบสำคัญ <b>ร่าง</b> บิลละ 1 ใบ — ยังไม่ออกเลข ยังไม่แตะราคาและสต๊อก</>)}
            {step(2, <>ร้าน · สกุล ¥ · วันที่ · เรท ใช้ตามบิลโอน และผูกกับบิลนั้นไว้ (บิลเดียวออกใบซ้ำไม่ได้)</>)}
            {step(3, sum.ai ? <>AI อ่านรูปบิลแล้วจับคู่ใบสั่งซื้อของร้านนั้นให้ — ใช้เวลาประมาณบิลละครึ่งนาที (ห้ามปิดหน้าต่างระหว่างสร้าง)</> : <>ใส่รายการจากใบสั่งซื้อที่ผูกไว้ / ใบเปล่าให้ใส่รายการเองในหน้าใบ</>)}
            {step(4, <>ต่อไป: กด “เปิด” ทีละใบ เช็กรายการ แล้วกด “ยืนยัน + ออกเลข”</>)}
          </ol>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setReview(false)} className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 mr-auto">← ย้อนกลับไปแก้</button>
          <button type="button" onClick={() => void run()} disabled={sum.make === 0}
            className="h-10 px-5 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">
            {sum.make === 0 ? "ไม่มีใบที่สร้างได้" : `สร้างใบสำคัญ ${sum.make} ใบ`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {err && <div className="text-xs text-red-600">โหลดบิลไม่สำเร็จ: {err}</div>}
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <span className="text-slate-500">แสดง:</span>
        {[[false, "ยังไม่ออกใบ"], [true, "ทั้งหมด"]].map(([v, l]) => (
          <button key={String(v)} type="button" onClick={() => setShowAll(v as boolean)} className={`h-7 px-2 rounded-md border ${showAll === v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l as string}</button>
        ))}
        <span className="text-slate-400 ml-1">· สถานะโอน</span>
        {(["all", "รอโอน", "โอนแล้ว"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setSt(v)} className={`h-7 px-2 rounded-md border ${st === v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{v === "all" ? "ทั้งหมด" : v}</button>
        ))}
        <span className="flex-1" />
        <button type="button" disabled={running} onClick={() => setSel(new Set(list.filter((b) => usable(b) && (b.files || b.po_links.length)).map((b) => b.id)))} className="h-7 px-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">เลือกทั้งหมดที่มีรูปบิล / PO</button>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="hidden sm:grid grid-cols-[24px_74px_minmax(0,1fr)_84px_72px_110px_130px] gap-2 px-3 py-1.5 text-[11px] text-slate-400 bg-slate-50">
          <span /><span>วันที่บิล</span><span>ร้าน (จากบิลโอน)</span><span className="text-right">ยอด ¥</span><span>โอน</span><span>รูปบิล / PO</span><span>จะได้อะไร</span>
        </div>
        <div className="divide-y divide-slate-100 max-h-[45vh] overflow-y-auto">
          {list.map((b) => (
            <label key={b.id} className={`grid grid-cols-[24px_74px_minmax(0,1fr)_84px] sm:grid-cols-[24px_74px_minmax(0,1fr)_84px_72px_110px_130px] gap-2 px-3 py-2 text-xs items-center ${usable(b) ? "cursor-pointer hover:bg-slate-50" : "opacity-60"} ${sel.has(b.id) ? "bg-blue-50" : ""}`}>
              <input type="checkbox" checked={sel.has(b.id)} disabled={!usable(b) || running} onChange={() => toggle(b.id)} className="rounded border-slate-300" />
              <span className="text-slate-600">{b.bill_date ? formatDate(b.bill_date) : "—"}</span>
              {/* ชื่อร้านไม่ตัดเหลือ "ร้า…" แล้ว — ขึ้นได้ 2 บรรทัด (เจ้าของเจอในป๊อปแคบ) */}
              <span className="min-w-0 line-clamp-2 break-words leading-tight text-slate-800" title={b.shop ?? ""}>{b.is_shipping ? "ค่าส่ง (บิลค่าส่ง)" : b.shop ?? "— (ยังไม่ผูกร้าน)"}{isDupShop(b.shop) && <span className={`${C_WARN} ml-1`}>ร้านซ้ำ</span>}</span>
              <span className="text-right tabular-nums text-slate-800">{n2(b.amount_rmb)}</span>
              <span className="hidden sm:inline"><span className={b.status === "โอนแล้ว" ? C_OK : C_WARN}>{b.status || "—"}</span></span>
              <span className="hidden sm:inline text-[11px] text-slate-500">{b.files ? `${b.files} รูป` : "ไม่มีรูป"}{b.po_links.length ? ` · ${b.po_links.length} PO` : ""}</span>
              <span className="hidden sm:inline">{willGet(b)}</span>
            </label>
          ))}
          {list.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">ไม่มีบิลโอนที่ยังไม่ออกใบ{!showAll ? " — กด \"ทั้งหมด\" เพื่อดูบิลที่ออกแล้ว" : ""}</div>}
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={blank} disabled={running} onChange={(e) => setBlank(e.target.checked)} className="rounded border-slate-300" /> บิลที่ไม่มีรูปและไม่มี PO ผูก: สร้างใบเปล่าของร้านนั้นไว้ก่อน (อัปบิลทีหลังในหน้าใบ)</label>
      {msg && <div className="text-[11px] text-red-600">{msg}</div>}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500 mr-auto">{chosen.length ? `เลือก ${chosen.length} บิล · รวม ¥${n2(total)}` : "ติ๊กบิลที่จะออกใบ (เลือกหลายใบได้) · ร้าน/สกุล/วันที่/เรท ใช้ตามบิลโอน"}</span>
        <button type="button" onClick={openReview} disabled={running} className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {running ? "กำลังสร้าง…" : `สร้างใบสำคัญ ${chosen.length} ใบ →`}
        </button>
      </div>

      {prog && (
        <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 space-y-1">
          <div className="text-xs font-medium text-slate-700">{running ? "กำลังสร้าง" : "เสร็จแล้ว"} {prog.filter((p) => p.state !== "wait" && p.state !== "run").length}/{prog.length}</div>
          {prog.map((p) => (
            <div key={p.bill.id} className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="w-4 text-center">{p.state === "run" ? "⏳" : p.state === "wait" ? "·" : p.state === "ok" ? "✓" : p.state === "warn" ? "!" : p.state === "skip" ? "–" : "✕"}</span>
              <span className="text-slate-800">{p.bill.shop ?? "—"}</span>
              <span className="text-slate-400">¥{n2(p.bill.amount_rmb)}</span>
              <span className={p.state === "ok" ? C_OK : p.state === "warn" || p.state === "skip" ? C_WARN : p.state === "err" ? `${chip} bg-red-50 text-red-700 border-red-200` : C_NEU}>{p.text}</span>
              {p.voucher_id && <a href={`/purchasing/vouchers/${p.voucher_id}`} className="text-blue-600 hover:underline">เปิด</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
