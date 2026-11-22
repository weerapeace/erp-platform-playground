"use client";

/**
 * DeliveryBillPanel (ของกลาง) — แนบ "ใบส่งของจากร้านขนส่ง" กับใบสำคัญรับ แล้วให้ AI อ่าน
 *   อัปโหลดรูป (หรือหยิบไฟล์แนบตอนรับของ GR) → 🔍 อ่านด้วย AI → ได้ รหัสขนส่ง EK-… + รายการ (P/o.No, Description, Pack, Qty, Weight, M3)
 *   → แก้ค่าที่อ่านผิดได้ → จับคู่แต่ละบรรทัดกับสินค้าในใบสำคัญ (เลือกได้หลายตัว) → ✓ ใช้น้ำหนัก/คิวจากใบนี้
 * ใช้: <DeliveryBillPanel voucherId lines readonly onApplied controlRef? onStatus? />  (lines = รายการในใบสำคัญ ไว้ให้เลือกจับคู่)
 * ★ 2026-11-14 ลากรูป/PDF มาวาง (หรือ Ctrl+V ตอนชี้กล่อง) = AI อ่านต่อทันที · แถวเรียงตามใบจริง + เลข # บนกระดาษ · ลากหูจับย้ายแถวได้
 * ★ 2026-11-22 (เจ้าของเลือกแบบ 2 + ข้อเสนอ 1-4)
 *   - แก้แล้วยังไม่บันทึก (ลบแถว/แก้ตัวเลข/จับคู่/ลาก/เปลี่ยนเจ้าของแถว) = ขึ้นป้ายทุกกรณี · หน้าใบถามก่อนยืนยัน/ออก (controlRef + onStatus)
 *   - แต่ละแถวเลือกว่าเป็นของใบไหน: ใบนี้ / ใบอื่น / พักไว้ / ไม่ใช่ของเรา (lib/delivery-bill-share) · ใบอื่นเห็นบิลเดียวกันโดยไม่ต้องอัปโหลดซ้ำ
 *   - เลขขนส่งซ้ำกับใบอื่น → ถาม/ปุ่ม "ใช้ร่วมกับ PV…" · ลบแถว = แจ้งเตือนมีปุ่มย้อนกลับ · กล่องที่พักไว้ = แนะนำให้ใบที่ยังไม่มีใบส่งของ
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { FileInput } from "@/components/file-input";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { billLineNo } from "@/lib/bill-line-order";
import { HoverPreview } from "@/components/hover-image";
import { useFileRefUrls } from "@/components/file-ref";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { DeliveryBillLine } from "@/lib/delivery-bill";
import { normDesc, ruleForDescription, type DescRule } from "@/lib/delivery-bill-check";
import { rowOwner, rowsOf, otherOwners, setRowOwner, choiceKey, parseChoiceKey, billTotalsFor, appliedFor, billDirty, matchCopyRow } from "@/lib/delivery-bill-share";
import { QtyCheckCard, type BoxSuggestion } from "./qty-check";

export type BillRow = {
  id: string; voucher_id: string; gr_id: string | null; r2_key: string; tracking_no: string | null; bill_date: string | null; marking: string | null; delivery_area: string | null;
  total_weight_kg: number | null; total_m3: number | null; total_packages: number | null; lines: DeliveryBillLine[]; status: string; applied_at: string | null; created_at: string; updated_at?: string | null;
};
type Candidate = { gr_id: string; gr_no: string; kind: "receipt" | "bill"; r2_key: string };
export type VoucherLineLite = { id: string; code: string; item_name: string; qty: number; uom: string | null; gr_no: string | null; is_product?: boolean };
type VOpt = { id: string; pv_no: string | null; status: string; voucher_date: string | null; seller_name: string | null; why: string };
type ShortRow = { idx: number; no: number | null; description: string | null; qty: number | null; weight_kg: number | null; m3: number | null; owner?: string | null; applied?: boolean };
type Dup = { bill_id: string; tracking_no: string; voucher_id: string; pv_no: string | null; created_at: string; rows: number; lines?: ShortRow[] };
type Parked = { bill_id: string; tracking_no: string | null; bill_date: string | null; voucher_id: string; pv_no: string | null; rows: ShortRow[] };
type Draft = { tracking_no: string; bill_date: string; lines: DeliveryBillLine[] };
/** หน้าใบคุมแผงนี้: ยังไม่บันทึกไหม · บันทึกทั้งหมด · ทิ้งที่แก้ · ใช้น้ำหนัก/คิวทุกใบ */
export type DeliveryBillApi = {
  pending: () => boolean;
  flush: () => Promise<boolean>;
  discard: () => void;
  applyAll: () => Promise<{ applied: number; unmapped: number; failed: number }>;
};
export type DeliveryBillStatus = { pending: boolean; mineRows: number; unappliedRows: number; unmappedRows: number };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const stripCode = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
const fmtN = (v: number, d: number) => v.toLocaleString("th-TH", { maximumFractionDigits: d });
const inp = "h-8 px-1.5 text-xs border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500";
/** ลากย้ายแถว: หลายใบในแผงเดียวใช้ตัวลากตัวเดียว → ดัชนี = ลำดับใบ × ROW_SPAN + ลำดับแถว (ลากข้ามใบไม่ได้) */
const ROW_SPAN = 10000;
const toDraft = (b: BillRow): Draft => ({ tracking_no: b.tracking_no ?? "", bill_date: b.bill_date ?? "", lines: (b.lines ?? []).map((l) => ({ ...l, voucher_line_ids: [...(l.voucher_line_ids ?? [])] })) });

export function DeliveryBillPanel({ voucherId, lines, readonly, onApplied, controlRef, onStatus }: {
  voucherId: string; lines: VoucherLineLite[]; readonly: boolean; onApplied: () => void | Promise<void>;
  controlRef?: React.MutableRefObject<DeliveryBillApi | null>; onStatus?: (s: DeliveryBillStatus) => void;
}) {
  const toast = useToast();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);   // "parse" | bill id | "claim"
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [loaded, setLoaded] = useState<Record<string, Draft>>({});   // ค่าจากเซิร์ฟเวอร์ ไว้เทียบ "ยังไม่บันทึก"
  const [mapFor, setMapFor] = useState<{ billId: string; idx: number } | null>(null);
  const [open, setOpen] = useState(true);
  const [rules, setRules] = useState<DescRule[]>([]);   // กฎ Description → คิว/กก. (/m/freight-description-rules)
  const [remembering, setRemembering] = useState<string | null>(null);
  const [vouchers, setVouchers] = useState<VOpt[]>([]);   // ใบที่เลือกเป็นเจ้าของแถวได้
  const [dups, setDups] = useState<Dup[]>([]);
  const [parked, setParked] = useState<Parked[]>([]);
  const [claim, setClaim] = useState<{ billId: string; title: string; note: string; rows: ShortRow[]; picked: Set<number>; dropBillId: string | null } | null>(null);
  const [dupAsk, setDupAsk] = useState<{ billId: string; dups: { voucher_id: string; pv_no: string | null }[] } | null>(null);
  const [searchFor, setSearchFor] = useState<{ billId: string; idx: number } | null>(null);
  const [pvQ, setPvQ] = useState("");
  const [pvHits, setPvHits] = useState<VOpt[]>([]);
  const [removeAsk, setRemoveAsk] = useState<BillRow | null>(null);
  // รูปบิลเป็น "ที่อยู่ไฟล์กลาง" — บิลใหม่อยู่ Supabase ส่วนตัว ต้องขอลิงก์ชั่วคราว (components/file-ref)
  const fileUrls = useFileRefUrls([...cands.map((c) => c.r2_key), ...bills.map((b) => b.r2_key)]);
  const imgUrl = (ref: string) => fileUrls[ref] ?? undefined;
  const pvOf = useCallback((vid: string | null | undefined) => {
    if (!vid) return null;
    if (vid === voucherId) return "ใบนี้";
    return vouchers.find((v) => v.id === vid)?.pv_no ?? "ใบอื่น";
  }, [vouchers, voucherId]);

  const loadedRef = useRef(loaded); loadedRef.current = loaded;
  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills`).then((r) => r.json());
      const rows = (j.data ?? []) as BillRow[];
      setBills(rows); setCands((j.candidates ?? []) as Candidate[]); setRules((j.rules ?? []) as DescRule[]);
      setVouchers((j.vouchers ?? []) as VOpt[]); setDups((j.duplicates ?? []) as Dup[]); setParked((j.parked ?? []) as Parked[]);
      const fresh: Record<string, Draft> = {};
      for (const b of rows) fresh[b.id] = toDraft(b);
      // ที่แก้ค้างไว้ (ยังไม่บันทึก) เก็บไว้ · ที่ไม่ได้แก้ = ใช้ค่าล่าสุดจากเซิร์ฟเวอร์
      setDraft((p) => { const n: Record<string, Draft> = {}; for (const b of rows) { const prev = p[b.id], old = loadedRef.current[b.id]; n[b.id] = prev && old && billDirty(prev, old) ? prev : fresh[b.id]; } return n; });
      setLoaded(fresh);
    } catch { /* เงียบ — แผงนี้เป็นส่วนเสริม */ }
  }, [voucherId]);
  useEffect(() => { void load(); }, [load]);

  const isDirty = useCallback((billId: string) => !!draft[billId] && !!loaded[billId] && billDirty(draft[billId], loaded[billId]), [draft, loaded]);
  const dirtyIds = useMemo(() => bills.map((b) => b.id).filter((bid) => isDirty(bid)), [bills, isDirty]);

  const parse = async (r2_key: string, gr_id?: string) => {
    setBusy("parse");
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ r2_key, gr_id: gr_id ?? null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const b = j.data as BillRow;
      toast.success(`อ่านใบส่งของแล้ว: ${b.tracking_no ?? "ไม่พบรหัสขนส่ง"} · ${(b.lines ?? []).length} รายการ — ตรวจตัวเลขแล้วจับคู่สินค้า`);
      await load();
      // ข้อเสนอ 1: เลขขนส่งนี้อยู่ในใบอื่นแล้ว → ถามใช้ร่วม
      const d = (j.duplicates ?? []) as { voucher_id: string; pv_no: string | null }[];
      if (d.length) setDupAsk({ billId: b.id, dups: d });
    } catch (e) { toast.error("อ่านไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };
  // ลาก/วาง/เลือกไฟล์เสร็จ = AI อ่านต่อทันที · หลายไฟล์ = ใบละไฟล์ อ่านทีละใบตามคิว
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const readUploaded = (ref: string | null) => {
    if (!ref) return;
    setReading((r) => ({ done: r?.done ?? 0, total: (r?.total ?? 0) + 1 }));
    queueRef.current = queueRef.current.then(() => parse(ref)).then(() =>
      setReading((r) => (!r || r.done + 1 >= r.total ? null : { ...r, done: r.done + 1 })));
  };
  // ลากย้ายแถว — จำลำดับเมื่อกดบันทึก / ใช้น้ำหนัก/คิว
  const drag = useDragReorder((from, to) => {
    const bi = Math.floor(from / ROW_SPAN);
    if (Math.floor(to / ROW_SPAN) !== bi) return;
    const b = bills[bi]; if (!b) return;
    setDraft((p) => { const d = p[b.id]; if (!d) return p; return { ...p, [b.id]: { ...d, lines: moveItem(d.lines, from % ROW_SPAN, to % ROW_SPAN) } }; });
  }, { group: `delivery-bill-${voucherId}` });

  const draftRef = useRef(draft); draftRef.current = draft;
  const billsRef = useRef(bills); billsRef.current = bills;
  const patchBill = async (billId: string, apply: boolean, opts: { quiet?: boolean } = {}): Promise<{ ok: boolean; applied: number }> => {
    const d = draftRef.current[billId]; if (!d) return { ok: false, applied: 0 };
    const b = billsRef.current.find((x) => x.id === billId);
    setBusy(billId);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_id: billId, tracking_no: d.tracking_no, bill_date: d.bill_date || null, lines: d.lines, apply, expected_updated_at: b?.updated_at ?? null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) {
        if (j.stale) toast.action(String(j.error), "โหลดใหม่", () => { setDraft((p) => { const n = { ...p }; delete n[billId]; return n; }); void load(); }, { variant: "error" });
        else throw new Error(j.error ?? `HTTP ${res.status}`);
        return { ok: false, applied: 0 };
      }
      if (!opts.quiet) toast.success(apply ? `ใส่น้ำหนัก/คิวจากใบส่งของให้ ${j.applied} รายการแล้ว` : "บันทึกใบส่งของแล้ว");
      setDraft((p) => { const n = { ...p }; delete n[billId]; return n; });   // บันทึกแล้ว = ใช้ค่าจากเซิร์ฟเวอร์
      await load();
      if (apply) await onApplied();
      return { ok: true, applied: Number(j.applied) || 0 };
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); return { ok: false, applied: 0 }; }
    finally { setBusy(null); }
  };
  const removeBill = async (billId: string) => {
    setBusy(billId);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills?bill_id=${billId}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(j.detached ? "ถอดออกจากใบนี้แล้ว — กล่องของใบนี้ไปอยู่ \"พักไว้\" (ใบอื่นยังใช้บิลนี้อยู่)" : "ถอดใบส่งของแล้ว");
      setDraft((p) => { const n = { ...p }; delete n[billId]; return n; });
      await load();
    } catch (e) { toast.error("ลบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); setRemoveAsk(null); }
  };
  const setLine = (billId: string, idx: number, patch: Partial<DeliveryBillLine>) =>
    setDraft((p) => { const d = p[billId]; if (!d) return p; const ls = d.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)); return { ...p, [billId]: { ...d, lines: ls } }; });
  const setOwner = (billId: string, idx: number, key: string) => {
    if (key === "search") { setSearchFor({ billId, idx }); setPvQ(""); setPvHits([]); return; }
    const c = parseChoiceKey(key); const b = bills.find((x) => x.id === billId);
    if (!c || !b) return;
    setDraft((p) => { const d = p[billId]; if (!d) return p; return { ...p, [billId]: { ...d, lines: d.lines.map((l, i) => (i === idx ? setRowOwner(l, c, b.voucher_id) : l)) } }; });
  };
  const addLine = (billId: string) => setDraft((p) => { const d = p[billId]; if (!d) return p; return { ...p, [billId]: { ...d, lines: [...d.lines, { stock: null, po_no: null, description: null, pack: null, package: null, qty: null, weight_kg: null, m3: null, method: null, voucher_line_ids: [], for_voucher_id: voucherId }] } }; });
  // ข้อเสนอ 3: ลบแถว → แจ้งเตือนมุมจอ มีปุ่มย้อนกลับ (ยังไม่บันทึกจนกด บันทึก)
  const delLine = (billId: string, idx: number) => {
    const d = draft[billId]; const removed = d?.lines[idx]; if (!d || !removed) return;
    setDraft((p) => { const x = p[billId]; if (!x) return p; return { ...p, [billId]: { ...x, lines: x.lines.filter((_, i) => i !== idx) } }; });
    toast.undo(`ลบแถว ${billLineNo(removed.no, idx)}${removed.description ? ` (${removed.description})` : ""} แล้ว — ยังไม่บันทึก กด 💾 บันทึก`, () =>
      setDraft((p) => { const x = p[billId]; if (!x) return p; const ls = [...x.lines]; ls.splice(Math.min(idx, ls.length), 0, removed); return { ...p, [billId]: { ...x, lines: ls } }; }));
  };
  // แถวของใบนี้ในแต่ละบิล (ดัชนีจริง) — กล่องเช็กจำนวนดูเฉพาะแถวของใบนี้
  const mineIdx = useMemo(() => Object.fromEntries(bills.map((b) => [b.id, rowsOf(draft[b.id]?.lines ?? b.lines ?? [], b.voucher_id, voucherId)])), [bills, draft, voucherId]);
  // ★ 2026-11-15 กล่องเช็กจำนวน: ระบบเดาสินค้าให้กล่องที่ยังว่าง → คนกดยืนยันก่อน (ยังไม่บันทึก จนกว่าจะกด บันทึก / ใช้น้ำหนัก/คิว)
  const applySuggest = (sugg: BoxSuggestion[]) => {
    setDraft((p) => {
      const nx = { ...p };
      for (const s of sugg) { const d = nx[s.bill_id]; const real = mineIdx[s.bill_id]?.[s.idx]; if (!d || real == null) continue; nx[s.bill_id] = { ...d, lines: d.lines.map((l, i) => (i === real && l.voucher_line_ids.length === 0 ? { ...l, voucher_line_ids: [s.line_id] } : l)) }; }
      return nx;
    });
    toast.success(`จับคู่ให้ ${sugg.length} กล่องแล้ว — ตรวจแล้วกด บันทึก`);
  };
  // ★ 2026-11-15 จำกฎ Description (เช่น METAL ACCY = กก.) → ใบส่งของครั้งหน้าระบบเลือกให้เอง + เติมกล่องที่ยังว่างในใบที่ยังไม่ได้ใช้
  const rememberRule = async (description: string, method: "cube" | "weight") => {
    const key = normDesc(description); if (!key) return;
    setRemembering(key);
    try {
      const res = await apiFetch("/api/purchasing/freight-descriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: key, method, source: "bill" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const rule: DescRule = { keyword: key, method };
      const next = [rule, ...rules.filter((r) => normDesc(r.keyword) !== key)];
      setRules(next);
      // กล่องที่ยังว่างในแผงนี้ → ใช้กฎทันที (ฝั่งเซิร์ฟเวอร์เติมให้ใบที่ยังไม่ได้ใช้แล้ว)
      setDraft((p) => { const nx = { ...p }; for (const [id, d] of Object.entries(nx)) nx[id] = { ...d, lines: d.lines.map((l) => (!l.method && ruleForDescription(l.description, next) ? { ...l, method: ruleForDescription(l.description, next)!.method } : l)) }; return nx; });
      toast.success(`จำแล้ว: ${key} = ${method === "cube" ? "คิว" : "กก."}${j.backfilled ? ` · เติมให้กล่องที่ยังว่างอีก ${j.backfilled} กล่อง` : ""}`);
    } catch (e) { toast.error("จำกฎไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setRemembering(null); }
  };

  // ── ใช้ร่วม / รับกล่องที่พักไว้ ─────────────────────────────────────────────
  const openShare = (billId: string) => {
    const mine = bills.find((b) => b.id === billId); if (!mine) return;
    const tn = String(mine.tracking_no ?? "").trim().toUpperCase();
    const copies = dups.filter((d) => d.tracking_no === tn && d.lines?.length);
    const target = [...copies].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (!target) { toast.error("ไม่พบใบส่งของเดิมของเลขนี้ — โหลดใหม่แล้วลองอีกครั้ง"); return; }
    // ติ๊กให้ก่อน: กล่องที่ใบนี้จับคู่สินค้าไว้แล้วในใบซ้ำ
    const myLines = draft[billId]?.lines ?? mine.lines ?? [];
    const picked = new Set<number>();
    for (const r of target.lines ?? []) {
      const asLine = { ...r, stock: null, po_no: null, pack: null, package: null, voucher_line_ids: [] } as unknown as DeliveryBillLine;
      const hit = matchCopyRow(myLines, asLine, r.idx);
      if (hit && hit.voucher_line_ids.length > 0) picked.add(r.idx);
    }
    setClaim({ billId: target.bill_id, dropBillId: billId, picked, rows: target.lines ?? [],
      title: `ใช้ร่วมกับ ${target.pv_no ?? "ใบเดิม"}`,
      note: `ใบส่งของ ${tn} อัปโหลดไว้ที่ ${target.pv_no ?? "ใบอื่น"} แล้ว — ติ๊กกล่องที่เป็นของใบนี้ · การจับคู่สินค้าที่ทำไว้ในใบซ้ำของใบนี้จะยกไปให้ · ใบซ้ำของใบนี้จะถูกเอาออก (เก็บไว้ ไม่ลบถาวร)` });
  };
  const openParked = (p: Parked) => setClaim({ billId: p.bill_id, dropBillId: null, picked: new Set(), rows: p.rows,
    title: "รับกล่องที่พักไว้เข้าใบนี้", note: `ใบส่งของ ${p.tracking_no ?? "—"} (${p.bill_date ? formatDate(p.bill_date) : "—"}) จาก ${p.pv_no ?? "ใบอื่น"} — ติ๊กกล่องที่เป็นของใบนี้` });
  const doClaim = async () => {
    if (!claim || claim.picked.size === 0) return;
    setBusy("claim");
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim", bill_id: claim.billId, rows: [...claim.picked], drop_bill_id: claim.dropBillId }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`รับ ${j.claimed} กล่องเข้าใบนี้แล้ว${j.dropped ? " · เอาใบซ้ำของใบนี้ออกแล้ว" : ""} — ตรวจการจับคู่แล้วกด ใช้น้ำหนัก/คิว`);
      if (claim.dropBillId) setDraft((p) => { const n = { ...p }; delete n[claim.dropBillId!]; return n; });
      setClaim(null);
      await load();
    } catch (e) { toast.error("รับเข้าใบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };
  // ค้นใบด้วยเลข PV (ช่อง "ของใบ" → ค้นหาใบอื่น)
  useEffect(() => {
    if (!searchFor) return;
    const q = pvQ.trim(); if (q.length < 3) { setPvHits([]); return; }
    let alive = true;
    const t = setTimeout(() => { apiFetch(`/api/purchasing/vouchers/${voucherId}/bills?pv=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => { if (alive) setPvHits((j.vouchers ?? []) as VOpt[]); }).catch(() => {}); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [pvQ, searchFor, voucherId]);
  const pickSearched = (v: VOpt) => {
    if (!searchFor) return;
    setVouchers((p) => (p.some((x) => x.id === v.id) ? p : [...p, v]));
    setOwner(searchFor.billId, searchFor.idx, `v:${v.id}`);
    setSearchFor(null);
  };

  // ── สถานะให้หน้าใบ (ยังไม่บันทึก · แถวของใบนี้ที่ยังไม่ได้ใช้น้ำหนัก/คิว) ───────────
  const status = useMemo<DeliveryBillStatus>(() => {
    let mineRows = 0, unappliedRows = 0, unmappedRows = 0;
    for (const b of bills) {
      const ls = draft[b.id]?.lines ?? b.lines ?? [];
      const st = appliedFor({ voucher_id: b.voucher_id, status: b.status, lines: b.lines ?? [] }, voucherId);
      const idx = rowsOf(ls, b.voucher_id, voucherId);
      mineRows += idx.length;
      unappliedRows += Math.max(0, st.mine - st.applied);
      unmappedRows += idx.filter((i) => (ls[i].voucher_line_ids ?? []).length === 0).length;
    }
    return { pending: dirtyIds.length > 0, mineRows, unappliedRows, unmappedRows };
  }, [bills, draft, dirtyIds, voucherId]);
  const onStatusRef = useRef(onStatus); onStatusRef.current = onStatus;
  const statusKey = JSON.stringify(status);
  useEffect(() => { onStatusRef.current?.(status); }, [statusKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      pending: () => bills.some((b) => { const d = draftRef.current[b.id], l = loadedRef.current[b.id]; return !!d && !!l && billDirty(d, l); }),
      flush: async () => {
        let ok = true;
        for (const b of billsRef.current) { const d = draftRef.current[b.id], l = loadedRef.current[b.id]; if (d && l && billDirty(d, l)) ok = (await patchBill(b.id, false, { quiet: true })).ok && ok; }
        return ok;
      },
      discard: () => setDraft({ ...loadedRef.current }),
      applyAll: async () => {
        let applied = 0, failed = 0, unmapped = 0;
        for (const b of billsRef.current) {
          const ls = draftRef.current[b.id]?.lines ?? b.lines ?? [];
          const idx = rowsOf(ls, b.voucher_id, voucherId);
          unmapped += idx.filter((i) => (ls[i].voucher_line_ids ?? []).length === 0).length;
          const st = appliedFor({ voucher_id: b.voucher_id, status: b.status, lines: b.lines ?? [] }, voucherId);
          if (st.done || !idx.some((i) => (ls[i].voucher_line_ids ?? []).length > 0)) continue;
          const r = await patchBill(b.id, true, { quiet: true });
          if (r.ok) applied += r.applied; else failed++;
        }
        return { applied, unmapped, failed };
      },
    };
  });   // ทุก render — ใช้ ref ค่าล่าสุดอยู่แล้ว

  const mapLine = mapFor ? draft[mapFor.billId]?.lines[mapFor.idx] : null;
  const usedElsewhere = (billId: string, idx: number, lineId: string) => (draft[billId]?.lines ?? []).some((l, i) => i !== idx && l.voucher_line_ids.includes(lineId));
  const pvLabel = (v: VOpt) => `${v.pv_no ?? "ใบร่าง"}${v.voucher_date ? ` · ${formatDate(v.voucher_date)}` : ""}${v.seller_name ? ` · ${v.seller_name}` : ""}`;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-slate-700">{open ? "▾" : "▸"} 📄 ใบส่งของจากขนส่ง (Delivery Bill) {bills.length > 0 && <span className="font-normal text-slate-400">· {bills.length} ใบ</span>}</button>
        {dirtyIds.length > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">แก้แล้วยังไม่บันทึก {dirtyIds.length} ใบ</span>}
        <span className="text-[11px] text-slate-400">ลากรูป/PDF มาวาง → AI อ่านรหัสขนส่ง + น้ำหนัก/คิวรายกล่อง → เลือกว่ากล่องเป็นของใบไหน → จับคู่สินค้า → ใช้ค่าจริงแทนค่าประเมิน</span>
        <a href="/m/freight-description-rules" target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-sky-700">⚙ กฎ Description</a>
      </div>
      {open && (
        <div className="mt-3 space-y-4">
          {!readonly && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-full max-w-md">
                <FileInput label="รูปหรือ PDF ใบส่งของ" value={null} onChange={readUploaded} folder="delivery-bills" category="supplier_bills" multiple
                  hint="วางแล้ว AI อ่านให้เลย · หลายไฟล์ = ใบละไฟล์ · Ctrl+V ได้ตอนชี้เมาส์ที่กล่องนี้" />
              </div>
              {reading && (
                <span className="h-9 inline-flex items-center gap-1.5 text-sm text-indigo-700"><span className="animate-pulse">⏳</span>
                  กำลังอ่าน {reading.total > 1 ? `ใบที่ ${Math.min(reading.done + 1, reading.total)}/${reading.total}` : ""}…</span>
              )}
              {cands.filter((c) => !bills.some((b) => b.r2_key === c.r2_key)).map((c) => (
                <button key={`${c.gr_id}-${c.kind}`} onClick={() => void parse(c.r2_key, c.gr_id)} disabled={busy === "parse"} title="ไฟล์ที่แนบไว้ตอนรับของ — ให้ AI อ่านได้เลย ไม่ต้องอัปโหลดซ้ำ"
                  className="h-9 px-3 text-xs rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 inline-flex items-center gap-1.5">
                  <HoverPreview url={imgUrl(c.r2_key)} previewW={360}><span className="inline-block w-6 h-6 rounded overflow-hidden bg-white border border-indigo-100 align-middle">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imgUrl(c.r2_key)} alt="" className="w-full h-full object-cover" /></span></HoverPreview>
                  🔍 อ่านจาก{c.kind === "receipt" ? "ใบรับของ" : "บิล"} {c.gr_no}
                </button>
              ))}
            </div>
          )}
          {/* ข้อเสนอ 4: ใบนี้ยังไม่มีใบส่งของ → กล่องที่พักไว้ (ช่วงวันใกล้กัน) อาจเป็นของใบนี้ */}
          {bills.length === 0 && parked.length > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
              <div className="text-sm font-medium text-sky-900">📦 กล่องที่พักไว้ อาจเป็นของใบนี้</div>
              <div className="text-[11px] text-sky-800/80 mb-2">ใบส่งของที่บางกล่องถูกตั้งว่า &ldquo;ยังไม่มีใบ · พักไว้&rdquo; (วันที่ใกล้กัน) — ถ้าเป็นของใบนี้ กดรับเข้าใบได้เลย ไม่ต้องอัปโหลดซ้ำ</div>
              <div className="space-y-1.5">
                {parked.map((p) => (
                  <div key={p.bill_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-white border border-sky-100 px-2.5 py-1.5 text-xs">
                    <span className="font-mono font-semibold text-slate-800 whitespace-nowrap">{p.tracking_no ?? "—"}</span>
                    <span className="text-slate-500 whitespace-nowrap">{p.bill_date ? formatDate(p.bill_date) : ""} · จาก {p.pv_no ?? "ใบอื่น"}</span>
                    <span className="text-slate-600 min-w-0 truncate">{p.rows.length} กล่อง: {p.rows.map((r) => `${r.description ?? "—"}×${r.qty ?? "?"}`).join(", ")}</span>
                    <button disabled={readonly} onClick={() => openParked(p)} title={readonly ? "กด แก้ไขใบ ก่อน" : undefined}
                      className="ml-auto h-7 px-2.5 rounded-md border border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200 disabled:opacity-40 whitespace-nowrap">เลือกกล่องรับเข้าใบนี้</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {bills.length === 0 && <div className="text-xs text-slate-300 text-center py-3 border border-dashed border-slate-200 rounded-lg">— ยังไม่มีใบส่งของ —</div>}
          {/* ★ 2026-11-15 เช็กจำนวน: รวมทุกใบส่งของ (มาหลายรอบ) เทียบกับในใบ → ครบ / ขาด / เกิน / ยังไม่มา · ★ 2026-11-22 เฉพาะกล่องของใบนี้ */}
          <QtyCheckCard lines={lines} readonly={readonly} onSuggest={applySuggest}
            bills={bills.map((b) => { const ls = draft[b.id]?.lines ?? b.lines ?? []; return { id: b.id, tracking_no: (draft[b.id]?.tracking_no || b.tracking_no) ?? null, lines: (mineIdx[b.id] ?? []).map((i) => ls[i]) }; })} />
          {bills.map((b, bi) => {
            const d = draft[b.id] ?? toDraft(b);
            const home = b.voucher_id;
            const isHome = home === voucherId;
            const mine = rowsOf(d.lines, home, voucherId);
            const mapped = mine.filter((i) => d.lines[i].voucher_line_ids.length > 0).length;
            const tot = billTotalsFor(d.lines, home, voucherId);
            const st = appliedFor({ voucher_id: home, status: b.status, lines: b.lines ?? [] }, voucherId);
            const others = otherOwners(d.lines, home).filter((x) => x !== voucherId);
            const tn = String(b.tracking_no ?? "").trim().toUpperCase();
            const copies = isHome ? dups.filter((x) => x.tracking_no === tn) : [];
            const firstCopy = [...copies].sort((x, y) => x.created_at.localeCompare(y.created_at))[0];
            const iAmCopy = !!firstCopy && firstCopy.created_at < b.created_at;
            const dirty = isDirty(b.id);
            const ownerOpts = [...vouchers.filter((v) => v.id !== voucherId)];
            for (const l of d.lines) { const o = rowOwner(l, home); if (o && o !== voucherId && !ownerOpts.some((v) => v.id === o)) ownerOpts.push({ id: o, pv_no: pvOf(o), status: "", voucher_date: null, seller_name: null, why: "linked" }); }
            return (
              <div key={b.id} className={`border rounded-lg overflow-hidden ${dirty ? "border-amber-300" : "border-slate-200"}`}>
                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 flex-wrap">
                  <HoverPreview url={imgUrl(b.r2_key)} previewW={520}>
                    <a href={imgUrl(b.r2_key)} target="_blank" rel="noreferrer" className="block w-12 h-12 rounded overflow-hidden border border-slate-200 bg-white">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imgUrl(b.r2_key)} alt="" className="w-full h-full object-cover" /></a>
                  </HoverPreview>
                  <label className="text-[11px] text-slate-500">รหัสขนส่ง<br /><input value={d.tracking_no} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, [b.id]: { ...d, tracking_no: e.target.value } }))} className={`${inp} w-32 font-mono`} placeholder="EK-########" /></label>
                  <label className="text-[11px] text-slate-500">วันที่ใบ<br /><input type="date" value={d.bill_date} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, [b.id]: { ...d, bill_date: e.target.value } }))} className={`${inp} w-36`} /></label>
                  <div className="text-[11px] text-slate-500">
                    {b.marking ? `Marking ${b.marking} · ` : ""}{b.delivery_area ? `${b.delivery_area} · ` : ""}รวมทั้งบิล {tot.all.boxes} กล่อง · {fmtN(tot.all.kg, 3)} กก. · {fmtN(tot.all.m3, 4)} คิว
                    {!tot.isAllMine && <div className="font-medium text-slate-700">ใบนี้ใช้ {tot.mine.boxes} กล่อง · {fmtN(tot.mine.kg, 3)} กก. · {fmtN(tot.mine.m3, 4)} คิว</div>}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${st.done ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {st.mine === 0 ? "ไม่มีกล่องของใบนี้" : st.done ? `✓ ใช้แล้ว ${b.applied_at ? formatDate(b.applied_at) : ""}` : st.applied > 0 ? `ใช้แล้ว ${st.applied}/${st.mine} กล่อง` : "ยังไม่ได้ใช้"}
                  </span>
                  {!isHome && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-sky-50 text-sky-800 border-sky-200 whitespace-nowrap" title="ใบส่งของเดียวกันนี้อยู่กับใบอื่น · แก้ที่ใบไหนก็เห็นตรงกัน">ใช้ร่วม · บิลอยู่ที่ {pvOf(home)}</span>}
                  {isHome && others.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-sky-50 text-sky-800 border-sky-200 whitespace-nowrap">ใช้ร่วมกับ {others.map((o) => pvOf(o)).join(", ")}</span>}
                  <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                    {dirty && <span className="text-[11px] font-medium text-amber-800">แก้แล้วยังไม่บันทึก — กดบันทึก</span>}
                    {!readonly && <button onClick={() => void patchBill(b.id, false)} disabled={busy === b.id} className={`h-8 px-2.5 text-xs rounded-md border disabled:opacity-40 ${dirty ? "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>💾 บันทึก</button>}
                    {!readonly && <button onClick={() => void patchBill(b.id, true)} disabled={busy === b.id || mapped === 0} title={mapped === 0 ? "จับคู่สินค้าให้กล่องของใบนี้ก่อน" : "เขียนน้ำหนัก/คิวต่อชิ้นลงสินค้าที่จับคู่ (เฉพาะกล่องของใบนี้) + รหัสขนส่งลงหัวใบ"} className="h-8 px-3 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">✓ ใช้น้ำหนัก/คิว ({mapped}/{mine.length})</button>}
                    {!readonly && <button onClick={() => setRemoveAsk(b)} disabled={busy === b.id} title={isHome && others.length === 0 ? "ถอดใบส่งของ" : "ถอดออกจากใบนี้ — กล่องของใบนี้ไปพักไว้ ใบอื่นยังใช้บิลนี้"} className="h-8 w-8 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50">✕</button>}
                  </div>
                </div>
                {/* ข้อเสนอ 1: เลขขนส่งซ้ำกับใบอื่น (อัปโหลดซ้ำ) */}
                {copies.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[11px] bg-amber-50 border-t border-amber-200 text-amber-900">
                    {iAmCopy ? <>
                      <span>⚠ ใบส่งของ {tn} อยู่ใน {firstCopy.pv_no ?? "ใบอื่น"} แล้ว (อัปโหลดซ้ำ) — ใช้ร่วมกันดีกว่า ค่าส่งจะไม่ซ้ำ</span>
                      {!readonly && <button onClick={() => openShare(b.id)} className="h-7 px-2.5 rounded-md border border-amber-400 bg-white text-amber-900 hover:bg-amber-100 font-medium whitespace-nowrap">ใช้ร่วมกับ {firstCopy.pv_no ?? "ใบเดิม"}</button>}
                      {readonly && <span className="text-amber-700">(กด แก้ไขใบ ก่อน)</span>}
                    </> : <span>ⓘ ใบส่งของเลขนี้อัปโหลดไว้ใน {copies.map((c) => c.pv_no ?? "ใบอื่น").join(", ")} ด้วย — ใบนี้เป็นใบแรก ให้ใบนั้นกด &ldquo;ใช้ร่วม&rdquo; หรือเลือกช่อง &ldquo;ของใบ&rdquo; ที่นี่ว่ากล่องไหนเป็นของใบไหน</span>}
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 bg-white border-b border-slate-100">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium w-12" title="บรรทัดที่เท่าไรในใบ (บนกระดาษ) · ลากหูจับเพื่อย้ายแถว">#</th>
                        <th className="text-left px-2 py-1.5 font-medium" title="กล่องนี้เป็นของใบสำคัญไหน — ใบอื่นจะเห็นใบส่งของนี้เอง ไม่ต้องอัปโหลดซ้ำ">ของใบ</th>
                        <th className="text-left px-2 py-1.5 font-medium">Stock</th>
                        <th className="text-left px-2 py-1.5 font-medium">P/o.No</th>
                        <th className="text-left px-2 py-1.5 font-medium">Description</th>
                        <th className="text-right px-2 py-1.5 font-medium">Pack</th>
                        <th className="text-left px-2 py-1.5 font-medium">Package</th>
                        <th className="text-right px-2 py-1.5 font-medium">Qty</th>
                        <th className="text-right px-2 py-1.5 font-medium">Weight (กก.)</th>
                        <th className="text-right px-2 py-1.5 font-medium">M3 (คิว)</th>
                        <th className="text-left px-2 py-1.5 font-medium" title="เลือกอัตโนมัติจากกฎ Description (BOX = คิว, CLOTH BLOCK = น้ำหนัก) แก้ได้">คิดค่าส่งจาก</th>
                        <th className="text-left px-2 py-1.5 font-medium">สินค้าที่จับคู่</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {d.lines.map((l, i) => {
                        const owner = rowOwner(l, home);
                        const isMine = owner === voucherId;
                        const names = isMine ? (l.voucher_line_ids.map((id) => lines.find((x) => x.id === id)).filter(Boolean) as VoucherLineLite[]) : [];
                        const dk = bi * ROW_SPAN + i;
                        const descKey = normDesc(l.description);
                        const rule = ruleForDescription(l.description, rules);
                        const ck = choiceKey(l, home);
                        return (
                          <tr key={i} {...drag.rowProps(dk)} className={`${!isMine ? "bg-slate-50/80 text-slate-400" : l.voucher_line_ids.length === 0 ? "bg-amber-50/30" : ""} ${drag.rowCls(dk)}`}>
                            <td className="px-2 py-1 whitespace-nowrap">
                              {!readonly && <DragHandle {...drag.handleProps(dk)} title="ลากเพื่อย้ายแถว" className="text-base align-middle" />}
                              <span className="font-mono text-[11px] text-slate-400 align-middle ml-0.5">{billLineNo(l.no, i)}</span>
                            </td>
                            <td className="px-2 py-1">
                              <select value={ck} disabled={readonly || (!!l.applied_at && !isMine)} onChange={(e) => setOwner(b.id, i, e.target.value)}
                                title={l.applied_at && !isMine ? "ใบนั้นใช้น้ำหนัก/คิวของกล่องนี้ไปแล้ว — เปลี่ยนที่ใบนั้น" : "กล่องนี้เป็นของใบสำคัญไหน"}
                                className={`${inp} w-36 ${isMine ? "border-emerald-300 bg-emerald-50 text-emerald-900" : l.hold === "not_ours" ? "border-slate-200 text-slate-400" : l.hold === "parked" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-indigo-200 bg-indigo-50 text-indigo-800"}`}>
                                <option value={`v:${voucherId}`}>ใบนี้</option>
                                {ownerOpts.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.pv_no ?? "ใบร่าง"}{v.why === "same_tracking" ? " · เลขขนส่งเดียวกัน" : ""}</option>)}
                                <option value="parked">ยังไม่มีใบ · พักไว้</option>
                                <option value="not_ours">ไม่ใช่ของเรา</option>
                                <option value="search">ค้นหาเลข PV อื่น…</option>
                              </select>
                            </td>
                            <td className="px-2 py-1"><input value={l.stock ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { stock: e.target.value })} className={`${inp} w-24 font-mono`} /></td>
                            <td className="px-2 py-1"><input value={l.po_no ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { po_no: e.target.value })} className={`${inp} w-28 font-mono`} /></td>
                            <td className="px-2 py-1"><input value={l.description ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { description: e.target.value })} className={`${inp} w-28`} /></td>
                            <td className="px-2 py-1"><input type="number" step="any" value={l.pack ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { pack: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-14 text-right`} /></td>
                            <td className="px-2 py-1"><input value={l.package ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { package: e.target.value })} className={`${inp} w-16`} /></td>
                            <td className="px-2 py-1"><input type="number" step="any" value={l.qty ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { qty: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-16 text-right`} /></td>
                            <td className="px-2 py-1"><input type="number" step="any" value={l.weight_kg ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { weight_kg: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-20 text-right`} /></td>
                            <td className="px-2 py-1"><input type="number" step="any" value={l.m3 ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { m3: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-20 text-right`} /></td>
                            <td className="px-2 py-1">
                              <select value={l.method ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { method: (e.target.value || null) as "cube" | "weight" | null })}
                                title={rule ? `กฎ Description: "${rule.keyword}" = ${rule.method === "cube" ? "คิว" : "กก."}` : "Description นี้ยังไม่มีกฎ — เลือกแล้วกด \"จำ\" ครั้งหน้าระบบเลือกให้เอง"}
                                className={`${inp} w-28 ${l.method === "cube" ? "bg-sky-50 border-sky-200" : l.method === "weight" ? "bg-violet-50 border-violet-200" : "border-amber-300"}`}>
                                <option value="">ตามใบ</option>
                                <option value="cube">📦 คิว (M3)</option>
                                <option value="weight">⚖️ น้ำหนัก (kg)</option>
                              </select>
                              {/* ★ 2026-11-15 ทะเบียน Description: ยังไม่มีกฎ + เลือกแล้ว = ปุ่มจำ · มีกฎแต่กล่องยังว่าง = ปุ่มใช้ตามกฎ */}
                              {!readonly && descKey && l.method && !rule && (
                                <button type="button" disabled={remembering === descKey} onClick={() => void rememberRule(descKey, l.method as "cube" | "weight")}
                                  title={`บันทึกเป็นกฎกลาง: ${descKey} = ${l.method === "cube" ? "คิว" : "กก."} — ใบส่งของครั้งหน้าระบบเลือกให้เอง (แก้ได้ที่ ⚙ กฎ Description)`}
                                  className="block mt-0.5 text-[10px] text-sky-700 hover:underline disabled:opacity-50 whitespace-nowrap">{remembering === descKey ? "กำลังจำ…" : `จำ: ${descKey} = ${l.method === "cube" ? "คิว" : "กก."}`}</button>
                              )}
                              {!readonly && !l.method && rule && (
                                <button type="button" onClick={() => setLine(b.id, i, { method: rule.method })} title={`กฎ "${rule.keyword}" = ${rule.method === "cube" ? "คิว" : "กก."} (ตั้งไว้หลังอ่านใบนี้)`}
                                  className="block mt-0.5 text-[10px] text-sky-700 hover:underline whitespace-nowrap">ใช้ตามกฎ: {rule.method === "cube" ? "คิว" : "กก."}</button>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              {isMine ? (
                                <button disabled={readonly} onClick={() => setMapFor({ billId: b.id, idx: i })} className={`h-8 px-2 rounded-md border text-left max-w-[16rem] truncate ${names.length ? "border-sky-200 bg-sky-50 text-sky-800" : "border-amber-300 bg-amber-50 text-amber-700"} disabled:opacity-70`} title={names.map((n) => `${n.code || ""} ${stripCode(n.item_name)}`).join("\n") || "ยังไม่ได้จับคู่"}>
                                  {names.length === 0 ? "＋ เลือกสินค้าในกล่องนี้" : `${names.length} ตัว: ${names.map((n) => n.code || stripCode(n.item_name)).join(", ")}`}
                                </button>
                              ) : (
                                <span className="text-[11px] whitespace-nowrap">{l.hold === "parked" ? "พักไว้ — ยังไม่ลงใบไหน" : l.hold === "not_ours" ? "ไม่ใช่ของเรา" : `จับคู่ที่ ${pvOf(owner)}${l.applied_at ? " · ใช้แล้ว" : ""}`}</span>
                              )}
                            </td>
                            <td className="px-1 py-1 text-center">{!readonly && <button onClick={() => delLine(b.id, i)} title="ลบแถว (ย้อนกลับได้จากแจ้งเตือน · ยังไม่บันทึกจนกด บันทึก)" className="text-slate-300 hover:text-red-600">✕</button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!readonly && <button onClick={() => addLine(b.id)} className="w-full h-7 text-[11px] text-sky-700 hover:bg-sky-50 border-t border-slate-100">+ เพิ่มแถว (AI อ่านตกหล่น)</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ป๊อปจับคู่: บรรทัดในใบส่งของ ↔ สินค้าในใบสำคัญ (เลือกได้หลายตัว) */}
      {mapFor && mapLine && (
        <ERPModal open onClose={() => setMapFor(null)} size="md" storageKey="pv-bill-map"
          title="จับคู่สินค้ากับกล่องนี้" description={`${mapLine.description ?? "—"} · P/o.No ${mapLine.po_no ?? "—"} · Qty ${mapLine.qty ?? "—"} · ${mapLine.weight_kg ?? "—"} กก. · ${mapLine.m3 ?? "—"} คิว`}
          footer={<>
            <button onClick={() => setLine(mapFor.billId, mapFor.idx, { voucher_line_ids: lines.map((l) => l.id) })} className="mr-auto h-9 px-3 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">เลือกทั้งหมด</button>
            <button onClick={() => setMapFor(null)} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">เสร็จ</button>
          </>}>
          <p className="text-[11px] text-slate-400 mb-2">น้ำหนัก/คิวของกล่องจะถูกหารด้วยจำนวนชิ้นรวมของสินค้าที่เลือก (ถือว่าทุกชิ้นในกล่องหนัก/ใหญ่เท่ากัน)</p>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
            {lines.map((vl) => {
              const on = mapLine.voucher_line_ids.includes(vl.id);
              const elsewhere = usedElsewhere(mapFor.billId, mapFor.idx, vl.id);
              return (
                <label key={vl.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${on ? "bg-sky-50" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={on} onChange={(e) => setLine(mapFor.billId, mapFor.idx, { voucher_line_ids: e.target.checked ? [...mapLine.voucher_line_ids, vl.id] : mapLine.voucher_line_ids.filter((x) => x !== vl.id) })} className="rounded border-slate-300" />
                  <span className="font-mono text-xs text-slate-500 w-24 shrink-0 truncate">{vl.code || "—"}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-800" title={vl.item_name}>{stripCode(vl.item_name)}</span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">{vl.qty.toLocaleString()} {vl.uom ?? ""}</span>
                  {elsewhere && <span className="text-[10px] text-indigo-500 shrink-0" title="สินค้านี้อยู่ในกล่องอื่นด้วย (น้ำหนัก/คิวจะรวมกัน)">อยู่กล่องอื่นด้วย</span>}
                </label>
              );
            })}
          </div>
        </ERPModal>
      )}

      {/* ใช้ร่วม / รับกล่องที่พักไว้: ติ๊กกล่องที่เป็นของใบนี้ */}
      {claim && (
        <ERPModal open onClose={() => busy !== "claim" && setClaim(null)} size="md" storageKey="pv-bill-claim" title={claim.title} description={claim.note}
          footer={<>
            <button onClick={() => setClaim(null)} disabled={busy === "claim"} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void doClaim()} disabled={busy === "claim" || claim.picked.size === 0} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {busy === "claim" ? "กำลังบันทึก…" : `รับ ${claim.picked.size} กล่องเข้าใบนี้${claim.dropBillId ? " + เอาใบซ้ำออก" : ""}`}</button>
          </>}>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
            {claim.rows.map((r) => {
              const lock = !!r.applied && !!r.owner && r.owner !== voucherId;
              const on = claim.picked.has(r.idx);
              return (
                <label key={r.idx} className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-sm ${lock ? "opacity-50" : "cursor-pointer"} ${on ? "bg-sky-50" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" disabled={lock} checked={on} onChange={(e) => setClaim((c) => { if (!c) return c; const s = new Set(c.picked); if (e.target.checked) s.add(r.idx); else s.delete(r.idx); return { ...c, picked: s }; })} className="rounded border-slate-300" />
                  <span className="font-mono text-[11px] text-slate-400 w-6">{billLineNo(r.no, r.idx)}</span>
                  <span className="font-medium text-slate-800">{r.description ?? "—"}</span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">Qty {r.qty ?? "—"} · {r.weight_kg ?? "—"} กก. · {r.m3 ?? "—"} คิว</span>
                  {r.owner !== undefined && <span className="ml-auto text-[10px] text-slate-500 whitespace-nowrap">{r.owner === null ? "พักไว้/ไม่ใช่ของเรา" : r.owner === voucherId ? "ของใบนี้อยู่แล้ว" : `ตอนนี้: ${pvOf(r.owner)}`}{lock ? " · ใช้แล้ว" : ""}</span>}
                </label>
              );
            })}
          </div>
        </ERPModal>
      )}

      {/* ข้อเสนอ 1: อัปโหลดแล้วเลขขนส่งซ้ำกับใบอื่น */}
      {dupAsk && (
        <ERPModal open onClose={() => setDupAsk(null)} size="sm" storageKey="pv-bill-dup" title="ใบส่งของนี้อยู่ในใบอื่นแล้ว — ใช้ร่วมกันไหม?"
          description={`เลขขนส่งเดียวกันอยู่ใน ${dupAsk.dups.map((x) => x.pv_no ?? "ใบอื่น").join(", ")}`}
          footer={<>
            <button onClick={() => setDupAsk(null)} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ไม่ใช่ · เก็บแยก</button>
            <button onClick={() => { const bid = dupAsk.billId; setDupAsk(null); openShare(bid); }} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ใช้ร่วม</button>
          </>}>
          <p className="text-sm text-slate-600">ของรอบเดียวกันมักมากับใบส่งของใบเดียว — <b>ใช้ร่วม</b> = ไม่สร้างบิลซ้ำ แค่เลือกกล่องที่เป็นของใบนี้ (ค่าส่งไม่ถูกคิดซ้ำ)</p>
          <p className="text-[11px] text-slate-400 mt-1.5">กด ไม่ใช่ = เก็บใบที่เพิ่งอ่านไว้ในใบนี้ตามปกติ (เปลี่ยนใจทีหลังได้ที่ปุ่ม &ldquo;ใช้ร่วมกับ…&rdquo; บนใบส่งของ)</p>
        </ERPModal>
      )}

      {/* ช่อง "ของใบ" → ค้นหาเลข PV อื่น */}
      {searchFor && (
        <ERPModal open onClose={() => setSearchFor(null)} size="sm" storageKey="pv-bill-owner-search" title="กล่องนี้เป็นของใบไหน?" description="พิมพ์เลข PV อย่างน้อย 3 ตัว เช่น 11-21 หรือ PV2026-11"
          footer={<button onClick={() => setSearchFor(null)} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>}>
          <input autoFocus value={pvQ} onChange={(e) => setPvQ(e.target.value)} placeholder="ค้นหาเลข PV…" className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg mb-2" />
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[45vh] overflow-y-auto">
            {pvHits.length === 0 && <div className="px-3 py-3 text-xs text-slate-400 text-center">{pvQ.trim().length < 3 ? "พิมพ์อย่างน้อย 3 ตัว" : "ไม่พบใบที่ตรงกัน"}</div>}
            {pvHits.map((v) => (
              <button key={v.id} onClick={() => pickSearched(v)} className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50">{pvLabel(v)}</button>
            ))}
          </div>
        </ERPModal>
      )}

      <ConfirmDialog open={!!removeAsk} onClose={() => busy !== removeAsk?.id && setRemoveAsk(null)} onConfirm={() => removeAsk && void removeBill(removeAsk.id)} loading={!!removeAsk && busy === removeAsk.id}
        title={removeAsk && (removeAsk.voucher_id !== voucherId || otherOwners(removeAsk.lines ?? [], removeAsk.voucher_id).some((x) => x !== voucherId)) ? "ถอดใบส่งของออกจากใบนี้?" : "ถอดใบส่งของ?"}
        message={removeAsk && (removeAsk.voucher_id !== voucherId || otherOwners(removeAsk.lines ?? [], removeAsk.voucher_id).some((x) => x !== voucherId))
          ? `ใบอื่นยังใช้ใบส่งของ ${removeAsk.tracking_no ?? ""} อยู่ — กล่องของใบนี้จะไปอยู่ "พักไว้" (รับกลับเข้าใบได้ภายหลัง) บิลไม่ถูกลบ`
          : `ใบส่งของ ${removeAsk?.tracking_no ?? ""} จะถูกถอดออก (เก็บไว้ ไม่ลบถาวร) · น้ำหนัก/คิวที่ใส่ลงสินค้าไปแล้วยังอยู่`}
        confirmText="ถอดออก" cancelText="ยกเลิก" variant="danger" />
    </div>
  );
}
