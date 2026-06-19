"use client";

/**
 * Payroll — ผังพนักงาน (Whiteboard) Phase 2
 * ลากการ์ดพนักงานข้ามแผนกแบบลื่น (pointer drag, การ์ดตามเมาส์)
 * ย้าย = พักไว้ในจอก่อน (ยังไม่ save) · ค่าแรงรวมต่อแผนกอัปเดตสด ๆ · กด "บันทึกการย้าย" ค่อย save ทีเดียว + เก็บประวัติ
 */
import { useEffect, useState, useCallback, useMemo, useRef, type PointerEvent as RPE } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { DeptHistory } from "@/app/api/payroll/board/history/route";

type Card = {
  id: string; employee_code: string; nickname: string; full_name: string;
  contract_type: string; contract_type_th: string; color: string; base_salary: number;
  is_supervisor: boolean; recurring_count: number; warning_count: number; photo_key: string | null;
};
type Section = { department_id: string; department_name: string; headcount: number; total_salary: number; employees: Card[] };
type Zone = { key: string; name: string; muted: boolean };
const NO_DEPT = "__none__";

const baht = (v: number) => `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 0 })}`;
const COLOR_CLS: Record<string, { border: string; chip: string; dot: string }> = {
  purple: { border: "border-l-purple-500", chip: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  orange: { border: "border-l-orange-500", chip: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  green:  { border: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  blue:   { border: "border-l-sky-500", chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  slate:  { border: "border-l-slate-300", chip: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};
const LEGEND = [
  { c: "purple", th: "ประจำ" }, { c: "orange", th: "ประจำ(นอกระบบ)" },
  { c: "green", th: "รายวัน" }, { c: "blue", th: "ช่างเหมา" },
];
const initials = (c: Card) => (c.nickname || c.full_name || c.employee_code).slice(0, 2);

export default function PayrollBoardPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneCards, setZoneCards] = useState<Record<string, Card[]>>({});   // สถานะที่พักไว้ (staged)
  const [origZone, setOrigZone] = useState<Record<string, string>>({});      // แผนกเดิมต่อพนักงาน
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Card | null>(null);

  // pointer drag
  const dragRef = useRef<{ card: Card; fromZone: string; sx: number; sy: number } | null>(null);
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<{ card: Card; x: number; y: number } | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch("/api/payroll/board").then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      const sections = (j.sections ?? []) as Section[];
      const noDept = (j.no_department ?? []) as Card[];
      const zs: Zone[] = [...sections.map((s) => ({ key: s.department_id, name: s.department_name, muted: false })), { key: NO_DEPT, name: "ยังไม่ระบุแผนก", muted: true }];
      const zc: Record<string, Card[]> = {}; const oz: Record<string, string> = {};
      for (const s of sections) { zc[s.department_id] = [...s.employees]; s.employees.forEach((c) => (oz[c.id] = s.department_id)); }
      zc[NO_DEPT] = [...noDept]; noDept.forEach((c) => (oz[c.id] = NO_DEPT));
      setZones(zs); setZoneCards(zc); setOrigZone(oz); setTotal(j.total_employees ?? 0);
    } catch { setErr("โหลดไม่ได้"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const match = (c: Card) => !q.trim() || `${c.employee_code} ${c.nickname} ${c.full_name}`.toLowerCase().includes(q.trim().toLowerCase());
  const zoneSalary = (key: string) => (zoneCards[key] ?? []).reduce((t, c) => t + c.base_salary, 0);

  // รายการย้ายที่ยังไม่ save (แผนกปัจจุบันต่างจากเดิม)
  const pending = useMemo(() => {
    const out: { employee_id: string; department_id: string | null }[] = [];
    for (const [key, cards] of Object.entries(zoneCards)) for (const c of cards) {
      if (origZone[c.id] !== undefined && origZone[c.id] !== key) out.push({ employee_id: c.id, department_id: key === NO_DEPT ? null : key });
    }
    return out;
  }, [zoneCards, origZone]);

  const moveCard = (id: string, from: string, to: string) => {
    if (from === to) return;
    setZoneCards((zc) => {
      const card = (zc[from] ?? []).find((c) => c.id === id); if (!card) return zc;
      return { ...zc, [from]: (zc[from] ?? []).filter((c) => c.id !== id), [to]: [...(zc[to] ?? []), card] };
    });
  };

  // ── pointer drag ──
  const onCardDown = (e: RPE, card: Card, fromZone: string) => {
    if (e.button !== 0) return;
    dragRef.current = { card, fromZone, sx: e.clientX, sy: e.clientY }; movedRef.current = false;
    setDrag({ card, x: e.clientX, y: e.clientY });
  };
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      if (Math.abs(e.clientX - d.sx) > 4 || Math.abs(e.clientY - d.sy) > 4) movedRef.current = true;
      setDrag((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur));
      const z = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-zone]")?.getAttribute("data-zone") ?? null;
      setOverZone(z);
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current; dragRef.current = null; setDrag(null); setOverZone(null);
      if (!d) return;
      if (movedRef.current) {
        const z = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-zone]")?.getAttribute("data-zone") ?? null;
        if (z && z !== d.fromZone) moveCard(d.card.id, d.fromZone, z);
      } else { setSel(d.card); }   // คลิก (ไม่ลาก) = เปิด drawer
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [dragging]);

  const save = async () => {
    if (pending.length === 0) return;
    setSaving(true); setErr(null);
    try {
      for (const m of pending) {
        const j = await apiFetch("/api/payroll/board/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) }).then((r) => r.json());
        if (j.error) throw new Error(j.error);
      }
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const GLASS = "border border-white/60 backdrop-blur-xl shadow-[0_8px_30px_rgba(2,6,23,0.07)]";
  const renderZone = (z: Zone, sticky: boolean) => {
    const cards = zoneCards[z.key] ?? [];
    const isOver = overZone === z.key && dragging;
    return (
      <div key={z.key} data-zone={z.key}
        className={`w-[280px] shrink-0 flex flex-col rounded-3xl transition ${GLASS} ${sticky ? "sticky left-0 z-20 bg-white/85" : "bg-white/55"} ${isOver ? "ring-2 ring-emerald-300 border-emerald-300/70" : ""}`}>
        <div className="p-4 pb-2 shrink-0">
          <div className="flex items-baseline gap-1">
            <h2 className="font-semibold text-slate-800 truncate">{z.name}</h2>
            {sticky && <span className="text-[10px] text-slate-400" title="ปักไว้ซ้าย">📌</span>}
            <span className="text-sm font-normal text-slate-400 shrink-0">· {cards.length} คน</span>
          </div>
          <div className="text-[13px] text-slate-500">ฐานเงินเดือนรวม <b className="text-slate-700 tabular-nums">{baht(zoneSalary(z.key))}</b></div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          <div className="flex flex-wrap gap-2.5">
            {cards.filter(match).map((c) => <EmployeeCard key={c.id} c={c} onDown={(e) => onCardDown(e, c, z.key)} dragging={drag?.card.id === c.id} />)}
            {cards.length === 0 && <span className="text-xs text-slate-300">ลากการ์ดมาวางที่นี่</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative p-6 max-w-[1500px] mx-auto select-none">
      {/* พื้นหลังไล่สี + ก้อนเบลอ ให้กล่องกระจกดูมีมิติ (liquid glass) */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-[2rem]">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-100/70 via-violet-100/50 to-emerald-100/50" />
        <div className="absolute -top-10 left-10 w-80 h-80 rounded-full bg-sky-300/40 blur-3xl" />
        <div className="absolute top-32 right-10 w-72 h-72 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-96 h-72 rounded-full bg-emerald-200/40 blur-3xl" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🗂️ ผังพนักงาน (บอร์ด)</h1>
          <p className="text-sm text-slate-500">ลากการ์ดข้ามแผนกได้เลย · ค่าแรงรวมอัปเดตสด ๆ · <span className="text-amber-600">กด “บันทึกการย้าย” เพื่อบันทึกทีเดียว</span></p>
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา รหัส/ชื่อ" className="h-9 px-3 border border-slate-300 rounded-lg text-sm w-44" />
          {pending.length > 0 && <button onClick={() => void load()} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">↺ ยกเลิก</button>}
          <button onClick={() => void save()} disabled={pending.length === 0 || saving} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : `💾 บันทึกการย้าย${pending.length ? ` (${pending.length})` : ""}`}</button>
          <Link href="/payroll/employees" className="h-9 px-3 inline-flex items-center text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">📋 ตาราง</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        {LEGEND.map((l) => (<span key={l.c} className="inline-flex items-center gap-1.5 text-slate-600"><span className={`w-3 h-3 rounded ${COLOR_CLS[l.c].dot}`} /> {l.th}</span>))}
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">⭐ หัวหน้า · 🔁 รายการประจำ · ⚠️ ใบเตือน</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">พนักงาน {total} คน</span>
        {pending.length > 0 && <span className="text-amber-600 font-medium">· ✋ ค้างย้าย {pending.length} คน (ยังไม่บันทึก)</span>}
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">{err}</div>}
      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex items-stretch gap-4 w-max h-[calc(100vh-240px)] min-h-[440px]">
            {zones.filter((z) => z.key === NO_DEPT).map((z) => renderZone(z, true))}
            {zones.filter((z) => z.key !== NO_DEPT).map((z) => renderZone(z, false))}
          </div>
        </div>
      )}

      {/* การ์ดที่กำลังลาก (ลอยตามเมาส์) */}
      {drag && (
        <div className="fixed z-[60] pointer-events-none -translate-x-1/2 -translate-y-1/2 rotate-2 opacity-90" style={{ left: drag.x, top: drag.y }}>
          <div className={`w-[150px] rounded-xl border border-slate-200 border-l-4 ${(COLOR_CLS[drag.card.color] ?? COLOR_CLS.slate).border} bg-white p-2.5 shadow-xl`}>
            <div className="flex items-center gap-2">
              <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${(COLOR_CLS[drag.card.color] ?? COLOR_CLS.slate).chip} shrink-0`}>{initials(drag.card)}</span>
              <div className="min-w-0"><div className="font-semibold text-sm text-slate-800 truncate">{drag.card.nickname}</div><div className="text-[11px] text-slate-400 truncate">{drag.card.full_name || drag.card.employee_code}</div></div>
            </div>
          </div>
        </div>
      )}

      {sel && <CardDrawer c={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function EmployeeCard({ c, onDown, dragging }: { c: Card; onDown: (e: RPE) => void; dragging?: boolean }) {
  const col = COLOR_CLS[c.color] ?? COLOR_CLS.slate;
  return (
    <div onPointerDown={onDown}
      style={{ touchAction: "none" }}
      className={`group relative w-[150px] text-left rounded-xl border border-white/70 border-l-4 ${col.border} bg-white/85 backdrop-blur-sm p-2.5 shadow-sm hover:shadow-md transition cursor-grab active:cursor-grabbing ${dragging ? "opacity-30" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${col.chip} shrink-0`}>{initials(c)}</span>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-slate-800 truncate">{c.nickname}</div>
          <div className="text-[11px] text-slate-400 truncate">{c.full_name || c.employee_code}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {c.is_supervisor && <span title="หัวหน้า">⭐</span>}
        {c.recurring_count > 0 && <span className="inline-flex items-center text-[10px] text-emerald-600" title="รายการประจำ">🔁{c.recurring_count}</span>}
        {c.warning_count > 0 && <span className="inline-flex items-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5" title="ใบเตือน">⚠️{c.warning_count}</span>}
      </div>
    </div>
  );
}

function CardDrawer({ c, onClose }: { c: Card; onClose: () => void }) {
  const col = COLOR_CLS[c.color] ?? COLOR_CLS.slate;
  const [hist, setHist] = useState<DeptHistory[]>([]);
  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/payroll/board/history?employee_id=${c.id}`).then((r) => r.json()).then((j) => { if (!cancel) setHist(j.data ?? []); }).catch(() => {});
    return () => { cancel = true; };
  }, [c.id]);
  const dts = (s: string) => { try { return new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } };
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-sm bg-white h-full shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${col.chip}`}>{initials(c)}</span>
            <div><div className="font-semibold text-slate-800">{c.nickname}</div><div className="text-xs text-slate-400">{c.full_name} · {c.employee_code}</div></div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <Info label="ประเภทสัญญา" value={<span className={`px-2 py-0.5 rounded-full text-xs ${col.chip}`}>{c.contract_type_th}</span>} />
          <Info label="ฐานเงินเดือน" value={<b className="tabular-nums">{baht(c.base_salary)}</b>} />
          <Info label="หัวหน้า" value={c.is_supervisor ? "⭐ ใช่" : "—"} />
          <Info label="รายการประจำ" value={`${c.recurring_count} รายการ`} />
          <Info label="ใบเตือน (active)" value={c.warning_count > 0 ? <span className="text-red-600 font-medium">⚠️ {c.warning_count} ใบ</span> : "—"} />
          {hist.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-xs font-medium text-slate-500 mb-1.5">🔀 ประวัติย้ายแผนก</div>
              <div className="space-y-1">
                {hist.map((h) => (
                  <div key={h.id} className="text-[12px] flex items-center justify-between gap-2">
                    <span className="text-slate-600">{h.from_department_name ?? "ไม่ระบุ"} → <b className="text-slate-800">{h.to_department_name ?? "ไม่ระบุ"}</b></span>
                    <span className="text-slate-400 whitespace-nowrap">{dts(h.moved_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="pt-3 flex gap-2">
            <Link href="/payroll/employees" className="flex-1 h-10 inline-flex items-center justify-center text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800">📋 แก้ในตาราง</Link>
            <Link href="/payroll/warnings" className="flex-1 h-10 inline-flex items-center justify-center text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">⚠️ ใบเตือน</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{label}</span><span className="text-slate-700">{value}</span></div>;
}
