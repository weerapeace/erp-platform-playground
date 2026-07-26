"use client";

/**
 * Payroll — ผังพนักงาน (Whiteboard)
 * ลากการ์ดพนักงานข้ามแผนกแบบลื่น (pointer drag, การ์ดตามเมาส์)
 * ย้าย = พักไว้ในจอก่อน (ยังไม่ save) · ค่าแรงรวมต่อแผนกอัปเดตสด ๆ · กด "บันทึกการย้าย" ค่อย save ทีเดียว + เก็บประวัติ
 *
 * ของใหม่รอบนี้:
 *   · การ์ดโชว์รูปจริง (profile_photo_key → /api/r2-image ย่อขนาด)
 *   · สีการ์ดตั้งค่าได้เอง + เลือกได้ว่าจะระบายสีตามอะไร (สัญญา/สถานะ/แผนก/ตำแหน่ง) — เก็บส่วนกลางที่ ui_config
 *   · drawer มีแท็บ รายการประจำ / ใบเตือน / สัญญา ที่ "เพิ่ม-แก้-ลบ" ได้ (ของกลาง EmployeeRecordsPanel)
 *   · ตั้งหัวหน้าประจำแผนก (⭐) และเลือกหัวหน้าของแต่ละคนได้จาก drawer
 */
import { useEffect, useState, useCallback, useMemo, useRef, type PointerEvent as RPE } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { DeptHistory } from "@/app/api/payroll/board/history/route";
import { EmployeeRecordsPanel } from "@/components/payroll/employee-records-panel";
import { ColorInput } from "@/components/color-picker";

type Card = {
  id: string; employee_code: string; nickname: string; full_name: string;
  contract_type: string; contract_type_th: string;
  employment_status: string; department_id: string; position_id: string; position_name: string;
  base_salary: number;
  is_supervisor: boolean; head_of_department: string | null;
  supervisor_id: string | null; supervisor_name: string;
  recurring_count: number; warning_count: number; photo_key: string | null;
};
type Section = { department_id: string; department_name: string; manager_employee_id: string | null; manager_name: string; headcount: number; total_salary: number; employees: Card[] };
type Zone = { key: string; name: string; muted: boolean; manager_employee_id: string | null };
type BoardConfig = { color_by: string; colors: Record<string, string>; show_photo: boolean };

const NO_DEPT = "__none__";
const FALLBACK_COLOR = "#cbd5e1";
const baht = (v: number) => `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 0 })}`;
const initials = (c: Card) => (c.nickname || c.full_name || c.employee_code).slice(0, 2);

const COLOR_BY_OPTS = [
  { v: "contract_type", th: "ประเภทสัญญา" },
  { v: "employment_status", th: "สถานะการทำงาน" },
  { v: "department", th: "แผนก" },
  { v: "position", th: "ตำแหน่ง" },
];
const STATUS_TH: Record<string, string> = { active: "ทำงานอยู่", inactive: "ไม่ใช้งาน", resigned: "ลาออก", suspended: "พักงาน" };

/** ค่าที่ใช้จับคู่สี ของการ์ดใบนี้ ตามที่ตั้งค่าไว้ว่าระบายตามอะไร */
function categoryOf(c: Card, colorBy: string): { key: string; label: string } {
  if (colorBy === "employment_status") return { key: c.employment_status || "unknown", label: STATUS_TH[c.employment_status] ?? (c.employment_status || "ไม่ระบุ") };
  if (colorBy === "department") return { key: c.department_id || "none", label: "" };
  if (colorBy === "position") return { key: c.position_id || "none", label: c.position_name || "ไม่ระบุตำแหน่ง" };
  return { key: c.contract_type || "unknown", label: c.contract_type_th || "ไม่ระบุ" };
}

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
  const [cfg, setCfg] = useState<BoardConfig>({ color_by: "contract_type", colors: {}, show_photo: true });
  const [cfgOpen, setCfgOpen] = useState(false);

  // pointer drag
  const dragRef = useRef<{ card: Card; fromZone: string; sx: number; sy: number } | null>(null);
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<{ card: Card; x: number; y: number } | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      // ยิงขนาน: ข้อมูลบอร์ด + ค่าตั้งสี (config เบามาก ไม่ถ่วง)
      const [j, cj] = await Promise.all([
        apiFetch("/api/payroll/board").then((r) => r.json()),
        apiFetch("/api/payroll/board/config").then((r) => r.json()).catch(() => null),
      ]);
      if (j.error) { setErr(j.error); return; }
      if (cj?.config) setCfg(cj.config as BoardConfig);
      const sections = (j.sections ?? []) as Section[];
      const noDept = (j.no_department ?? []) as Card[];
      const zs: Zone[] = [
        ...sections.map((s) => ({ key: s.department_id, name: s.department_name, muted: false, manager_employee_id: s.manager_employee_id })),
        { key: NO_DEPT, name: "ยังไม่ระบุแผนก", muted: true, manager_employee_id: null },
      ];
      const zc: Record<string, Card[]> = {}; const oz: Record<string, string> = {};
      for (const s of sections) { zc[s.department_id] = [...s.employees]; s.employees.forEach((c) => (oz[c.id] = s.department_id)); }
      zc[NO_DEPT] = [...noDept]; noDept.forEach((c) => (oz[c.id] = NO_DEPT));
      setZones(zs); setZoneCards(zc); setOrigZone(oz); setTotal(j.total_employees ?? 0);
      // ถ้า drawer เปิดอยู่ ให้ข้อมูลในนั้นสดตามไปด้วย
      setSel((cur) => (cur ? (Object.values(zc).flat().find((c) => c.id === cur.id) ?? cur) : cur));
    } catch { setErr("โหลดไม่ได้"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const match = (c: Card) => !q.trim() || `${c.employee_code} ${c.nickname} ${c.full_name}`.toLowerCase().includes(q.trim().toLowerCase());
  const zoneSalary = (key: string) => (zoneCards[key] ?? []).reduce((t, c) => t + c.base_salary, 0);
  const colorOf = (c: Card) => cfg.colors[categoryOf(c, cfg.color_by).key] ?? FALLBACK_COLOR;

  // หมวดที่มีอยู่จริงบนบอร์ด (ไว้ทำคำอธิบายสี + หน้าตั้งค่า)
  const categories = useMemo(() => {
    const all = Object.values(zoneCards).flat();
    const m = new Map<string, string>();
    for (const c of all) {
      const { key, label } = categoryOf(c, cfg.color_by);
      const name = cfg.color_by === "department" ? (zones.find((z) => z.key === c.department_id)?.name ?? "ไม่ระบุแผนก") : label;
      if (!m.has(key)) m.set(key, name || "ไม่ระบุ");
    }
    return [...m.entries()].map(([key, label]) => ({ key, label }));
  }, [zoneCards, cfg.color_by, zones]);

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
    // หัวหน้าแผนกลอยขึ้นบนสุด
    const sorted = [...cards].sort((a, b) => Number(b.id === z.manager_employee_id) - Number(a.id === z.manager_employee_id));
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
          {z.manager_employee_id && (
            <div className="text-[12px] text-amber-600 truncate">⭐ หัวหน้า: {cards.find((c) => c.id === z.manager_employee_id)?.nickname ?? "—"}</div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          <div className="flex flex-wrap gap-2.5">
            {sorted.filter(match).map((c) => (
              <EmployeeCard key={c.id} c={c} color={colorOf(c)} showPhoto={cfg.show_photo}
                isDeptHead={c.id === z.manager_employee_id}
                onDown={(e) => onCardDown(e, c, z.key)} dragging={drag?.card.id === c.id} />
            ))}
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
          <button onClick={() => setCfgOpen(true)} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">🎨 ตั้งค่าสี</button>
          {pending.length > 0 && <button onClick={() => void load()} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">↺ ยกเลิก</button>}
          <button onClick={() => void save()} disabled={pending.length === 0 || saving} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : `💾 บันทึกการย้าย${pending.length ? ` (${pending.length})` : ""}`}</button>
          <Link href="/payroll/employees" className="h-9 px-3 inline-flex items-center text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">📋 ตาราง</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        <span className="text-slate-400">สีตาม{COLOR_BY_OPTS.find((o) => o.v === cfg.color_by)?.th}:</span>
        {categories.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="w-3 h-3 rounded" style={{ background: cfg.colors[c.key] ?? FALLBACK_COLOR }} /> {c.label}
          </span>
        ))}
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">⭐ หัวหน้าแผนก · 👥 มีลูกน้อง · 🔁 รายการประจำ · ⚠️ ใบเตือน</span>
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
          <div className="w-[150px] rounded-xl border border-slate-200 border-l-4 bg-white p-2.5 shadow-xl" style={{ borderLeftColor: colorOf(drag.card) }}>
            <div className="flex items-center gap-2">
              <Avatar c={drag.card} color={colorOf(drag.card)} showPhoto={cfg.show_photo} />
              <div className="min-w-0"><div className="font-semibold text-sm text-slate-800 truncate">{drag.card.nickname}</div><div className="text-[11px] text-slate-400 truncate">{drag.card.full_name || drag.card.employee_code}</div></div>
            </div>
          </div>
        </div>
      )}

      {sel && (
        <CardDrawer
          c={sel} color={colorOf(sel)} showPhoto={cfg.show_photo}
          zones={zones} allCards={Object.values(zoneCards).flat()}
          onClose={() => setSel(null)} onChanged={() => void load()}
        />
      )}

      {cfgOpen && (
        <ColorSettings cfg={cfg} categories={categories} onClose={() => setCfgOpen(false)}
          onSaved={(next) => { setCfg(next); setCfgOpen(false); }} />
      )}
    </div>
  );
}

function Avatar({ c, color, showPhoto, size = 36 }: { c: Card; color: string; showPhoto: boolean; size?: number }) {
  const src = showPhoto ? r2ImageUrl(c.photo_key, size * 2) : null;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={c.nickname} width={size} height={size} loading="lazy"
        className="rounded-full object-cover shrink-0 ring-2 ring-white" style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ width: size, height: size, background: `${color}22`, color }}>{initials(c)}</span>
  );
}

function EmployeeCard({ c, color, showPhoto, isDeptHead, onDown, dragging }: {
  c: Card; color: string; showPhoto: boolean; isDeptHead: boolean; onDown: (e: RPE) => void; dragging?: boolean;
}) {
  return (
    <div onPointerDown={onDown}
      style={{ touchAction: "none", borderLeftColor: color }}
      className={`group relative w-[150px] text-left rounded-xl border border-white/70 border-l-4 bg-white/85 backdrop-blur-sm p-2.5 shadow-sm hover:shadow-md transition cursor-grab active:cursor-grabbing ${dragging ? "opacity-30" : ""}`}>
      <div className="flex items-center gap-2">
        <Avatar c={c} color={color} showPhoto={showPhoto} />
        <div className="min-w-0">
          <div className="font-semibold text-sm text-slate-800 truncate">{c.nickname}</div>
          <div className="text-[11px] text-slate-400 truncate">{c.full_name || c.employee_code}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {isDeptHead ? <span title={`หัวหน้าแผนก${c.head_of_department ?? ""}`}>⭐</span> : c.is_supervisor && <span title="มีลูกน้อง">👥</span>}
        {c.recurring_count > 0 && <span className="inline-flex items-center text-[10px] text-emerald-600" title="รายการประจำ">🔁{c.recurring_count}</span>}
        {c.warning_count > 0 && <span className="inline-flex items-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5" title="ใบเตือน">⚠️{c.warning_count}</span>}
      </div>
    </div>
  );
}

// ── drawer: สรุป + แก้ไขของที่ผูกกับพนักงาน ──
function CardDrawer({ c, color, showPhoto, zones, allCards, onClose, onChanged }: {
  c: Card; color: string; showPhoto: boolean; zones: Zone[]; allCards: Card[];
  onClose: () => void; onChanged: () => void;
}) {
  const [tab, setTab] = useState<"summary" | "records">("summary");
  const [hist, setHist] = useState<DeptHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/payroll/board/history?employee_id=${c.id}`).then((r) => r.json()).then((j) => { if (!cancel) setHist(j.data ?? []); }).catch(() => {});
    return () => { cancel = true; };
  }, [c.id]);

  const dts = (s: string) => { try { return new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } };
  const dept = zones.find((z) => z.key === c.department_id) ?? null;
  const isDeptHead = dept?.manager_employee_id === c.id;

  /** ⭐ ตั้ง/ปลด หัวหน้าประจำแผนกที่คนนี้สังกัด */
  const toggleDeptHead = async () => {
    if (!dept || dept.key === NO_DEPT) { setErr("คนนี้ยังไม่มีแผนก — ลากเข้าแผนกก่อน"); return; }
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/master/departments/${dept.key}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manager_employee_id: isDeptHead ? "" : c.id }),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      onChanged();
    } catch { setErr("ตั้งหัวหน้าแผนกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  /** เลือกว่า "หัวหน้าของคนนี้" คือใคร */
  const setSupervisor = async (supervisorId: string) => {
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/core/employees/${c.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisor_id: supervisorId }),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      onChanged();
    } catch { setErr("บันทึกหัวหน้าไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar c={c} color={color} showPhoto={showPhoto} size={48} />
            <div className="min-w-0">
              <div className="font-semibold text-slate-800 truncate">{c.nickname}</div>
              <div className="text-xs text-slate-400 truncate">{c.full_name} · {c.employee_code}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">✕</button>
        </div>

        <div className="flex gap-1 px-4 py-2 border-b border-slate-100 shrink-0">
          {([["summary", "📊 สรุป"], ["records", "🗂️ รายการประจำ / ใบเตือน / สัญญา"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 h-8 rounded-full text-xs whitespace-nowrap transition ${tab === k ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>

        {err && <div className="mx-4 mt-3 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs shrink-0">{err}</div>}

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {tab === "summary" ? (
            <div className="space-y-3 text-sm">
              <Info label="ประเภทสัญญา" value={<span className="px-2 py-0.5 rounded-full text-xs" style={{ background: `${color}22`, color }}>{c.contract_type_th}</span>} />
              <Info label="ตำแหน่ง" value={c.position_name || "—"} />
              <Info label="ฐานเงินเดือน" value={<b className="tabular-nums">{baht(c.base_salary)}</b>} />
              <Info label="รายการประจำ" value={`${c.recurring_count} รายการ`} />
              <Info label="ใบเตือน (มีผล)" value={c.warning_count > 0 ? <span className="text-red-600 font-medium">⚠️ {c.warning_count} ใบ</span> : "—"} />

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-xs font-medium text-slate-500">⭐ หัวหน้า</div>
                <button onClick={() => void toggleDeptHead()} disabled={busy}
                  className={`w-full h-9 rounded-lg border text-sm disabled:opacity-50 ${isDeptHead ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                  {isDeptHead ? `⭐ เป็นหัวหน้าแผนก${dept?.name ?? ""} อยู่ (กดเพื่อปลด)` : `☆ ตั้งเป็นหัวหน้าแผนก${dept && dept.key !== NO_DEPT ? dept.name : ""}`}
                </button>
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-0.5">หัวหน้าของคนนี้</span>
                  <select value={c.supervisor_id ?? ""} disabled={busy}
                    onChange={(e) => void setSupervisor(e.target.value)}
                    className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm bg-white">
                    <option value="">— ไม่ระบุ —</option>
                    {allCards.filter((x) => x.id !== c.id).sort((a, b) => a.employee_code.localeCompare(b.employee_code)).map((x) => (
                      <option key={x.id} value={x.id}>{x.employee_code} · {x.nickname}</option>
                    ))}
                  </select>
                </label>
              </div>

              {hist.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
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

              <div className="pt-3">
                <Link href={`/payroll/employees/${c.id}`}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  👤 เปิดหน้าประวัติพนักงาน
                </Link>
              </div>
            </div>
          ) : (
            <EmployeeRecordsPanel employeeId={c.id} employeeName={c.nickname} onChanged={onChanged} compact />
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{label}</span><span className="text-slate-700">{value}</span></div>;
}

// ── ป๊อปตั้งค่าสีการ์ด (ส่วนกลาง — ทุกคนเห็นเหมือนกัน) ──
function ColorSettings({ cfg, categories, onClose, onSaved }: {
  cfg: BoardConfig; categories: { key: string; label: string }[];
  onClose: () => void; onSaved: (next: BoardConfig) => void;
}) {
  const [draft, setDraft] = useState<BoardConfig>(cfg);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // เปลี่ยน "ระบายสีตาม" แล้วหมวดจะเปลี่ยนตาม — ต้องรีโหลดบอร์ดเพื่อเห็นรายการหมวดใหม่
  const changedColorBy = draft.color_by !== cfg.color_by;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch("/api/payroll/board/config", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      onSaved(j.config as BoardConfig);
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-800">🎨 ตั้งค่าสีการ์ด</div>
            <div className="text-xs text-slate-400">ตั้งครั้งเดียว — ทุกคนเห็นเหมือนกัน</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">ระบายสีตาม</div>
            <div className="grid grid-cols-2 gap-1.5">
              {COLOR_BY_OPTS.map((o) => (
                <button key={o.v} onClick={() => setDraft((d) => ({ ...d, color_by: o.v }))}
                  className={`h-9 rounded-lg border text-sm transition ${draft.color_by === o.v ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                  {o.th}
                </button>
              ))}
            </div>
            {changedColorBy && <div className="text-[11px] text-amber-600 mt-1.5">กดบันทึกแล้วรายการสีจะเปลี่ยนไปตามหมวดใหม่</div>}
          </div>

          {!changedColorBy && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">สีของแต่ละหมวด</div>
              <div className="space-y-2">
                {categories.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-slate-700 truncate">{c.label}</span>
                    <div className="w-36">
                      <ColorInput value={draft.colors[c.key] ?? FALLBACK_COLOR}
                        onChange={(hex) => setDraft((d) => ({ ...d, colors: { ...d.colors, [c.key]: hex } }))} />
                    </div>
                  </div>
                ))}
                {categories.length === 0 && <div className="text-sm text-slate-400">ยังไม่มีข้อมูลให้ตั้งสี</div>}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.show_photo} onChange={(e) => setDraft((d) => ({ ...d, show_photo: e.target.checked }))} className="w-4 h-4 accent-emerald-600" />
            โชว์รูปพนักงานบนการ์ด (ไม่มีรูป = โชว์ตัวย่อ)
          </label>

          {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">{err}</div>}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
        </div>
      </div>
    </div>
  );
}
