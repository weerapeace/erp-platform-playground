"use client";

/**
 * 🧾 อัปเดตงานจากใบขาย (เจ้าของขอ 2026-10-31: "ขึ้นรายการขายที่ยังไม่ลิงก์ใบงาน ให้จับคู่ได้ และอัปเดตสถานะ")
 *   กลับทางกับ "อัปเดตเป็นชุด" — เริ่มจากบรรทัดใบขายที่ยังไม่ผูกใบสั่งผลิต · ระบบเสนอใบให้ (กติกาเดียวกัน lib/mo-sales-match)
 *   ติ๊ก → ผูก (POST /api/mo/sales-match เดิม ใบละครั้ง) → เปิดหน้า "อัปเดตเป็นชุด" ของใบเหล่านั้น เพื่อไปขั้นส่งออก
 *     (ขั้นส่งออก/คำขอหัวหน้า/ขั้นก่อนหน้า ใช้ของเดิมทั้งหมด — หน้านี้ไม่อัปเดตสถานะเอง)
 *   ข้อมูล = GET /api/mo/sales-unlinked (lib/mo-sales-unlinked) · ไม่มีสิทธิ์ผูกตรง (โหมดส่งคำขอ) = เปิดอัปเดตเป็นชุดอย่างเดียว ผูกตอนหัวหน้ายืนยัน
 *   2026-11-01: ตัวเลือกใบงานโชว์วันที่เปิดใบ + ใบที่ผูกใบขายอื่นแล้ว (ป้าย "ผูกแล้ว" · เลือกได้ = ถอดของเดิมก่อน)
 *     + แท็บ "ผูกแล้ว" → ผูกผิด · ย้าย (./sales-move.tsx)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { HoverImage } from "@/components/hover-image";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { bkkDate } from "@/lib/mo-sales-match";
import { defaultPick, planLinks, type LinkedLine, type UnlinkedKind, type UnlinkedLine, type UnlinkedStats } from "@/lib/mo-sales-unlinked";
import { MoPick, SalesMove, StageTag, thDate } from "./sales-move";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const FILTERS: { v: "all" | UnlinkedKind; label: string }[] = [
  { v: "all", label: "ทั้งหมด" }, { v: "exact", label: "ตรงจำนวน" }, { v: "part", label: "ต้องเลือก / ไม่ครบ" }, { v: "none", label: "ไม่มีใบงาน (ของจากสต๊อก?)" },
];
const KIND_TAG: Record<UnlinkedKind, { label: string; cls: string }> = {
  exact: { label: "ตรงจำนวน", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  part: { label: "ต้องเลือก / ไม่ครบ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  none: { label: "ไม่มีใบงานเปิดอยู่", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};
const linkedText = (l: { so_number: string; qty: number }[]) => l.map((x) => `${x.so_number} (${fmt(x.qty)})`).join(", ");

/** จัดกลุ่มตามใบขาย (ใหม่ก่อน — รายการเรียงมาแล้ว) */
function byBill<T extends { so_number: string; date: string; customer: string | null }>(list: T[]) {
  const out: { no: string; date: string; customer: string | null; lines: T[] }[] = [];
  for (const r of list) {
    const b = out.find((x) => x.no === r.so_number) ?? (out.push({ no: r.so_number, date: r.date, customer: r.customer, lines: [] }), out[out.length - 1]);
    b.lines.push(r);
  }
  return out;
}

export function SalesUpdate({ open, onClose, canLink, onOpenBatch }: {
  open: boolean;
  onClose: () => void;
  /** ผูกตรงได้ (บันทึกเลย / หัวหน้า) — false = ส่งต่อไปหน้าอัปเดตเป็นชุดอย่างเดียว */
  canLink: boolean;
  /** เปิดหน้า "อัปเดตเป็นชุด" ของใบเหล่านี้ (ไปขั้นส่งออก) */
  onOpenBatch: (moNos: string[]) => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<UnlinkedLine[] | null>(null);
  const [linked, setLinked] = useState<LinkedLine[]>([]);
  const [stats, setStats] = useState<UnlinkedStats | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"open" | "linked">("open");
  const [filter, setFilter] = useState<"all" | UnlinkedKind>("all");
  const [pick, setPick] = useState<Map<string, string>>(new Map());   // บรรทัดใบขาย → ใบที่เลือก
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<LinkedLine | null>(null);

  const load = useCallback(async () => {
    setErr(""); setRows(null);
    try {
      const r = await apiFetch("/api/mo/sales-unlinked");
      const j = await r.json();
      if (!r.ok || !j?.data) throw new Error(j?.error || "โหลดไม่สำเร็จ");
      const list = j.data.rows as UnlinkedLine[];
      setRows(list); setLinked((j.data.linked ?? []) as LinkedLine[]); setStats(j.data.stats as UnlinkedStats);
      // ค่าเริ่ม: เลือกตามที่ระบบเสนอ (ใบแรก) ไม่งั้นใบว่างใบแรก · ติ๊กไว้เฉพาะที่ตรงจำนวน และไม่เคยถูกถอดผูก
      setPick(new Map(list.flatMap((x) => { const d = defaultPick(x); return d ? [[x.id, d] as [string, string]] : []; })));
      setSel(new Set(list.filter((x) => x.kind === "exact" && !x.unlinked?.length).map((x) => x.id)));
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const bills = useMemo(() => byBill((rows ?? []).filter((r) => filter === "all" || r.kind === filter)), [rows, filter]);
  const linkedBills = useMemo(() => byBill(linked), [linked]);

  const chosen = (rows ?? []).filter((r) => sel.has(r.id) && pick.get(r.id));
  const plan = planLinks(chosen, pick);
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  /** ผูกตามที่เลือก (ใบละครั้ง) → เปิดหน้าอัปเดตเป็นชุด (ถ้า next) · ใบที่ผูกใบขายอื่นอยู่ = ถามก่อน แล้วถอดของเดิมออก */
  const run = async (next: boolean) => {
    if (!plan.length) { toast.error("ยังไม่ได้เลือกบรรทัดที่มีใบงาน"); return; }
    if (!canLink) { onOpenBatch(plan.map((p) => p.mo_no)); onClose(); return; }
    const re = plan.filter((p) => p.relink?.length);
    if (re.length && !(await askConfirm({ title: `ถอดใบขายเดิมออกจาก ${re.length} ใบงาน?`, confirmText: "ถอดแล้วผูกใหม่",
      message: <div className="space-y-1 text-sm"><div>ใบงานเหล่านี้ผูกใบขายอื่นอยู่ — ใบขายเดิมจะกลับเป็น “ยังไม่ผูก” (สถานะใบงานไม่เปลี่ยน):</div>{re.map((p) => <div key={p.mo_no} className="text-slate-600"><b className="font-mono">{p.mo_no}</b> · {linkedText(p.relink ?? [])}</div>)}</div> }))) return;
    setBusy(true);
    const ok: string[] = [], fail: string[] = [];
    for (const p of plan) {
      try {
        if (p.relink?.length) {
          const d = await apiFetch(`/api/mo/sales-match?mo_no=${encodeURIComponent(p.mo_no)}`, { method: "DELETE" });
          if (!d.ok) throw new Error("ถอดใบขายเดิมไม่สำเร็จ");
        }
        const r = await apiFetch("/api/mo/sales-match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mo_no: p.mo_no, parts: p.parts }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.error) throw new Error(j?.error || "ผูกไม่สำเร็จ");
        ok.push(p.mo_no);
      } catch (e) { fail.push(`${p.mo_no}: ${e instanceof Error ? e.message : "ผูกไม่สำเร็จ"}`); }
    }
    setBusy(false);
    if (fail.length) toast.error(`ผูกไม่ได้ ${fail.length} ใบ — ${fail.slice(0, 3).join(" · ")}`);
    if (ok.length) toast.success(`ผูกใบขายแล้ว ${ok.length} ใบงาน${next ? " — ต่อด้วยตั้งขั้นส่งออก" : ""}`);
    if (next && ok.length) { onOpenBatch(ok); onClose(); }
    else void load();
  };

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm disabled:opacity-50";
  const tabBtn = (on: boolean) => `h-9 rounded-lg border px-3 text-sm ${on ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const billHead = (b: { no: string; date: string; customer: string | null }) => (
    <div className="flex flex-wrap items-baseline gap-2 bg-slate-50 px-3 py-2 text-sm">
      <b className="text-slate-800">{b.no}</b><span className="text-slate-500">{thDate(b.date)}{b.customer ? ` · ${b.customer}` : ""}</span>
    </div>
  );
  const product = (r: { sku: string; sku_name?: string | null; image_url?: string | null; qty: number }, extra?: string) => (
    <>
      <HoverImage url={r.image_url} size={44} alt={r.sku} fallback="—" />
      <div className="min-w-0">
        <div className="font-mono font-semibold text-slate-800">{r.sku}</div>
        {r.sku_name && <div className="truncate text-[12px] text-slate-500" title={r.sku_name}>{r.sku_name}</div>}
        <div className="text-[12px] text-slate-600">ขาย {fmt(r.qty)} ชิ้น{extra ?? ""}</div>
      </div>
    </>
  );
  return (
    <>
    <ERPModal open={open} onClose={() => { if (!busy && !moving) onClose(); }} size="xl" storageKey="wb-sales-update"
      title="อัปเดตงานจากใบขาย"
      description={tab === "open"
        ? "บรรทัดใบขายที่ยังไม่ได้ผูกใบงาน — ระบบเสนอใบงานให้ (ใบเก่าได้ก่อน · ตรงจำนวนก่อน) ติ๊กแล้วผูก จากนั้นตั้งขั้นส่งออกในหน้าอัปเดตเป็นชุด"
        : "บรรทัดใบขายที่ผูกใบงานแล้ว — ผูกผิดกด “ผูกผิด · ย้าย” เพื่อย้ายไปใบที่ถูก และย้อนสถานะใบเดิม"}
      footer={tab === "open" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">เลือก {chosen.length} บรรทัด · {plan.length} ใบงาน</span>
          {!canLink && <span className="text-[12px] text-amber-700">โหมดส่งคำขอ — ผูกจริงตอนหัวหน้ายืนยัน</span>}
          <div className="flex-1" />
          {canLink && <button type="button" disabled={busy || !plan.length} onClick={() => void run(false)} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>ผูกอย่างเดียว</button>}
          <button type="button" disabled={busy || !plan.length} onClick={() => void run(true)}
            className={`${btn} border-emerald-600 bg-emerald-600 font-medium text-white hover:bg-emerald-700`}>
            <Icon name="refresh" /> {busy ? "กำลังผูก…" : canLink ? "ผูก + ไปขั้นส่งออก" : "ไปอัปเดตเป็นชุด"}
          </button>
        </div>
      ) : undefined}>
      {err ? <div className="py-10 text-center text-red-500">{err} <button type="button" onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>
        : !rows ? <div className="py-10 text-center text-slate-400">กำลังหาใบขายที่ยังไม่ผูกใบงาน…</div>
        : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setTab("open")} className={tabBtn(tab === "open")}>ยังไม่ผูก {fmt(rows.length)}</button>
              <button type="button" onClick={() => setTab("linked")} className={tabBtn(tab === "linked")}><Icon name="link" /> ผูกแล้ว {fmt(linked.length)}</button>
            </div>
            {tab === "open" ? (
              <>
                {stats && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["บรรทัดขายยังไม่ผูกใบงาน", `${fmt(stats.lines)}`, `${fmt(stats.bills)} ใบขาย`],
                      ["ตรงจำนวน (ติ๊กไว้ให้แล้ว)", `${fmt(stats.exact)}`, "บรรทัด"],
                      ["ต้องเลือก / ไม่ครบ", `${fmt(stats.part)}`, "บรรทัด"],
                      ["ใบงานที่ยังขึ้น “รอจ่าย”", `${fmt(stats.mos_waiting)}`, "ทั้งที่ขายส่งไปแล้ว"],
                    ].map(([a, b, c]) => (
                      <div key={a} className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[12px] text-slate-500">{a}</div><div className="text-xl font-semibold text-slate-800">{b}</div><div className="text-[11px] text-slate-400">{c}</div></div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-slate-500">แสดง</span>
                  {FILTERS.map((f) => (
                    <button key={f.v} type="button" onClick={() => setFilter(f.v)}
                      className={`h-8 rounded-lg border px-2.5 text-sm ${filter === f.v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
                  ))}
                </div>
                {!bills.length && <div className="py-8 text-center text-slate-400">ไม่มีรายการในตัวกรองนี้</div>}
                {bills.map((b) => (
                  <div key={b.no} className="overflow-hidden rounded-xl border border-slate-200">
                    {billHead(b)}
                    {b.lines.map((r) => {
                      const mo = pick.get(r.id) ?? null, c = r.cands.find((x) => x.mo_no === mo), s = r.suggest.find((x) => x.mo_no === mo);
                      const tag = KIND_TAG[r.kind];
                      return (
                        <div key={r.id} className="grid grid-cols-[22px_44px_minmax(0,1fr)_minmax(0,1.5fr)] items-start gap-2.5 border-t border-slate-100 px-3 py-2 text-sm">
                          <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" disabled={!c} checked={sel.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={`เลือก ${r.sku}`} />
                          {product(r, r.left < r.qty ? ` · เหลือผูก ${fmt(r.left)}` : "")}
                          <div className="min-w-0 space-y-1">
                            <span className={`inline-block rounded border px-1.5 text-[11px] ${tag.cls}`}>{tag.label}</span>
                            {r.unlinked?.length ? <div className="text-[12px] text-amber-700">เคยถอดผูกจาก {r.unlinked.map((u) => `${u.mo_no}${u.at ? ` (${thDate(bkkDate(u.at))})` : ""}`).join(", ")} — ไม่ได้ติ๊กให้ ถ้าขายจากสต๊อกไม่ต้องผูก</div> : null}
                            {c ? (
                              <>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <b className="font-mono text-slate-800">{c.mo_no}</b>
                                  <span className="text-[12px] text-slate-500">ผลิต {fmt(c.qty)} · เปิด {thDate(c.opened)}</span>
                                  <StageTag stage={c.stage} />
                                </div>
                                {c.linked && <div className="text-[12px] text-amber-700">ใบนี้ผูก {linkedText(c.linked)} อยู่ — ผูกแล้วใบขายนั้นจะกลับเป็น “ยังไม่ผูก”</div>}
                                {s && !s.mo_full && <div className="text-[12px] text-amber-700">ใบงานนี้ได้ใบขายแค่ {fmt(s.qty)} จาก {fmt(s.mo_qty)} — ที่เหลือเลือกได้ในหน้าอัปเดตเป็นชุด (ปุ่ม “เลือกใบขาย…”)</div>}
                                {s && s.mo_full && s.qty < s.mo_qty && <div className="text-[12px] text-slate-500">รวมกับใบขายอื่นครบ {fmt(s.mo_qty)} ชิ้น</div>}
                              </>
                            ) : r.cands.length
                              ? <div className="text-[12px] text-slate-500">ใบงานของสินค้านี้ผูกใบขายอื่นหมดแล้ว — เลือกย้ายมาผูกใบขายนี้ได้</div>
                              : <div className="text-[12px] text-slate-500">ขายจากสต๊อก หรือใบงานปิดไปแล้ว — ไม่ต้องผูก</div>}
                            {r.cands.length > (c ? 1 : 0) && (
                              <MoPick cands={r.cands} value={mo} suggested={r.suggest.map((x) => x.mo_no)}
                                onChange={(v) => { setPick((p) => new Map(p).set(r.id, v)); toggle(r.id, true); }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            ) : (
              <>
                {!linkedBills.length && <div className="py-8 text-center text-slate-400">ยังไม่มีบรรทัดใบขายที่ผูกใบงาน</div>}
                {linkedBills.map((b) => (
                  <div key={b.no} className="overflow-hidden rounded-xl border border-slate-200">
                    {billHead(b)}
                    {b.lines.map((r) => (
                      <div key={r.link_id} className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1.5fr)] items-start gap-2.5 border-t border-slate-100 px-3 py-2 text-sm">
                        {product(r, r.link_qty < r.qty ? ` · ผูก ${fmt(r.link_qty)}` : "")}
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-[12px] text-slate-500">ผูกกับ</span><b className="font-mono text-slate-800">{r.mo_no}</b>
                              <span className="text-[12px] text-slate-500">ผลิต {fmt(r.mo_qty)} · เปิด {thDate(r.opened)}</span>
                              <StageTag stage={r.stage} />
                            </div>
                            {r.others.length > 0 && <div className="text-[12px] text-slate-500">ใบนี้ผูก {linkedText(r.others)} ด้วย</div>}
                          </div>
                          {canLink
                            ? <button type="button" onClick={() => setMoving(r)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[12px] text-red-700 hover:bg-red-50"><Icon name="shuffle" /> ผูกผิด · ย้าย</button>
                            : <span className="text-[11px] text-slate-400">ย้ายได้เฉพาะหัวหน้า</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
    </ERPModal>
    {moving && <SalesMove row={moving} onClose={() => setMoving(null)}
      onDone={(mo) => { setMoving(null); if (mo) { onOpenBatch([mo]); onClose(); } else void load(); }} />}
    </>
  );
}
