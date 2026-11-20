"use client";

// ============================================================
// แท็บ "รวมทุกปฏิทิน" (แท็บแรกของ /calendar) — ทุกอย่างที่มีวันที่ในระบบ รวมในปฏิทินเดียว
//   ข้อมูล: GET /api/calendar/unified (เห็นเฉพาะแหล่งที่มีสิทธิ์ · แอดมินเห็นทุกแหล่ง)
//   ลากเปลี่ยนวัน = เรียก API เดิมของโมดูลนั้น (สิทธิ์/ประวัติ audit อยู่ที่โมดูลเดิม) + แจ้งผลมีปุ่ม "ย้อนกลับ"
//   กด + ในช่องวัน = เพิ่มงานแผนทีมวันนั้น (ของกลาง AddToPlanModal) · กดรายการ = เปิดหน้าเดิมเป็นป๊อป (EmbedModal)
//   ของกลาง: ScheduleBoard · toast.undo · EmbedModal · AddToPlanModal · state-views · device-view
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScheduleBoard } from "@/components/schedule-board";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { EmbedModal } from "@/components/embed-modal";
import { AddToPlanModal } from "@/components/team-plan/add-to-plan";
import { LoadingState, ErrorState } from "@/components/state-views";
import { useViewportLayout } from "@/components/device-view";
import { apiFetch } from "@/lib/api";
import {
  CAL_SOURCE, CAL_SOURCES, filterCalItems, monthRange, moveRequest, nextValue,
  type CalItem, type CalSourceKey, type UnifiedCalendarResponse,
} from "@/lib/unified-calendar";

const HIDDEN_KEY = "erp_unified_cal_hidden";
// ผลล่าสุดต่อช่วงวัน (ในหน่วยความจำ) → กลับมาแท็บนี้/เดือนเดิม ขึ้นทันที แล้วค่อยโหลดใหม่เงียบ ๆ
const CACHE = new Map<string, UnifiedCalendarResponse>();

const shiftYmd = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };

function readHidden(): Set<CalSourceKey> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as CalSourceKey[]); } catch { return new Set(); }
}

export function UnifiedCalendar() {
  const toast = useToast();
  const { can } = useAuth();
  const layout = useViewportLayout();
  // เริ่มที่เดือนนี้ทันที — เดิมรอ ScheduleBoard แจ้งเดือน แต่ระหว่างโหลดครั้งแรกไม่ได้วาด ScheduleBoard → ไม่เคยเริ่มโหลด (ค้าง "กำลังรวมปฏิทิน…" ตลอด · แก้ 2026-11-20)
  const [range, setRange] = useState<{ from: string; to: string } | null>(() => { const d = new Date(); return monthRange(d.getFullYear(), d.getMonth()); });
  const [res, setRes] = useState<UnifiedCalendarResponse | null>(null);
  const [items, setItems] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<CalSourceKey>>(() => new Set());
  const [person, setPerson] = useState("");
  const [open, setOpen] = useState<CalItem | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => { setHidden(readHidden()); }, []);
  const toggleSrc = (k: CalSourceKey) => setHidden((cur) => {
    const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...n])); } catch { /* ไม่มีที่เก็บ = ไม่จำ */ }
    return n;
  });

  const load = useCallback(async (r: { from: string; to: string }) => {
    const my = ++seq.current;
    const ck = `${r.from}|${r.to}`;
    const hit = CACHE.get(ck);
    if (hit) { setRes(hit); setItems(hit.data); setErr(null); }
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/calendar/unified?from=${r.from}&to=${r.to}`, { cache: "no-store" });
      const j = (await resp.json()) as UnifiedCalendarResponse;
      if (my !== seq.current) return;
      if (!resp.ok) throw new Error(j.error ?? "โหลดปฏิทินไม่สำเร็จ");
      CACHE.set(ck, j);
      setRes(j); setItems(j.data); setErr(null);
      if (j.error) toast.warning(j.error);
    } catch (e) {
      if (my === seq.current) setErr(e instanceof Error ? e.message : "โหลดปฏิทินไม่สำเร็จ");
    } finally { if (my === seq.current) setLoading(false); }
  }, [toast]);

  useEffect(() => { if (range) void load(range); }, [range, load]);
  const onMonthChange = useCallback((y: number, m: number) => { const r = monthRange(y, m); setRange((cur) => (cur && cur.from === r.from && cur.to === r.to ? cur : r)); }, []);

  // บันทึกค่าวันที่ลงโมดูลเดิม · ผ่าน = true
  const save = useCallback(async (it: CalItem, value: string | null): Promise<boolean> => {
    const req = moveRequest(it.src, it.rawId, value);
    if (!req) return false;
    try {
      const r = await apiFetch(req.url, { method: req.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j as { error?: string }).error) throw new Error((j as { error?: string }).error || "บันทึกไม่สำเร็จ");
      return true;
    } catch (e) {
      toast.error(`เลื่อนวัน "${it.title}" ไม่สำเร็จ — ${e instanceof Error ? e.message : ""}`);
      return false;
    }
  }, [toast]);

  const setLocal = (id: string, date: string | null, raw: string | null) =>
    setItems((cur) => cur.map((x) => (x.id === id ? { ...x, date, raw } : x)));

  // เลื่อนวัน (ทีละรายการ / ทั้งชุด) → แจ้งผลครั้งเดียวพร้อมปุ่มย้อนกลับ
  const moveMany = useCallback(async (moves: { it: CalItem; date: string | null }[]) => {
    const locked = moves.filter((m) => !m.it.canMove);
    if (locked.length) toast.info(`${[...new Set(locked.map((m) => CAL_SOURCE[m.it.src].label))].join(", ")} เลื่อนวันจากที่นี่ไม่ได้ — กดรายการเพื่อเปิดไปแก้ที่หน้าเดิม`);
    const list = moves.filter((m) => m.it.canMove && m.date !== m.it.date)
      .map((m) => ({ ...m, prev: { date: m.it.date, raw: m.it.raw }, value: nextValue(m.it.src, m.it.raw, m.date) }));
    if (!list.length) return;
    for (const m of list) setLocal(m.it.id, m.date, m.value);          // จอเปลี่ยนทันที
    const ok = await Promise.all(list.map((m) => save(m.it, m.value)));
    list.forEach((m, i) => { if (!ok[i]) setLocal(m.it.id, m.prev.date, m.prev.raw); });
    const done = list.filter((_, i) => ok[i]);
    if (!done.length) return;
    const label = done.length === 1
      ? `"${done[0].it.title}" ไป ${done[0].date ? new Date(`${done[0].date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "ยังไม่กำหนดวัน"}`
      : `${done.length} รายการ`;
    toast.undo(`ย้าย ${label}`, async () => {
      for (const m of done) setLocal(m.it.id, m.prev.date, m.prev.raw);
      const back = await Promise.all(done.map((m) => save({ ...m.it, raw: m.value }, m.prev.raw)));
      done.forEach((m, i) => { if (!back[i]) setLocal(m.it.id, m.date, m.value); });
      if (back.every(Boolean)) toast.success("ย้อนกลับแล้ว");
    }, { ms: 8000 });
  }, [save, toast]);
  const onSchedule = useCallback((it: CalItem, date: string | null) => moveMany([{ it, date }]), [moveMany]);
  const onScheduleMany = useCallback((list: CalItem[], delta: number | null) => {
    void moveMany(list.map((it) => ({ it, date: delta === null || !it.date ? null : shiftYmd(it.date, delta) })));
  }, [moveMany]);
  const nameOf = useMemo(() => new Map((res?.people ?? []).map((p) => [p.id, p.name])), [res]);

  const visibleSources = useMemo(() => {
    const keys = new Set(res?.sources.map((x) => x.key) ?? []);
    return CAL_SOURCES.filter((c) => keys.has(c.key));
  }, [res]);
  const counts = useMemo(() => {
    const m = new Map<CalSourceKey, number>();
    for (const i of items) m.set(i.src, (m.get(i.src) ?? 0) + 1);
    return m;
  }, [items]);
  const shown = useMemo(() => filterCalItems(items, hidden, person), [items, hidden, person]);
  const canAdd = can("tasks.create" as never);
  const isPhone = layout === "phone";

  if (!res && err) return <ErrorState title="โหลดปฏิทินรวมไม่สำเร็จ" hint={err} onRetry={() => range && void load(range)} className="m-4" />;

  return (
    <div className={isPhone ? "p-2" : "p-3"}>
      <div className={`flex items-center gap-1.5 mb-3 ${isPhone ? "overflow-x-auto pb-1 [scrollbar-width:none]" : "flex-wrap"}`}>
        {visibleSources.map((c) => {
          const off = hidden.has(c.key);
          return (
            <button key={c.key} type="button" onClick={() => toggleSrc(c.key)} aria-pressed={!off}
              title={c.movePerm ? "กดเพื่อซ่อน/แสดง" : "กดเพื่อซ่อน/แสดง · แหล่งนี้ดูอย่างเดียว (แก้วันที่หน้าเดิม)"}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs transition-opacity ${isPhone ? "h-8" : "py-1"} ${off ? "border-slate-200 bg-white text-slate-400 opacity-60" : "border-slate-200 bg-white text-slate-700"}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: off ? "#cbd5e1" : c.color }} />
              {c.label}<span className="tabular-nums text-slate-400">{counts.get(c.key) ?? 0}</span>
              {!c.movePerm && <span className="text-[10px] text-slate-400">ดู</span>}
            </button>
          );
        })}
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="กรองตามคน"
          className={`shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 ${isPhone ? "h-8" : "h-7 ml-auto"}`}>
          <option value="">ทุกคน</option>
          <option value="none">ยังไม่มีผู้รับผิดชอบ</option>
          {res?.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {loading && <span className="shrink-0 text-xs text-slate-400">กำลังโหลด…</span>}
      </div>

      {!res && loading ? <LoadingState label="กำลังรวมปฏิทินทุกแผนก…" /> : (
        <ScheduleBoard<CalItem>
          items={shown}
          layout={layout}
          getDate={(i) => i.date}
          onSchedule={(i, d) => void onSchedule(i, d)}
          onMonthChange={onMonthChange}
          onAddOnDay={canAdd ? (d) => setAddDay(d) : undefined}
          getDotColor={(i) => CAL_SOURCE[i.src].color}
          getSearchText={(i) => `${i.title} ${CAL_SOURCE[i.src].label}`}
          backlogTitle="ยังไม่กำหนดวัน"
          maxPerDay={4}
          hint={`ลากรายการไปวันอื่นเพื่อเลื่อนวัน (กด "ย้อนกลับ" ได้ 8 วินาที) · แหล่งที่มีป้าย "ดู" แก้วันที่หน้าเดิม${canAdd ? " · ชี้ช่องวันแล้วกด + เพื่อเพิ่มงานแผนทีม" : ""}`}
          renderChip={(i) => (
            <button type="button" onClick={() => setOpen(i)} title={`${CAL_SOURCE[i.src].label} · ${i.title}`}
              className="block w-full truncate rounded border-l-2 bg-white px-1 py-0.5 text-left text-[11px] text-slate-700 hover:bg-slate-50"
              style={{ borderLeftColor: CAL_SOURCE[i.src].color }}>
              {i.title}
            </button>
          )}
          renderCard={(i) => (
            <button type="button" onClick={() => setOpen(i)}
              className="block w-full rounded-lg border border-slate-200 border-l-4 bg-white px-2 py-1.5 text-left hover:bg-slate-50"
              style={{ borderLeftColor: CAL_SOURCE[i.src].color }}>
              <div className="text-[10px] text-slate-400">{CAL_SOURCE[i.src].label}{!i.canMove && " · ดูอย่างเดียว"}</div>
              <div className="truncate text-xs text-slate-700">{i.title}</div>
            </button>
          )}
          onScheduleMany={onScheduleMany}
          printTitle="ปฏิทินรวมทุกแผนก"
          renderPopView={(i, close) => (
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400"><span className="h-2 w-2 rounded-full" style={{ background: CAL_SOURCE[i.src].color }} />{CAL_SOURCE[i.src].label}{!i.canMove && " · ดูอย่างเดียว"}</div>
                  <div className="text-sm font-semibold leading-snug text-slate-800">{i.title}</div>
                </div>
                <button type="button" onClick={close} aria-label="ปิด" className="ml-auto shrink-0 text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="text-slate-600">👤 {i.who.length ? i.who.map((w) => nameOf.get(w) ?? "ผู้ใช้").join(", ") : "ยังไม่มีผู้รับผิดชอบ"}</div>
              {i.canMove ? (
                <label className="flex items-center gap-1.5">
                  <span className="shrink-0 text-slate-500">📅 วันที่</span>
                  <input type="date" value={i.date ?? ""} onChange={(e) => { void onSchedule(i, e.target.value || null); close(); }}
                    className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs" />
                </label>
              ) : (
                <div className="text-slate-500">📅 {i.date ? new Date(`${i.date}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" }) : "ยังไม่กำหนดวัน"} · แก้วันที่หน้าเดิม</div>
              )}
              <button type="button" onClick={() => { close(); setOpen(i); }} className="h-8 w-full rounded-lg bg-slate-800 text-white hover:bg-slate-700">เปิดหน้าเดิม (จัดการเต็ม) ↗</button>
            </div>
          )}
        />
      )}

      {open && <EmbedModal url={open.link} title={`${CAL_SOURCE[open.src].label} · ${open.title}`} onClose={() => { setOpen(null); if (range) void load(range); }} />}
      {addDay && (
        <AddToPlanModal key={addDay} open defaultTitle="" defaultDue={addDay}
          onClose={() => setAddDay(null)}
          onCreated={() => { if (range) void load(range); }} />
      )}
    </div>
  );
}
