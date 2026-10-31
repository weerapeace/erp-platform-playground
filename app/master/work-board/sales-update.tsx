"use client";

/**
 * 🧾 อัปเดตงานจากใบขาย (เจ้าของขอ 2026-10-31: "ขึ้นรายการขายที่ยังไม่ลิงก์ใบงาน ให้จับคู่ได้ และอัปเดตสถานะ")
 *   กลับทางกับ "อัปเดตเป็นชุด" — เริ่มจากบรรทัดใบขายที่ยังไม่ผูกใบสั่งผลิต · ระบบเสนอใบให้ (กติกาเดียวกัน lib/mo-sales-match)
 *   ติ๊ก → ผูก (POST /api/mo/sales-match เดิม ใบละครั้ง) → เปิดหน้า "อัปเดตเป็นชุด" ของใบเหล่านั้น เพื่อไปขั้นส่งออก
 *     (ขั้นส่งออก/คำขอหัวหน้า/ขั้นก่อนหน้า ใช้ของเดิมทั้งหมด — หน้านี้ไม่อัปเดตสถานะเอง)
 *   ข้อมูล = GET /api/mo/sales-unlinked (lib/mo-sales-unlinked) · ไม่มีสิทธิ์ผูกตรง (โหมดส่งคำขอ) = เปิดอัปเดตเป็นชุดอย่างเดียว ผูกตอนหัวหน้ายืนยัน
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { MO_STAGE_LABEL, planLinks, type UnlinkedKind, type UnlinkedLine, type UnlinkedStats } from "@/lib/mo-sales-unlinked";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const thDate = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
};
const FILTERS: { v: "all" | UnlinkedKind; label: string }[] = [
  { v: "all", label: "ทั้งหมด" }, { v: "exact", label: "ตรงจำนวน" }, { v: "part", label: "ต้องเลือก / ไม่ครบ" }, { v: "none", label: "ไม่มีใบงาน (ของจากสต๊อก?)" },
];
const KIND_TAG: Record<UnlinkedKind, { label: string; cls: string }> = {
  exact: { label: "ตรงจำนวน", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  part: { label: "ต้องเลือก / ไม่ครบ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  none: { label: "ไม่มีใบงานเปิดอยู่", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};

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
  const [stats, setStats] = useState<UnlinkedStats | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"all" | UnlinkedKind>("all");
  const [pick, setPick] = useState<Map<string, string>>(new Map());   // บรรทัดใบขาย → ใบที่เลือก
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(""); setRows(null);
    try {
      const r = await apiFetch("/api/mo/sales-unlinked");
      const j = await r.json();
      if (!r.ok || !j?.data) throw new Error(j?.error || "โหลดไม่สำเร็จ");
      const list = j.data.rows as UnlinkedLine[];
      setRows(list); setStats(j.data.stats as UnlinkedStats);
      // ค่าเริ่ม: เลือกตามที่ระบบเสนอ (ใบแรก) · ติ๊กไว้เฉพาะที่ตรงจำนวน
      setPick(new Map(list.filter((x) => x.cands.length).map((x) => [x.id, x.suggest[0]?.mo_no ?? x.cands[0].mo_no])));
      setSel(new Set(list.filter((x) => x.kind === "exact").map((x) => x.id)));
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  // จัดกลุ่มตามใบขาย (ใหม่ก่อน) ตามตัวกรอง
  const bills = useMemo(() => {
    const out: { no: string; date: string; customer: string | null; lines: UnlinkedLine[] }[] = [];
    for (const r of rows ?? []) {
      if (filter !== "all" && r.kind !== filter) continue;
      const b = out.find((x) => x.no === r.so_number) ?? (out.push({ no: r.so_number, date: r.date, customer: r.customer, lines: [] }), out[out.length - 1]);
      b.lines.push(r);
    }
    return out;
  }, [rows, filter]);

  const chosen = (rows ?? []).filter((r) => sel.has(r.id) && pick.get(r.id));
  const plan = planLinks(chosen, pick);
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  /** ผูกตามที่เลือก (ใบละครั้ง) → เปิดหน้าอัปเดตเป็นชุด (ถ้า next) */
  const run = async (next: boolean) => {
    if (!plan.length) { toast.error("ยังไม่ได้เลือกบรรทัดที่มีใบงาน"); return; }
    if (!canLink) { onOpenBatch(plan.map((p) => p.mo_no)); onClose(); return; }
    setBusy(true);
    const ok: string[] = [], fail: string[] = [];
    for (const p of plan) {
      try {
        const r = await apiFetch("/api/mo/sales-match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
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
  return (
    <ERPModal open={open} onClose={() => { if (!busy) onClose(); }} size="xl" storageKey="wb-sales-update"
      title="อัปเดตงานจากใบขาย"
      description="บรรทัดใบขายที่ยังไม่ได้ผูกใบงาน — ระบบเสนอใบงานให้ (ใบเก่าได้ก่อน · ตรงจำนวนก่อน) ติ๊กแล้วผูก จากนั้นตั้งขั้นส่งออกในหน้าอัปเดตเป็นชุด"
      footer={
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
      }>
      {err ? <div className="py-10 text-center text-red-500">{err} <button type="button" onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>
        : !rows ? <div className="py-10 text-center text-slate-400">กำลังหาใบขายที่ยังไม่ผูกใบงาน…</div>
        : (
          <div className="space-y-3">
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
                <div className="flex flex-wrap items-baseline gap-2 bg-slate-50 px-3 py-2 text-sm">
                  <b className="text-slate-800">{b.no}</b><span className="text-slate-500">{thDate(b.date)}{b.customer ? ` · ${b.customer}` : ""}</span>
                </div>
                {b.lines.map((r) => {
                  const mo = pick.get(r.id), c = r.cands.find((x) => x.mo_no === mo), s = r.suggest.find((x) => x.mo_no === mo);
                  const tag = KIND_TAG[r.kind];
                  return (
                    <div key={r.id} className="grid grid-cols-[22px_44px_minmax(0,1fr)_minmax(0,1.5fr)] items-start gap-2.5 border-t border-slate-100 px-3 py-2 text-sm">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" disabled={!c} checked={sel.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={`เลือก ${r.sku}`} />
                      <HoverImage url={r.image_url} size={44} alt={r.sku} fallback="—" />
                      <div className="min-w-0">
                        <div className="font-mono font-semibold text-slate-800">{r.sku}</div>
                        {r.sku_name && <div className="truncate text-[12px] text-slate-500" title={r.sku_name}>{r.sku_name}</div>}
                        <div className="text-[12px] text-slate-600">ขาย {fmt(r.qty)} ชิ้น{r.left < r.qty ? ` · เหลือผูก ${fmt(r.left)}` : ""}</div>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className={`inline-block rounded border px-1.5 text-[11px] ${tag.cls}`}>{tag.label}</span>
                        {c ? (
                          <>
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <b className="font-mono text-slate-800">{c.mo_no}</b>
                              <span className="text-[12px] text-slate-500">ผลิต {fmt(c.qty)} · ตอนนี้ “{MO_STAGE_LABEL[c.stage]}” · เปิด {thDate(c.opened)}</span>
                            </div>
                            {s && !s.mo_full && <div className="text-[12px] text-amber-700">ใบงานนี้ได้ใบขายแค่ {fmt(s.qty)} จาก {fmt(s.mo_qty)} — ที่เหลือเลือกได้ในหน้าอัปเดตเป็นชุด (ปุ่ม “เลือกใบขาย…”)</div>}
                            {s && s.mo_full && s.qty < s.mo_qty && <div className="text-[12px] text-slate-500">รวมกับใบขายอื่นครบ {fmt(s.mo_qty)} ชิ้น</div>}
                            {r.cands.length > 1 && (
                              <select value={mo ?? ""} onChange={(e) => setPick((p) => new Map(p).set(r.id, e.target.value))}
                                className="h-8 max-w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]" aria-label="เลือกใบงานอื่น">
                                {r.cands.map((x) => <option key={x.mo_no} value={x.mo_no}>{x.mo_no} · ผลิต {fmt(x.qty)} · {MO_STAGE_LABEL[x.stage]}{r.suggest.some((y) => y.mo_no === x.mo_no) ? " · ระบบเสนอ" : ""}</option>)}
                              </select>
                            )}
                          </>
                        ) : <div className="text-[12px] text-slate-500">ขายจากสต๊อก หรือใบงานปิดไปแล้ว — ไม่ต้องผูก</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
    </ERPModal>
  );
}
