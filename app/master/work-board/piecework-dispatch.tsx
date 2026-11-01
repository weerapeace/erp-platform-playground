"use client";

/**
 * หน้าต่าง "จ่ายงานเหมา" (บอร์ดจ่ายงาน) — เจ้าของขอ 2026-11-01
 *   แท็บจ่าย: เลือกใบงาน (สินค้า) ก่อน → ตารางงานเหมาต่อใบ · 1 แถว = งาน 1 อย่าง × คน 1 คน (งานเดียวแบ่งหลายคนได้)
 *     งานเหมาใน BOM ขึ้นให้เอง · "สถานะงานนี้" นับที่จ่ายไปแล้วด้วย (กันจ่ายซ้ำ) · บันทึกกลับใบงาน + BOM (ไม่เก็บชื่อคนใน BOM)
 *   แท็บรับงานคืน: งานเหมาที่ยังค้างแยกตามคน → ใส่ชิ้นที่รับคืน → เสร็จ (เข้าสรุปค่าแรงรายเดือน) · รับไม่ครบ = ที่เหลือให้คนเดิมทำต่อ / ไม่ทำแล้ว
 *   พิมพ์ใบจ่ายงานเหมา = /print/piecework (1 คน = 1 แผ่น)
 *   asPage = แสดงเป็นหน้าเต็ม (เมนู ผลิต → จ่ายงานเหมา · /master/piecework-dispatch) แทนป๊อป — ตัวเดียวกัน
 * กติกา: lib/piecework-dispatch.ts · API: /api/mo/piecework/batch
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { HoverImage } from "@/components/hover-image";
import { Icon } from "@/components/icon";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { bkkDate } from "@/lib/mo-sales-match";
import { pwDupLines, pwJobKey, pwJobStates, pwPersonTotals, pwRestLine, pwValidate, type PwLine } from "@/lib/piecework-dispatch";
import type { PwJob, PwMoInfo, PwRow } from "@/app/api/mo/piecework/batch/route";

export type PwCandidate = { mo_no: string; sku: string | null; name: string | null; qty: number; image_url: string | null; where: string };
type Person = { id: string; name: string; nickname?: string | null; code?: string | null; department_id?: string | null };
type Line = PwLine & { wo_id: string | null };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const today = () => bkkDate(new Date().toISOString());
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm disabled:opacity-50";
const num = "h-8 w-full rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-400";
const tabBtn = (on: boolean) => `inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm ${on ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

export function PieceworkDispatch({ open, onClose, moNos, candidates, craftsmen, departments, canEdit, onDone, startTab = "send", asPage = false }: {
  open: boolean;
  onClose: () => void;
  /** ใบที่ติ๊กมาจากบอร์ด (เปิดมาพร้อมใบเหล่านี้) */
  moNos: string[];
  /** ใบที่เพิ่มเข้ามาได้ (ยังไม่เข้า QC) — รอจ่าย + อยู่ที่ช่าง */
  candidates: PwCandidate[];
  craftsmen: Person[];
  departments: { id: string; name: string }[];
  canEdit: boolean;
  onDone?: () => void;
  startTab?: "send" | "recv";
  /** แสดงเป็นหน้าเต็ม (ไม่ใช่ป๊อป) */
  asPage?: boolean;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<"send" | "recv">(startTab);
  // ── แท็บจ่าย
  const [picked, setPicked] = useState<string[]>([]);
  const [info, setInfo] = useState<Record<string, PwMoInfo>>({});
  const [jobs, setJobs] = useState<PwJob[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [date, setDate] = useState(today());
  const [saveBom, setSaveBom] = useState(true);
  const [family, setFamily] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batchId, setBatchId] = useState(newId());
  const [result, setResult] = useState<{ batch_id: string; count: number; bom_updated: number } | null>(null);
  const [showErr, setShowErr] = useState(false);
  // ── แท็บรับคืน
  const [openRows, setOpenRows] = useState<PwRow[] | null>(null);
  const [recvSel, setRecvSel] = useState<Set<string>>(new Set());
  const [recvQty, setRecvQty] = useState<Record<string, string>>({});
  const [recvRest, setRecvRest] = useState<"keep" | "drop">("keep");
  const [recvQ, setRecvQ] = useState("");

  // เปิดใหม่ = เริ่มชุดใหม่จากใบที่ติ๊กมา
  useEffect(() => {
    if (!open) return;
    setTab(startTab); setPicked([...new Set(moNos)]); setLines([]); setInfo({}); setResult(null); setShowErr(false);
    setDate(today()); setBatchId(newId()); setOpenRows(null); setRecvSel(new Set()); setRecvQty({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const deskName = useCallback((id?: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? null : null), [departments]);
  const personLabel = (p: Person) => p.nickname?.trim() || p.name;
  const peopleOpts: SelectOption[] = useMemo(() => craftsmen.map((p) => ({ value: p.id, label: personLabel(p), sub: [p.nickname?.trim() && p.nickname !== p.name ? p.name : null, deskName(p.department_id)].filter(Boolean).join(" · ") || undefined, searchText: `${p.code ?? ""} ${p.name}` })), [craftsmen, deskName]);
  // งานที่ยังไม่มีในรายชื่อกลาง (พิมพ์ใหม่ / BOM เก่าที่ไม่ผูกรหัสงาน) → ใส่เป็นตัวเลือก "new:<ชื่อ>" ให้ช่องโชว์ชื่อได้
  const jobOpts: SelectOption[] = useMemo(() => {
    const out: SelectOption[] = jobs.map((j) => ({ value: j.id, label: j.name, badge: j.id.startsWith("new:") ? "ใหม่" : `฿${fmt(j.default_rate)}` }));
    for (const l of lines) if (!l.job_id && l.job_name && !out.some((o) => o.value === `new:${l.job_name}`)) out.push({ value: `new:${l.job_name}`, label: l.job_name, badge: "ใหม่" });
    return out;
  }, [jobs, lines]);
  const candOpts: SelectOption[] = useMemo(() => candidates.filter((c) => !picked.includes(c.mo_no))
    .map((c) => ({ value: c.mo_no, label: `${c.sku ?? "-"} · ${c.mo_no}`, sub: `${fmt(c.qty)} ชิ้น · ${c.where}`, searchText: c.name ?? "" })), [candidates, picked]);

  // โหลดข้อมูลใบที่เพิ่งเลือก → ตั้งต้นแถวจากงานเหมาใน BOM (เฉพาะที่ยังจ่ายไม่ครบ)
  useEffect(() => {
    if (!open || tab !== "send") return;
    const need = picked.filter((m) => !info[m]);
    if (!need.length && jobs.length) return;
    let cancel = false;
    setLoading(true);
    apiFetch(`/api/mo/piecework/batch?mo_nos=${encodeURIComponent(need.join(","))}`).then((r) => r.json()).then((j) => {
      if (cancel) return;
      if (j.error) { toast.error(j.error); return; }
      setJobs((j.jobs ?? []) as PwJob[]);
      const got = (j.data ?? []) as PwMoInfo[];
      setInfo((cur) => ({ ...cur, ...Object.fromEntries(got.map((m) => [m.mo_no, m])) }));
      const seed: Line[] = [];
      for (const m of got) {
        const wo = m.wos.length === 1 ? m.wos[0].id : null;
        for (const t of m.tmpl) {
          const st = pwJobStates(m.qty, [{ key: "x", mo_no: m.mo_no, job_id: t.job_id, job_name: t.job_name, rate: t.rate, qty_per: t.qty_per, qty: 0, assignee_id: null, assignee_name: "" }], m.existing)[0];
          if (st && st.left > 0) seed.push({ key: newId(), mo_no: m.mo_no, job_id: t.job_id, job_name: t.job_name, rate: t.rate, qty_per: t.qty_per, qty: st.left, assignee_id: null, assignee_name: "", from_bom: true, wo_id: wo });
        }
      }
      if (seed.length) setLines((ls) => [...ls, ...seed]);
    }).catch(() => { if (!cancel) toast.error("โหลดข้อมูลใบงานไม่สำเร็จ"); }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [open, tab, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const removeMo = (moNo: string) => { setPicked((ps) => ps.filter((m) => m !== moNo)); setLines((ls) => ls.filter((l) => l.mo_no !== moNo)); };
  const jobLeft = (moNo: string, jobId: string | null, name: string) => {
    const m = info[moNo]; if (!m) return 0;
    return pwJobStates(m.qty, lines.filter((l) => l.mo_no === moNo), m.existing).find((s) => s.key === pwJobKey(jobId, name))?.left ?? 0;
  };
  const addLine = (moNo: string) => {
    const m = info[moNo]; const j = jobs[0];
    setLines((ls) => [...ls, { key: newId(), mo_no: moNo, job_id: j?.id ?? null, job_name: j?.name ?? "", rate: j?.default_rate ?? 0, qty_per: 1, qty: m?.qty ?? 0, assignee_id: null, assignee_name: "", wo_id: m?.wos.length === 1 ? m.wos[0].id : null }]);
  };
  const setJob = (l: Line, jobId: string) => {
    const j = jobs.find((x) => x.id === jobId) ?? (jobId.startsWith("new:") ? { id: jobId, name: jobId.slice(4), default_rate: l.rate, is_detail: false } : null); if (!j) return;
    const t = info[l.mo_no]?.tmpl.find((x) => x.job_id === j.id || x.job_name === j.name);
    const qtyPer = t?.qty_per ?? 1;
    const m = info[l.mo_no];
    const jk = pwJobKey(j.id.startsWith("new:") ? null : j.id, j.name);
    const others = lines.filter((x) => x.key !== l.key && x.mo_no === l.mo_no && pwJobKey(x.job_id, x.job_name) === jk).reduce((a, x) => a + x.qty, 0);
    const before = m ? pwJobStates(m.qty, [], m.existing).find((s) => s.key === jk)?.before ?? 0 : 0;
    patch(l.key, { job_id: j.id.startsWith("new:") ? null : j.id, job_name: j.name, rate: t?.rate ?? j.default_rate, qty_per: qtyPer, qty: Math.max(0, (m?.qty ?? 0) * qtyPer - before - others) });
  };
  const createJob = (l: Line, name: string) => {
    const nm = name.trim(); if (!nm) return;
    const tmp: PwJob = { id: `new:${nm}`, name: nm, default_rate: 0, is_detail: false };
    setJobs((js) => (js.some((x) => x.name === nm) ? js : [...js, tmp]));
    patch(l.key, { job_id: null, job_name: nm });
  };
  const setPerson = (l: Line, id: string) => { const p = craftsmen.find((x) => x.id === id); if (p) patch(l.key, { assignee_id: p.id, assignee_name: personLabel(p) }); };
  const setQtyPer = (moNo: string, jobKey: string, v: number) => setLines((ls) => ls.map((l) => (l.mo_no === moNo && pwJobKey(l.job_id, l.job_name) === jobKey ? { ...l, qty_per: v } : l)));
  const split = (l: Line) => setLines((ls) => [...ls, { ...pwRestLine(l, jobLeft(l.mo_no, l.job_id, l.job_name), newId()), wo_id: l.wo_id }]);
  // ใส่ทุกใบตามใบแรก: งาน + คน + ชิ้นต่อใบ ของใบแรก → ใบอื่นที่ยังว่าง (ต่องาน = ชิ้นต่อใบ × จำนวนสั่งของใบนั้น · แบ่งคนตามสัดส่วนเดิม)
  const copyFirst = () => {
    const first = picked.find((m) => lines.some((l) => l.mo_no === m)); if (!first) { toast.error("ใส่งานเหมาในใบแรกก่อน"); return; }
    const src = lines.filter((l) => l.mo_no === first);
    const jobSum = new Map<string, number>();
    for (const l of src) { const k = pwJobKey(l.job_id, l.job_name); jobSum.set(k, (jobSum.get(k) ?? 0) + l.qty); }
    const add: Line[] = [];
    for (const moNo of picked) {
      if (moNo === first || lines.some((l) => l.mo_no === moNo)) continue;
      const m = info[moNo]; if (!m) continue;
      const before = new Map(pwJobStates(m.qty, [], m.existing).map((s) => [s.key, s.before]));   // จ่ายไปแล้วก่อนหน้า = หักออก
      for (const l of src) {
        const k = pwJobKey(l.job_id, l.job_name), sum = jobSum.get(k) ?? 0;
        const share = sum > 0 ? l.qty / sum : 1;
        const need = Math.max(0, l.qty_per * m.qty - (before.get(k) ?? 0));
        add.push({ ...l, key: newId(), mo_no: moNo, qty: Math.round(share * need * 100) / 100, from_bom: false, wo_id: m.wos.length === 1 ? m.wos[0].id : null });
      }
    }
    if (!add.length) { toast.error("ทุกใบมีงานเหมาแล้ว"); return; }
    setLines((ls) => [...ls, ...add]);
  };

  const issues = useMemo(() => pwValidate(lines), [lines]);
  const dups = useMemo(() => new Set(pwDupLines(lines)), [lines]);
  const totals = useMemo(() => pwPersonTotals(lines), [lines]);
  const money = totals.reduce((a, p) => a + p.money, 0);
  const over = useMemo(() => picked.flatMap((moNo) => {
    const m = info[moNo]; if (!m) return [];
    return pwJobStates(m.qty, lines.filter((l) => l.mo_no === moNo), m.existing).filter((s) => s.left < -0.001 && s.now > 0).map((s) => `${m.product_sku ?? moNo} · ${s.job_name} เกิน ${fmt(-s.left)} ชิ้น`);
  }), [picked, info, lines]);

  const save = async () => {
    setShowErr(true);
    if (!lines.length) { toast.error("ยังไม่มีงานเหมาให้จ่าย"); return; }
    if (issues.length) { toast.error(issues[0].msg); return; }
    if (dups.size) { toast.error("มีแถวซ้ำ (งานเดียวกัน คนเดียวกัน) — รวมเป็นแถวเดียว"); return; }
    if (over.length && !(await askConfirm({ title: "จ่ายเกินจำนวนที่ต้องทำ", confirmText: "จ่ายต่อ",
      message: <div className="space-y-1 text-sm">{over.map((o) => <div key={o}>• {o}</div>)}<div className="pt-1 text-slate-500">รวมที่จ่ายไปแล้วด้วย — ถ้าตั้งใจ (เช่น ทำซ้ำ/ซ่อม) กดจ่ายต่อได้</div></div> }))) return;
    setBusy(true);
    try {
      const body = { batch_id: batchId, date, save_bom: saveBom, bom_scope: family ? "parent" : "sku",
        lines };
      const r = await apiFetch("/api/mo/piecework/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "จ่ายงานเหมาไม่สำเร็จ");
      setResult({ batch_id: j.data.batch_id, count: j.data.count, bom_updated: j.data.bom_updated });
      toast.success(`จ่ายงานเหมาแล้ว ${j.data.count} รายการ${j.data.bom_updated ? ` · เข้า BOM ${j.data.bom_updated} สูตร` : ""}`);
      onDone?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "จ่ายงานเหมาไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const resetBatch = () => { setResult(null); setPicked([]); setLines([]); setInfo({}); setBatchId(newId()); setShowErr(false); };

  // ── แท็บรับคืน
  const loadOpen = useCallback(async () => {
    setOpenRows(null);
    try {
      const j = await apiFetch("/api/mo/piecework/batch?open=1").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setOpenRows((j.data ?? []) as PwRow[]); setRecvSel(new Set()); setRecvQty({});
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดงานค้างไม่สำเร็จ"); setOpenRows([]); }
  }, [toast]);
  useEffect(() => { if (open && tab === "recv" && openRows === null) void loadOpen(); }, [open, tab, openRows, loadOpen]);
  const recvGroups = useMemo(() => {
    const s = recvQ.trim().toLowerCase();
    const rows = (openRows ?? []).filter((r) => !s || `${r.assignee_name ?? ""} ${r.product_sku ?? ""} ${r.mo_no} ${r.job_name}`.toLowerCase().includes(s));
    const m = new Map<string, PwRow[]>();
    for (const r of rows) { const k = r.assignee_name ?? "—"; m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
  }, [openRows, recvQ]);
  const qtyOf = (r: PwRow) => { const v = recvQty[r.id]; return v === undefined || v === "" ? r.total_qty : Math.max(0, Number(v) || 0); };
  const recvChosen = (openRows ?? []).filter((r) => recvSel.has(r.id));
  const recvShort = recvChosen.filter((r) => qtyOf(r) < r.total_qty);
  const toggleRecv = (ids: string[], on: boolean) => setRecvSel((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });
  const markDone = async () => {
    if (!recvChosen.length) return;
    setBusy(true);
    try {
      const items = recvChosen.map((r) => ({ id: r.id, qty: Math.min(qtyOf(r), r.total_qty), rest: recvRest }));
      const r = await apiFetch("/api/mo/piecework/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "done", items }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกรับคืนไม่สำเร็จ");
      toast.success(`รับคืนแล้ว ${j.data.done} รายการ${j.data.split ? ` · ที่เหลือยังค้าง ${j.data.split} รายการ` : ""}`);
      if (j.data.fail?.length) toast.error(j.data.fail[0]);
      onDone?.(); await loadOpen();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกรับคืนไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const footer = tab === "send" ? (result ? undefined : (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {totals.map((p) => <span key={p.name} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-700">{p.name} · {fmt(p.qty)} ชิ้น · ฿{fmt(p.money)}</span>)}
        {lines.some((l) => !l.assignee_name) && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[12px] text-amber-700">ยังไม่เลือกคน {lines.filter((l) => !l.assignee_name).length} แถว</span>}
      </div>
      <div className="flex-1" />
      <span className="text-sm text-slate-600">{lines.length} แถว · รวม <b>฿{fmt(money)}</b></span>
      <button type="button" disabled={busy || !canEdit || !lines.length} onClick={() => void save()} title={!canEdit ? "ไม่มีสิทธิ์จ่ายงาน" : ""}
        className={`${btn} border-violet-600 bg-violet-600 font-medium text-white hover:bg-violet-700`}>
        <Icon name="thread" /> {busy ? "กำลังจ่าย…" : "จ่ายงานเหมา"}
      </button>
    </div>
  )) : (
    <div className="flex flex-wrap items-center gap-2">
      {recvShort.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-amber-700">รับไม่ครบ {recvShort.length} รายการ — ที่เหลือ:</span>
          <label className="inline-flex items-center gap-1"><input type="radio" checked={recvRest === "keep"} onChange={() => setRecvRest("keep")} /> ยังให้คนเดิมทำต่อ</label>
          <label className="inline-flex items-center gap-1"><input type="radio" checked={recvRest === "drop"} onChange={() => setRecvRest("drop")} /> ไม่ทำแล้ว</label>
        </div>
      )}
      <div className="flex-1" />
      <span className="text-sm text-slate-600">เลือก {recvChosen.length} รายการ · ฿{fmt(recvChosen.reduce((a, r) => a + qtyOf(r) * r.rate, 0))}</span>
      <button type="button" disabled={busy || !canEdit || !recvChosen.length} onClick={() => void markDone()}
        className={`${btn} border-emerald-600 bg-emerald-600 font-medium text-white hover:bg-emerald-700`}>
        <Icon name="done" /> {busy ? "กำลังบันทึก…" : "รับคืน / เสร็จ"}
      </button>
    </div>
  );

  const description = tab === "send" ? "เลือกใบงานก่อน แล้วใส่งานเหมา + คนรับ — 1 แถว = งาน 1 อย่าง × คน 1 คน (งานเดียวแบ่งหลายคนได้)" : "งานเหมาที่ยังไม่รับคืน แยกตามคน — ใส่ชิ้นที่รับคืนแล้วกดเสร็จ (เข้าสรุปค่าแรงรายเดือน)";
  const body = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setTab("send")} className={tabBtn(tab === "send")}><Icon name="thread" /> จ่ายงานเหมา</button>
          <button type="button" onClick={() => setTab("recv")} className={tabBtn(tab === "recv")}><Icon name="done" /> รับงานคืน{openRows ? ` ${openRows.length}` : ""}</button>
        </div>

        {tab === "send" ? (result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center">
            <div className="text-lg font-semibold text-emerald-800">จ่ายงานเหมาแล้ว {result.count} รายการ</div>
            <div className="mt-1 text-sm text-emerald-700">{result.bom_updated ? `บันทึกเข้า BOM ${result.bom_updated} สูตร · ` : ""}ดูได้ในแท็บ "งานเหมา" ของใบงาน และแท็บ "รับงานคืน"</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a href={`/print/piecework?batch=${encodeURIComponent(result.batch_id)}`} target="_blank" rel="noreferrer" className={`${btn} border-blue-600 bg-blue-600 font-medium text-white no-underline hover:bg-blue-700`}><Icon name="print" /> พิมพ์ใบจ่ายงานเหมา</a>
              <button type="button" onClick={resetBatch} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}><Icon name="add" /> จ่ายชุดใหม่</button>
              {!asPage && <button type="button" onClick={onClose} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>ปิด</button>}
            </div>
          </div>
        ) : (
          <>
            {/* ① ใบงานที่เลือก */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700">① ใบงาน</span>
              <div className="w-72"><SearchableSelect value="" options={candOpts} onChange={(v) => v && setPicked((ps) => (ps.includes(v) ? ps : [...ps, v]))} placeholder="+ เพิ่มใบงาน (พิมพ์รหัสสินค้า / เลขใบ)" /></div>
              <span className="text-[12px] text-slate-400">เฉพาะใบที่ยังไม่เข้า QC · ติ๊กจากบอร์ดมาได้</span>
              <div className="flex-1" />
              <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">วันที่จ่าย <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-sm" /></label>
              <button type="button" onClick={copyFirst} disabled={picked.length < 2} className={`${btn} h-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><Icon name="list" /> ใส่ทุกใบตามใบแรก</button>
            </div>

            {!picked.length ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">เลือกใบงานก่อน — ติ๊กบนบอร์ดแล้วกด &ldquo;จ่ายงานเหมา&rdquo; หรือเพิ่มจากช่องด้านบน</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead><tr className="bg-slate-50 text-left text-[12px] text-slate-500">
                    <th className="px-2 py-2 font-medium" style={{ width: 190 }}>② งานเหมา</th><th className="px-2 py-2 font-medium" style={{ width: 190 }}>คนรับ</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ width: 80 }}>ชิ้น</th><th className="px-2 py-2 text-right font-medium" style={{ width: 80 }}>฿/ชิ้น</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ width: 84 }}>เงิน</th><th className="px-2 py-2 font-medium">สถานะงานนี้</th><th style={{ width: 32 }} />
                  </tr></thead>
                  <tbody>
                    {picked.map((moNo) => {
                      const m = info[moNo], c = candidates.find((x) => x.mo_no === moNo);
                      const ls = lines.filter((l) => l.mo_no === moNo);
                      const states = m ? pwJobStates(m.qty, ls, m.existing) : [];
                      const firstOfJob = new Set<string>(); const seen = new Set<string>();
                      for (const l of ls) { const k = pwJobKey(l.job_id, l.job_name); if (!seen.has(k)) { seen.add(k); firstOfJob.add(l.key); } }
                      const where = m ? (m.wos.length ? m.wos.map((w) => [w.department_name, w.assignee_name].filter(Boolean).join(" · ")).join(", ") : m.in_qc ? "เข้า QC ครบแล้ว" : "รอจ่าย") : c?.where ?? "";
                      const doneBefore = (m?.existing ?? []).filter((e) => !ls.some((l) => pwJobKey(l.job_id, l.job_name) === pwJobKey(e.job_id, e.job_name)));
                      return [
                        <tr key={`h-${moNo}`} className="border-t border-slate-200 bg-slate-50/70">
                          <td colSpan={7} className="px-2 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <HoverImage url={m?.image_url ?? c?.image_url ?? null} size={36} />
                              <span className="font-mono text-[13px] font-semibold text-slate-800">{m?.product_sku ?? c?.sku ?? moNo}</span>
                              <span className="text-[12px] text-slate-500">{moNo} · สั่ง {fmt(m?.qty ?? c?.qty ?? 0)} · {where}</span>
                              {m?.in_qc && <span className="rounded bg-rose-50 px-1.5 text-[11px] text-rose-600">ส่งเข้า QC ครบแล้ว — จ่ายไม่ได้</span>}
                              {doneBefore.map((e) => <span key={e.id} className="rounded bg-white px-1.5 text-[11px] text-slate-500 ring-1 ring-slate-200">จ่ายแล้ว {e.job_name} {fmt(e.total_qty)} · {e.assignee_name ?? "-"}{e.status === "done" ? " · เสร็จ" : ""}</span>)}
                              <div className="flex-1" />
                              <button type="button" onClick={() => addLine(moNo)} disabled={!m} className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-200 bg-white px-2 text-[12px] text-violet-700 hover:bg-violet-50"><Icon name="add" /> งานเหมา</button>
                              <button type="button" onClick={() => removeMo(moNo)} title="เอาใบนี้ออก" className="h-7 w-7 rounded-md text-slate-400 hover:bg-white hover:text-rose-600"><Icon name="cancel" /></button>
                            </div>
                          </td>
                        </tr>,
                        !m ? <tr key={`l-${moNo}`}><td colSpan={7} className="px-3 py-2 text-[12px] text-slate-400">{loading ? "กำลังโหลด…" : "โหลดใบนี้ไม่ได้"}</td></tr>
                        : !ls.length ? <tr key={`e-${moNo}`}><td colSpan={7} className="px-3 py-2 text-[12px] text-slate-400">ยังไม่มีงานเหมา — กด &ldquo;+ งานเหมา&rdquo; หรือ &ldquo;ใส่ทุกใบตามใบแรก&rdquo;</td></tr>
                        : null,
                        ...ls.map((l) => {
                          const k = pwJobKey(l.job_id, l.job_name), st = states.find((s) => s.key === k);
                          const bad = showErr && issues.some((i) => i.key === l.key), dup = dups.has(l.key);
                          return (
                            <tr key={l.key} className={`border-t border-slate-100 ${dup ? "bg-rose-50/60" : ""}`}>
                              <td className="px-2 py-1.5"><SearchableSelect value={l.job_id ?? (l.job_name ? `new:${l.job_name}` : "")} options={jobOpts} onChange={(v) => setJob(l, v)} onCreate={(q) => createJob(l, q)} createLabel="เพิ่มงานเหมาใหม่" placeholder="เลือกงาน" /></td>
                              <td className={`px-2 py-1.5 ${bad && !l.assignee_name ? "rounded ring-2 ring-rose-300" : ""}`}><SearchableSelect value={l.assignee_id ?? ""} options={peopleOpts} onChange={(v) => setPerson(l, v)} placeholder="— เลือกคน —" /></td>
                              <td className="px-2 py-1.5"><input type="number" min={0} step="any" value={l.qty} onChange={(e) => patch(l.key, { qty: Math.max(0, Number(e.target.value) || 0) })} className={`${num} ${bad && !(l.qty > 0) ? "border-rose-400" : ""}`} /></td>
                              <td className="px-2 py-1.5"><input type="number" min={0} step="any" value={l.rate} onChange={(e) => patch(l.key, { rate: Math.max(0, Number(e.target.value) || 0) })} className={num} /></td>
                              <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-700">฿{fmt(l.qty * l.rate)}</td>
                              <td className="px-2 py-1.5 text-[12px]">
                                {firstOfJob.has(l.key) && st ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {st.left === 0 ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">ครบ {fmt(st.before + st.now)}/{fmt(st.need)}</span>
                                      : st.left > 0 ? <><span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">จ่าย {fmt(st.before + st.now)}/{fmt(st.need)} · เหลือ {fmt(st.left)}</span>
                                        <button type="button" onClick={() => split(l)} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">+ คนอื่น</button></>
                                      : <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600">เกิน {fmt(-st.left)}</span>}
                                    {st.before > 0 && <span className="text-slate-400" title={st.beforeWho.map((w) => `${w.name} ${fmt(w.qty)}`).join(", ")}>(จ่ายก่อนหน้า {fmt(st.before)})</span>}
                                    <label className="inline-flex items-center gap-1 text-slate-500" title="ชิ้นต่อสินค้า 1 ใบ — ใช้คิดว่าต้องจ่ายทั้งหมดกี่ชิ้น และบันทึกเข้า BOM">
                                      ×<input type="number" min={0} step="any" value={l.qty_per} onChange={(e) => setQtyPer(moNo, k, Math.max(0, Number(e.target.value) || 0))} className="h-6 w-12 rounded border border-slate-200 px-1 text-right" />/ใบ
                                    </label>
                                    {l.from_bom && <span className="rounded px-1 text-slate-400 ring-1 ring-slate-200">จาก BOM</span>}
                                  </div>
                                ) : <span className="text-slate-400">{dup ? "ซ้ำกับแถวบน — รวมเป็นแถวเดียว" : "↑ งานเดียวกัน"}</span>}
                              </td>
                              <td className="px-1 py-1.5 text-center"><button type="button" onClick={() => removeLine(l.key)} aria-label="ลบแถว" className="h-7 w-7 rounded text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Icon name="delete" /></button></td>
                            </tr>
                          );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {picked.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600">
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={saveBom} onChange={(e) => setSaveBom(e.target.checked)} /> บันทึกเข้า BOM ด้วย <span className="text-[12px] text-slate-400">(งาน + ชิ้นต่อใบ + ราคา · ไม่เก็บชื่อคน)</span></label>
                <label className={`inline-flex items-center gap-1.5 ${saveBom ? "" : "opacity-50"}`}><input type="checkbox" checked={family} disabled={!saveBom} onChange={(e) => setFamily(e.target.checked)} /> ใส่ให้ทุกสีของรุ่นเดียวกัน (Parent SKU)</label>
              </div>
            )}
            {showErr && issues.length > 0 && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{issues.slice(0, 4).map((i) => <div key={i.key}>• {i.msg}</div>)}{issues.length > 4 && <div>…อีก {issues.length - 4} แถว</div>}</div>}
          </>
        )) : (
          openRows === null ? <div className="py-10 text-center text-slate-400">กำลังโหลดงานเหมาที่ยังค้าง…</div>
          : !openRows.length ? <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">ไม่มีงานเหมาค้าง — จ่ายงานเหมาจากแท็บแรก</div>
          : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input value={recvQ} onChange={(e) => setRecvQ(e.target.value)} placeholder="ค้นชื่อคน / รหัสสินค้า / เลขใบ / งาน" className="h-8 w-72 rounded-md border border-slate-200 px-2 text-sm" />
                <button type="button" onClick={() => void loadOpen()} className={`${btn} h-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><Icon name="refresh" /> โหลดใหม่</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead><tr className="bg-slate-50 text-left text-[12px] text-slate-500">
                    <th style={{ width: 32 }} /><th className="px-2 py-2 font-medium">สินค้า · ใบสั่งผลิต</th><th className="px-2 py-2 font-medium">งานเหมา</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ width: 70 }}>จ่าย</th><th className="px-2 py-2 text-right font-medium" style={{ width: 90 }}>รับคืน</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ width: 84 }}>เงิน</th><th className="px-2 py-2 font-medium" style={{ width: 90 }}>วันที่จ่าย</th>
                  </tr></thead>
                  <tbody>
                    {recvGroups.map(([name, rows]) => {
                      const allOn = rows.every((r) => recvSel.has(r.id));
                      return [
                        <tr key={`g-${name}`} className="border-t border-slate-200 bg-slate-50/70">
                          <td className="px-2 py-2 text-center"><input type="checkbox" checked={allOn} onChange={(e) => toggleRecv(rows.map((r) => r.id), e.target.checked)} aria-label={`เลือกทั้งหมดของ ${name}`} /></td>
                          <td colSpan={6} className="px-2 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-800">{name}</span>
                              <span className="text-[12px] text-slate-500">{rows.length} รายการ · ฿{fmt(rows.reduce((a, r) => a + r.total_qty * r.rate, 0))}</span>
                              <div className="flex-1" />
                              <a href={`/print/piecework?ids=${rows.map((r) => r.id).join(",")}`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-600 no-underline hover:bg-slate-50"><Icon name="print" /> พิมพ์งานค้างของคนนี้</a>
                            </div>
                          </td>
                        </tr>,
                        ...rows.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={recvSel.has(r.id)} onChange={(e) => toggleRecv([r.id], e.target.checked)} /></td>
                            <td className="px-2 py-1.5"><div className="flex items-center gap-2"><HoverImage url={r.image_url ?? null} size={30} /><div className="min-w-0"><div className="font-mono text-[12px] font-semibold text-slate-800">{r.product_sku ?? "-"}</div><div className="text-[11px] text-slate-400">{r.mo_no}</div></div></div></td>
                            <td className="px-2 py-1.5 text-slate-700">{r.job_name}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.total_qty)}</td>
                            <td className="px-2 py-1.5"><input type="number" min={0} max={r.total_qty} step="any" value={recvQty[r.id] ?? String(r.total_qty)}
                              onChange={(e) => { setRecvQty((q) => ({ ...q, [r.id]: e.target.value })); toggleRecv([r.id], true); }} className={`${num} ${qtyOf(r) < r.total_qty ? "border-amber-400" : ""}`} /></td>
                            <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-700">฿{fmt(qtyOf(r) * r.rate)}</td>
                            <td className="px-2 py-1.5 text-[12px] text-slate-500">{r.dispatched_at ?? r.created_at.slice(0, 10)}</td>
                          </tr>
                        )),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>
  );
  if (asPage) return (
    <div className="mx-auto max-w-[1600px] p-4">
      <div className="mb-3">
        <h1 className="inline-flex items-center gap-2 text-xl font-bold text-slate-800"><Icon name="thread" /> จ่ายงานเหมา</h1>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {body}
      {footer && <div className="sticky bottom-0 z-10 mt-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">{footer}</div>}
    </div>
  );
  return (
    <ERPModal open={open} onClose={() => { if (!busy) onClose(); }} size="xl" storageKey="wb-piecework-dispatch" title="จ่ายงานเหมา" description={description} footer={footer}>
      {body}
    </ERPModal>
  );
}
