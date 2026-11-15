"use client";

/**
 * SellerBillPanel (ของกลาง) — "บิลจากร้าน (ภาษาจีน)" ในใบสำคัญรับ
 *   อัปโหลดรูป/PDF บิลร้าน → AI อ่านชื่อจีน + แปลไทย + จำนวน + ราคา ¥ → จับคู่กับบรรทัดใบสั่งซื้อ "ของร้านนี้เท่านั้น"
 *   → คนเช็กทีละแถว (ใช่ / เปลี่ยน / เลือกจับคู่เอง / ข้าม) → ใส่ลงใบสำคัญ (ผูก PO + ราคาจากบิล) + จำคู่ไว้ครั้งหน้า
 * ใช้: <SellerBillPanel voucherId readonly onApplied bare? />  (bare = ไม่มีกรอบ/หัวพับในตัว ใช้ในกล่องพับของหน้า) · API /api/purchasing/vouchers/<id>/seller-bills
 * กติกาจับคู่: lib/seller-bill-match.ts · เอกสาร docs/seller-bill-match.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { FileInput } from "@/components/file-input";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { billLineNo } from "@/lib/bill-line-order";
import { HoverPreview } from "@/components/hover-image";
import { useFileRefUrls } from "@/components/file-ref";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { isPdfRef } from "@/lib/file-ref";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { applyGroupToLine, checkBillMath, undecidedCount, shortfallOf, missingGroups, pendingReceiveOf, reducePlan, outsidePoLines, otherShopHint, roundsOf, autoSplitRounds, ensureRowIds, allocOf, editAlloc, addAllocRound, rebalanceAlloc, mergeSplitRows, expandAllocRows, normalizeBillLine, billLineDiscount, type PoGroup, type SellerBillLine } from "@/lib/seller-bill-match";
import { SaveBar } from "@/components/save-bar";
import { BillSummaryBox } from "./bill-summary";
import { emptySummary, type BillSummary } from "@/lib/seller-bill-summary";

/** ลากย้ายแถว: หลายบิลในแผงเดียวใช้ตัวลากตัวเดียว → ดัชนี = ลำดับบิล × ROW_SPAN + ลำดับแถว (ลากข้ามบิลไม่ได้) */
const ROW_SPAN = 10000;

/** งานแก้ใบสั่งซื้อจากหน้านี้ (ผ่าน API กลาง po-edit / cancel-line) — ย้าย PO ทำ "ก่อน" ใส่ลงใบ · ลด/ปิดยอด ทำ "หลัง" */
type PoPlan = {
  billId: string;
  moves: { po_id: string; po_no: string; from_name: string | null }[];
  edits: { po_id: string; po_no: string; line_qty: { id: string; qty: number }[] }[];
  close: string[];
  reduceLabels: string[];
  closeLabels: string[];
  reason: string;
};
type PickTab = "this" | "other" | "sku";

type Bill = {
  id: string; r2_key: string; gr_id: string | null; bill_no: string | null; bill_date: string | null; seller_text: string | null;
  total_amount: number | null; currency: string | null; lines: SellerBillLine[]; status: string; applied_at: string | null; created_at: string;
  raw?: { files?: string[] } | null;   // บิลหลายหน้า (โยนรูปจากป๊อปออกใบสำคัญ) — r2_key = หน้าแรก
  summary?: BillSummary | null;        // ★ 2026-11-15 สรุปยอดบิล (付款详情) — lib/seller-bill-summary
};
type Candidate = { gr_id: string; gr_no: string; kind: "receipt" | "bill"; r2_key: string };

const n2 = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));
const inp = "h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white text-right tabular-nums disabled:bg-transparent disabled:border-transparent disabled:text-slate-700";
const chip = "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap";
const CHIP_OK = `${chip} bg-emerald-50 text-emerald-700 border-emerald-200`;
const CHIP_WARN = `${chip} bg-amber-50 text-amber-700 border-amber-200`;
const CHIP_NEU = `${chip} bg-slate-50 text-slate-600 border-slate-200`;

function LevelBadge({ l }: { l: SellerBillLine }) {
  if (l.level === "fee") return <span className={CHIP_NEU}>ไม่ใช่สินค้า</span>;
  if (!l.match_key && l.sku_pick) return <span className={CHIP_WARN}>เลือกเอง · นอกใบสั่งซื้อ</span>;
  if (!l.match_key) return <span className={`${chip} bg-red-50 text-red-700 border-red-200`}>ไม่เจอใน PO ร้านนี้</span>;
  if (l.move_po) return <span className={`${chip} bg-blue-50 text-blue-700 border-blue-200`}>เลือกเอง · PO ร้านอื่น</span>;
  if (l.manual) return <span className={`${chip} bg-blue-50 text-blue-700 border-blue-200`}>เลือกเอง</span>;
  const pct = Math.round((l.score || 0) * 100);
  return l.level === "ok" ? <span className={CHIP_OK}>มั่นใจ {pct}%</span> : <span className={CHIP_WARN}>ให้เช็ก {pct}%</span>;
}

export function SellerBillPanel({ voucherId, readonly, onApplied, bare = false }: {
  voucherId: string; readonly: boolean; onApplied: () => void | Promise<void>;
  /** bare = ไม่มีกรอบการ์ด + หัวพับในตัว (หน้าที่ห่อด้วยกล่องพับของตัวเองอยู่แล้ว) — แสดงเนื้อเลย */
  bare?: boolean;
}) {
  const toast = useToast();
  const [bills, setBills] = useState<Bill[]>([]);
  const [groups, setGroups] = useState<PoGroup[]>([]);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [hasPartner, setHasPartner] = useState(true);
  const [draft, setDraft] = useState<Record<string, SellerBillLine[]>>({});
  const [busy, setBusy] = useState<string | null>(null);   // "parse" | bill id
  const [remember, setRemember] = useState(true);
  const [fillCn, setFillCn] = useState(true);
  const [open, setOpen] = useState(true);
  const [pickFor, setPickFor] = useState<{ billId: string; idx: number } | null>(null);
  const [pickQ, setPickQ] = useState("");
  const [delBill, setDelBill] = useState<Bill | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  // "ไม่อยู่ในบิล": ต่อบิล → กลุ่ม PO → รอรอบหน้า (ค่าเริ่ม) / ปิดยอด · ขอบเขต PO เดียวกับบิล / ทั้งร้าน
  const [missAct, setMissAct] = useState<Record<string, Record<string, "wait" | "close">>>({});
  const [missScope, setMissScope] = useState<Record<string, "bill" | "shop">>({});
  const [poPlan, setPoPlan] = useState<PoPlan | null>(null);
  // ป๊อปเลือกจับคู่เอง 3 แท็บ: PO ร้านนี้ / PO ร้านอื่น / สินค้าทั้งหมด
  const [pickTab, setPickTab] = useState<PickTab>("this");
  const [pickAsk, setPickAsk] = useState<PoGroup | null>(null);       // PO ร้านอื่นที่กดเลือก → ถาม ย้าย PO / ใช้แค่รหัส
  const [pickSku, setPickSku] = useState<SkuPickerValue | null>(null);
  const [backfill, setBackfill] = useState(true);                       // เปิด PO ย้อนหลังให้รายการนอกใบสั่งซื้อ
  const [voucher, setVoucher] = useState<{ seller_name: string | null; seller_partner_id: string | null; currency: string } | null>(null);
  const [otherGroups, setOtherGroups] = useState<PoGroup[] | null>(null);
  const [pctRows, setPctRows] = useState<Set<string>>(new Set());   // ★ 2026-11-14 แถวที่ใส่ส่วนลดเป็น % (ยังไม่มีค่าก็จำโหมดไว้)
  const fileUrls = useFileRefUrls([...cands.map((c) => c.r2_key), ...bills.flatMap((b) => [b.r2_key, ...(b.raw?.files ?? [])])]);
  const gByKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);
  const otherByKey = useMemo(() => new Map((otherGroups ?? []).map((g) => [g.key, g])), [otherGroups]);
  const gAny = (key: string | null | undefined) => (key ? gByKey.get(key) ?? otherByKey.get(key) : undefined);
  // ★ 2026-11-14 ป้าย PO ในแถว (แถวเดียวลงหลาย PO — ของที่สั่ง 2 รอบแต่ส่งพร้อมกัน): แก้จำนวน / เพิ่ม PO / เอา PO ออก
  //   ของกลาง editAlloc / addAllocRound — จำนวนรวมทุก PO = จำนวนในบิลเสมอ · แก้เองแล้ว = manual (แบ่งอัตโนมัติไม่ทับ)
  const allocSet = (billId: string, idx: number, key: string, qty: number) => setLines(billId, (ls) => ls.map((l, i) => (i === idx ? editAlloc(l, key, "set", qty) : l)));
  const allocRemove = (billId: string, idx: number, key: string) => setLines(billId, (ls) => ls.map((l, i) => (i === idx ? editAlloc(l, key, "remove") : l)));
  const allocAdd = (billId: string, idx: number, key: string) => setLines(billId, (ls) => ls.map((l, i) => (i === idx ? addAllocRound(l, key, groups) : l)));
  /** ★ 2026-11-14 ลบแถว (AI อ่านผิด/ซ้ำ) — ลบทันที กด "เลิกทำ" ได้ 5 วิ · แถวที่ใส่ลงใบแล้วลบไม่ได้ (รายการในใบจะค้าง) */
  const removeRow = (billId: string, idx: number) => {
    const row = (draft[billId] ?? [])[idx]; if (!row) return;
    setLines(billId, (ls) => ls.filter((_, i) => i !== idx));
    toast.action(`ลบแถว ${row.no ? `#${row.no}` : "ที่เพิ่มเอง"} (${row.name_cn || row.name_th || "—"}) แล้ว`, "เลิกทำ",
      () => setLines(billId, (ls) => { const nx = [...ls]; nx.splice(Math.min(idx, nx.length), 0, row); return nx; }), { ms: 5000, variant: "info" });
  };
  /** ★ 2026-11-14 ลากย้ายแถว (เจ้าของขอ "อยากให้เราย้ายเองได้") — บันทึกอัตโนมัติ */
  const drag = useDragReorder((from, to) => {
    const bi = Math.floor(from / ROW_SPAN);
    if (Math.floor(to / ROW_SPAN) !== bi) return;   // ลากข้ามบิลไม่ได้
    const b = bills[bi]; if (!b) return;
    setLines(b.id, (ls) => moveItem(ls, from % ROW_SPAN, to % ROW_SPAN));
  }, { group: `seller-bill-${voucherId}` });
  // ★ 2026-11-14 บันทึกร่างอัตโนมัติ (เจ้าของ: "refresh ต้องบันทึก draft ไว้ กันหาย") — แก้แล้วรอ 2 วิ ค่อยส่ง · แถบสถานะ = ของกลาง SaveBar (mode auto)
  const draftRef = useRef(draft); draftRef.current = draft;
  // ★ 2026-11-15 สรุปยอดบิล (付款详情) ต่อบิล — แก้แล้วบันทึกอัตโนมัติพร้อมแถว
  const [sums, setSums] = useState<Record<string, BillSummary>>({});
  const sumsRef = useRef(sums); sumsRef.current = sums;
  const [rereading, setRereading] = useState<string | null>(null);
  const onAppliedRef = useRef(onApplied); onAppliedRef.current = onApplied;
  const dirtyBills = useRef(new Set<string>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [auto, setAuto] = useState<{ pending: boolean; saving: boolean; at: Date | null; err: string | null }>({ pending: false, saving: false, at: null, err: null });
  const flushSave = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const ids = [...dirtyBills.current]; if (!ids.length) return;
    dirtyBills.current.clear();
    setAuto((s) => ({ ...s, saving: true, pending: false }));
    try {
      let synced = false;
      for (const id of ids) {
        const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills`, { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bill_id: id, lines: draftRef.current[id] ?? [], autosave: true, ...(sumsRef.current[id] ? { summary: sumsRef.current[id] } : {}) }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
        if (j.synced) synced = true;
      }
      if (synced) void onAppliedRef.current();   // บิลที่ใส่ลงใบแล้ว + แก้สรุปยอด → หัวใบเปลี่ยน (ค่าส่งในจีน/ค่าธรรมเนียม/เรท) → โหลดใบใหม่
      setAuto({ pending: dirtyBills.current.size > 0, saving: false, at: new Date(), err: null });
    } catch (e) {
      ids.forEach((id) => dirtyBills.current.add(id));
      setAuto((s) => ({ ...s, saving: false, pending: true, err: String((e as Error).message ?? e) }));
    }
  }, [voucherId]);
  const markDirty = (billId: string) => {
    if (readonly) return;
    dirtyBills.current.add(billId);
    setAuto((s) => ({ ...s, pending: true }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(), 2000);
  };
  useEffect(() => () => { if (dirtyBills.current.size) void flushSave(); }, [flushSave]);   // ออกจากหน้า (ในเว็บ) = ส่งที่ค้างก่อน
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  /** ★ 2026-11-14 ลาก/วาง/เลือกไฟล์เสร็จ = ให้ AI อ่านต่อทันที (ไม่ต้องกดปุ่ม) · หลายไฟล์ = บิลละไฟล์ อ่านทีละใบตามคิว */
  const readUploaded = (ref: string | null) => {
    if (!ref) return;
    setReading((r) => ({ done: r?.done ?? 0, total: (r?.total ?? 0) + 1 }));
    queueRef.current = queueRef.current.then(() => parse(ref)).then(() =>
      setReading((r) => (!r || r.done + 1 >= r.total ? null : { ...r, done: r.done + 1 })));
  };
  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills`).then((r) => r.json());
      const rows = (j.data ?? []) as Bill[];
      setBills(rows); setGroups((j.groups ?? []) as PoGroup[]); setCands((j.candidates ?? []) as Candidate[]); setHasPartner(j.has_partner !== false);
      if (j.voucher) setVoucher(j.voucher);
      // บิลที่เคยแตกแถวลงหลาย PO (รอบก่อน) → รวมกลับเป็นแถวเดียว (mergeSplitRows) แล้วบันทึกให้เอง
      const merged: string[] = [];
      const add: Record<string, SellerBillLine[]> = {};
      for (const b of rows) if (!draftRef.current[b.id]) {
        const m = mergeSplitRows(b.lines ?? []);
        add[b.id] = m;
        if (m.length !== (b.lines ?? []).length) merged.push(b.id);
      }
      setDraft((p) => { const nx = { ...p }; for (const [k, v] of Object.entries(add)) if (!nx[k]) nx[k] = v; return nx; });
      setSums((p) => { const nx = { ...p }; for (const b of rows) if (!nx[b.id]) nx[b.id] = b.summary ?? emptySummary(); return nx; });
      draftRef.current = { ...draftRef.current, ...add };   // ให้บันทึกอัตโนมัติเห็นแถวที่รวมแล้วทันที
      if (merged.length && !readonly) { merged.forEach((id) => dirtyBills.current.add(id)); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => void flushSave(), 2000); }
    } catch { /* แผงเสริม — เงียบ */ }
  }, [voucherId, readonly, flushSave]);
  useEffect(() => { void load(); }, [load]);
  // PO ร้านอื่น: โหลดเมื่อมีแถวที่ไม่เจอ (ไว้ใบ้) หรือเมื่อเปิดแท็บ ②
  const loadOther = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills?other=1`).then((r) => r.json());
      setOtherGroups((j.other_groups ?? []) as PoGroup[]);
    } catch { setOtherGroups([]); }
  }, [voucherId]);
  const hasUnmatched = Object.values(draft).some((ls) => ls.some((l) => !l.is_fee && !l.match_key && !l.sku_pick && !l.decision));
  useEffect(() => { if (otherGroups == null && (hasUnmatched || (pickFor && pickTab === "other"))) void loadOther(); }, [hasUnmatched, pickFor, pickTab, otherGroups, loadOther]);

  /** แก้แถวของบิล (ทุกการแก้จากผู้ใช้ผ่านตัวนี้) → บันทึกอัตโนมัติใน 2 วิ */
  const setLines = (billId: string, fn: (ls: SellerBillLine[]) => SellerBillLine[]) => { setDraft((p) => ({ ...p, [billId]: fn(p[billId] ?? []) })); setMsg((m) => ({ ...m, [billId]: "" })); markDirty(billId); };
  const setLine = (billId: string, idx: number, patch: Partial<SellerBillLine>) => setLines(billId, (ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  // ★ 2026-11-15 สรุปยอดบิล: แก้ช่อง → บันทึกอัตโนมัติ · ติ๊ก "ราคาในแถวหักแล้ว" = ล้างส่วนลดแถว (กันหักซ้ำ)
  const setSum = (billId: string, patch: Partial<BillSummary>) => {
    setSums((p) => ({ ...p, [billId]: { ...(p[billId] ?? emptySummary()), ...patch } }));
    if (patch.discount_in_price === true) setLines(billId, (ls) => ls.map((l) => (!l.is_fee && (l.discount != null || l.discount_pct != null) ? { ...l, discount: null, discount_pct: null } : l)));
    else markDirty(billId);
  };
  const rereadSummary = async (billId: string) => {
    setRereading(billId);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bill_id: billId, reread_summary: true }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.summary) { setSums((p) => ({ ...p, [billId]: j.summary as BillSummary })); toast.success("AI อ่านสรุปยอดบิลแล้ว — ตรวจตัวเลขก่อนใส่ลงใบ"); void onAppliedRef.current(); }
      else toast.error(j.error ?? "ไม่เจอกล่องสรุปยอดในบิลนี้ — ใส่ยอดเองได้");
    } catch (e) { toast.error("อ่านไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setRereading(null); }
  };

  const parse = async (r2_key: string, gr_id?: string) => {
    setBusy("parse");
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ r2_key, gr_id: gr_id ?? null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const b = j.data as Bill;
      const ok = b.lines.filter((l) => l.level === "ok").length, mid = b.lines.filter((l) => l.level === "mid").length, no = b.lines.filter((l) => l.level === "no").length;
      toast.success(`อ่านบิลแล้ว ${b.lines.length} รายการ — มั่นใจ ${ok} · ให้เช็ก ${mid} · ไม่เจอ ${no} · ตรวจแล้วกดยืนยันทีละแถว`);
      setDraft((p) => ({ ...p, [b.id]: b.lines }));
      await load();
    } catch (e) { toast.error("อ่านบิลไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  /** แผนแก้ใบสั่งซื้อจากที่ผู้ใช้เลือก: ลด PO ตามบิล (แถวที่บิลลงน้อยกว่า) + ปิดยอดของที่ไม่อยู่ในบิล */
  const buildPlan = (billId: string): PoPlan => {
    const lines = expandAllocRows(draft[billId] ?? []).parts;   // แถวที่ลงหลาย PO = คิดแยกทีละ PO
    const bill = bills.find((b) => b.id === billId);
    const edits = new Map<string, PoPlan["edits"][number]>();
    const close = new Set<string>();
    const reduceLabels: string[] = [], closeLabels: string[] = [];
    const moves = new Map<string, PoPlan["moves"][number]>();
    for (const l of lines) if (l.decision === "confirmed" && l.move_po && !gByKey.has(l.match_key ?? "")) moves.set(l.move_po.po_id, l.move_po);
    for (const l of lines) {
      const g = l.match_key ? gByKey.get(l.match_key) : undefined;
      if (l.decision !== "confirmed" || l.short_action !== "reduce" || !g || shortfallOf(l, g) <= 0) continue;
      const p = reducePlan(Number(l.qty ?? 0), g);
      if (p.line_qty.length) { const e = edits.get(g.po_id) ?? { po_id: g.po_id, po_no: g.po_no, line_qty: [] }; e.line_qty.push(...p.line_qty.map((x) => ({ id: x.id, qty: x.qty }))); edits.set(g.po_id, e); }
      p.close.forEach((id) => close.add(id));
      reduceLabels.push(`${g.code || g.item_name} (${g.po_no}) ค้าง ${n2(g.remaining)} → ตามบิล ${n2(l.qty)}`);
    }
    for (const [key, act] of Object.entries(missAct[billId] ?? {})) {
      const g = gByKey.get(key);
      if (act !== "close" || !g) continue;
      g.lines.forEach((x) => close.add(x.id));
      closeLabels.push(`${g.code || g.item_name} (${g.po_no}) ค้างรับ ${n2(pendingReceiveOf(g))}`);
    }
    return { billId, moves: [...moves.values()], edits: [...edits.values()], close: [...close], reduceLabels, closeLabels, reason: `ร้านไม่มีของ — ไม่อยู่ในบิลร้าน${bill?.bill_no ? ` No. ${bill.bill_no}` : ""}` };
  };
  const planCount = (p: PoPlan) => p.moves.length + p.reduceLabels.length + p.closeLabels.length;

  /** ย้าย PO ร้านอื่นมาเป็นร้านของใบนี้ (API กลาง po-edit) — ทำก่อนใส่ลงใบ · ล้ม = หยุด ไม่ใส่ลงใบ */
  const runMoves = async (p: PoPlan): Promise<string | null> => {
    if (!p.moves.length) return null;
    if (!voucher?.seller_name) return "ใบนี้ยังไม่ระบุร้าน — ย้าย PO มาไม่ได้";
    for (const m of p.moves) {
      const res = await apiFetch("/api/purchasing/po-edit", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: m.po_id, header: { seller_name: voucher.seller_name, seller_partner_id: voucher.seller_partner_id } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) return `ย้าย ${m.po_no} ไม่สำเร็จ: ${j.error ?? `HTTP ${res.status}`}`;
    }
    toast.success(`ย้าย ${p.moves.map((m) => m.po_no).join(", ")} มาเป็นร้านนี้แล้ว`);
    return null;
  };

  /** แก้ใบสั่งซื้อผ่าน API กลาง (สิทธิ์/ประวัติ/สถานะใบ PO ตามกติกาเดิม) — คืนข้อความสรุป */
  const runPoPlan = async (p: PoPlan): Promise<{ ok: string[]; fail: string[] }> => {
    const ok: string[] = [], fail: string[] = [];
    for (const e of p.edits) {
      const res = await apiFetch("/api/purchasing/po-edit", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ po_id: e.po_id, line_qty: e.line_qty }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) fail.push(`ลดจำนวน ${e.po_no}: ${j.error ?? `HTTP ${res.status}`}`); else ok.push(`ลดจำนวน ${e.line_qty.length} บรรทัด (${e.po_no})`);
    }
    if (p.close.length) {
      const res = await apiFetch("/api/purchasing/cancel-line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ po_line_ids: p.close, reason: p.reason }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) fail.push(`ปิดยอด: ${j.error ?? `HTTP ${res.status}`}`); else ok.push(`ปิดยอด ${j.cancelled ?? p.close.length} บรรทัด`);
    }
    return { ok, fail };
  };

  const patch = async (billId: string, mode: "save" | "rematch" | "apply", plan?: PoPlan) => {
    const lines = draft[billId] ?? [];
    if (mode === "apply") {
      const left = undecidedCount(lines);
      if (left > 0) { setMsg((m) => ({ ...m, [billId]: `ยังเหลือ ${left} แถวที่ยังไม่ได้เช็ก — กด ใช่ / เลือกจับคู่เอง / ข้าม ให้ครบก่อน` })); return; }
      // มีงานแก้ใบสั่งซื้อ → ถามยืนยันก่อน (แตะใบสั่งซื้อจริง)
      if (!plan) { const p = buildPlan(billId); if (planCount(p) > 0) { setPoPlan(p); return; } }
    }
    setBusy(billId);
    dirtyBills.current.delete(billId);   // บันทึกพร้อมกดนี้แล้ว — ไม่ต้องบันทึกอัตโนมัติซ้ำ
    try {
      if (mode === "apply" && plan) { const err = await runMoves(plan); if (err) throw new Error(err); }
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_id: billId, lines, rematch: mode === "rematch", apply: mode === "apply", remember, fill_cn: fillCn, backfill_po: backfill, ...(sums[billId] ? { summary: sums[billId] } : {}) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const b = j.data as Bill;
      setDraft((p) => ({ ...p, [billId]: b.lines }));
      setAuto((st) => ({ ...st, at: new Date(), err: null, pending: dirtyBills.current.size > 0 }));
      if (mode === "apply" && j.applied) {
        const a = j.applied as { inserted: number; updated: number; expenses: number; remembered: number; filled_cn?: number; backfilled?: { po_no: string } | null };
        toast.success(`ใส่ลงใบสำคัญแล้ว — เพิ่ม ${a.inserted} · ใส่ราคา ${a.updated}${a.expenses ? ` · ค่าใช้จ่าย ${a.expenses}` : ""}${a.remembered ? ` · จำคู่ไว้ ${a.remembered}` : ""}${a.filled_cn ? ` · เติมชื่อจีน ${a.filled_cn} สินค้า` : ""}${a.backfilled ? ` · เปิด ${a.backfilled.po_no} ย้อนหลังให้รายการนอกใบสั่งซื้อ` : ""}`);
        if (plan && plan.edits.length + plan.close.length > 0) {
          const r = await runPoPlan(plan);
          if (r.ok.length) toast.success(`แก้ใบสั่งซื้อแล้ว — ${r.ok.join(" · ")}`);
          if (r.fail.length) toast.error(`แก้ใบสั่งซื้อไม่สำเร็จบางส่วน — ${r.fail.join(" · ")} (ลองกดใส่ลงใบอีกครั้ง)`);
          setMissAct((m) => ({ ...m, [billId]: {} }));
        }
        await onApplied();
      } else toast.success(mode === "rematch" ? "จับคู่ใหม่แล้ว" : "บันทึกแล้ว");
      await load();
    } catch (e) { toast.error((mode === "apply" ? "ใส่ลงใบไม่สำเร็จ: " : "บันทึกไม่สำเร็จ: ") + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  const removeBill = async () => {
    if (!delBill) return;
    setBusy(delBill.id);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/seller-bills?bill_id=${delBill.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      setDelBill(null); await load();
    } catch (e) { toast.error("ลบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  // ★ 2026-11-14 ปุ่ม "+ เพิ่มรายการเอง" = เปิดป๊อปเดียวกันในโหมดเพิ่ม (idx = -1) → เลือกสินค้า/PO แล้วได้แถวใหม่ท้ายบิล
  const NEW_PICK = useMemo(() => normalizeBillLine({ name_th: "รายการที่เพิ่มเอง" }), []);
  const pickLine = pickFor ? (pickFor.idx < 0 ? NEW_PICK : draft[pickFor.billId]?.[pickFor.idx]) : null;
  const pickList = useMemo(() => {
    const q = pickQ.trim().toLowerCase();
    const src = pickTab === "other" ? otherGroups ?? [] : groups;
    return src.filter((g) => !q || `${g.code} ${g.item_name} ${g.name_cn ?? ""} ${g.po_no} ${g.partner_name ?? ""}`.toLowerCase().includes(q)).slice(0, 200);
  }, [groups, otherGroups, pickQ, pickTab]);
  const openPick = (billId: string, idx: number, tab: PickTab = "this", q = "") => { setPickFor({ billId, idx }); setPickTab(tab); setPickQ(q); setPickAsk(null); setPickSku(null); };
  const closePick = () => { setPickFor(null); setPickQ(""); setPickAsk(null); setPickSku(null); };
  /** ใส่ผลที่เลือกในป๊อปลงแถว · split = บิลมากกว่าที่ค้างรอบนั้น → แบ่งลงรอบถัดไปให้อัตโนมัติ (เฉพาะแถวนี้ · เก่าก่อน) */
  const setPicked = (fn: (l: SellerBillLine) => SellerBillLine, split = false) => {
    if (!pickFor) return;
    const at = pickFor.idx;
    if (at < 0) {
      // แถวใหม่: จำนวน = ที่ค้างใน PO · ราคา = ราคา PO (แก้ต่อในแถวได้) · ไม่มีเลข # (ไม่ได้อยู่บนกระดาษ)
      setLines(pickFor.billId, (ls) => {
        let row = fn(normalizeBillLine({ rid: "m" + Date.now().toString(36), manual: true }));
        const g = row.match_key ? gAny(row.match_key) : undefined;
        if (g) { const q = g.remaining > 0 ? g.remaining : 1; row = { ...row, name_th: g.item_name, qty: q, unit_price: g.unit_price, amount: g.unit_price != null ? Math.round(q * g.unit_price * 100) / 100 : null }; }
        else if (row.sku_pick) row = { ...row, name_th: row.sku_pick.name };
        return ensureRowIds([...ls, row]);
      });
      closePick();
      return;
    }
    setLines(pickFor.billId, (ls) => {
      const next = ensureRowIds(ls.map((l, i) => (i === at ? fn(l) : l)));
      const rid = next[at]?.rid;
      return split && rid ? ensureRowIds(autoSplitRounds(next, groups, [], new Set([rid]), true)) : next;
    });
    closePick();
  };
  /** ① PO ร้านนี้ */
  const choose = (g: PoGroup) => setPicked((l) => ({ ...applyGroupToLine({ ...l, is_fee: false, sku_pick: null, move_po: null }, g, groups, [], true), decision: "confirmed" }), true);   // ★ 2026-11-14 แบ่งรอบอัตโนมัติถ้าบิลเกินที่ค้าง
  /** ② PO ร้านอื่น → ย้าย PO มาร้านนี้ (ทำตอนกดใส่ลงใบ) */
  const chooseMove = (g: PoGroup) => setPicked((l) => ({ ...applyGroupToLine({ ...l, is_fee: false, sku_pick: null }, g, [...groups, g], [], true), move_po: { po_id: g.po_id, po_no: g.po_no, from_name: g.partner_name ?? null }, decision: "confirmed" }));
  /** ② ใช้แค่รหัสสินค้า · ③ สินค้าทั้งหมด → นอกใบสั่งซื้อ */
  const chooseSku = (sku: { id: string; code: string; name: string; uom: string | null }) =>
    setPicked((l) => ({ ...l, is_fee: false, match_key: null, move_po: null, sku_pick: sku, level: "mid", score: 1, reasons: [], warns: [], manual: true, decision: "confirmed" }));

  return (
    <div className={bare ? "" : "bg-white border border-slate-200 rounded-xl p-4"}>
      {!bare && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
            {open ? "▾" : "▸"} <Icon value="🧾" /> บิลจากร้าน (ภาษาจีน) {bills.length > 0 && <span className="font-normal text-slate-400">· {bills.length} ใบ</span>}
          </button>
          <span className="text-[11px] text-slate-400">ลากบิลมาวาง → AI อ่านจีน + แปลไทย → จับคู่กับใบสั่งซื้อของร้านนี้เท่านั้น → เช็กทีละแถว → ใส่ลงใบ (ราคา ¥ จากบิล)</span>
        </div>
      )}
      {(bare || open) && (
        <div className={`${bare ? "" : "mt-3 "}space-y-4`}>
          {!hasPartner && <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">ใบนี้ยังไม่ได้ผูกร้าน (คู่ค้า) — จับคู่ได้จากชื่อร้านในใบ และระบบจะยังไม่จำคู่ไว้ใช้ครั้งหน้า</div>}
          {groups.length === 0 && <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">ร้านนี้ไม่มีใบสั่งซื้อที่ยังค้าง (สกุลเดียวกับใบนี้) — บิลร้านจับคู่ได้เฉพาะของที่อยู่ในใบสั่งซื้อ</div>}
          {!readonly && (
            <div className="flex items-end gap-3 flex-wrap">
              {/* ★ 2026-11-14 ลาก/วาง Ctrl+V/เลือกไฟล์ = AI อ่านต่อเองทันที (ไม่มีปุ่ม "อ่านบิล") · หลายไฟล์ = บิลละไฟล์ */}
              <div className="w-full max-w-md">
                <FileInput label="รูปหรือ PDF บิลร้าน" value={null} onChange={readUploaded} folder="seller-bills" category="supplier_bills" multiple pasteFromPage
                  hint="วางแล้ว AI อ่าน + จับคู่ให้เลย (10-30 วิ/ใบ) · หลายไฟล์ = บิลละไฟล์" />
              </div>
              {reading && (
                <span className="h-9 inline-flex items-center gap-1.5 text-sm text-indigo-700"><span className="animate-pulse">⏳</span>
                  กำลังอ่าน + จับคู่ {reading.total > 1 ? `ใบที่ ${Math.min(reading.done + 1, reading.total)}/${reading.total}` : ""}… (10-30 วิ)</span>
              )}
              {cands.filter((c) => !bills.some((b) => b.r2_key === c.r2_key)).map((c) => (
                <button key={`${c.gr_id}-${c.kind}`} onClick={() => void parse(c.r2_key, c.gr_id)} disabled={busy === "parse"} title="ไฟล์ที่แนบไว้ตอนรับของ — ให้ AI อ่านได้เลย ไม่ต้องอัปโหลดซ้ำ"
                  className="h-9 px-3 text-xs rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
                  อ่านจาก{c.kind === "bill" ? "บิล" : "ใบรับของ"} {c.gr_no}
                </button>
              ))}
            </div>
          )}
          {bills.length === 0 && <div className="text-xs text-slate-300 text-center py-3 border border-dashed border-slate-200 rounded-lg">— ยังไม่มีบิลร้าน —</div>}

          {bills.map((b, bi) => {
            const lines = draft[b.id] ?? b.lines;
            const math = checkBillMath(lines, b.total_amount);
            const decided = lines.length - undecidedCount(lines);
            const url = fileUrls[b.r2_key] ?? undefined;
            const pdf = isPdfRef(b.r2_key);
            const ro = readonly || busy === b.id;
            return (
              <div key={b.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-start gap-3 px-3 py-2 bg-slate-50 flex-wrap">
                  {pdf
                    ? <a href={url} target="_blank" rel="noreferrer" className="w-12 h-14 rounded border border-slate-200 bg-white flex items-center justify-center text-[10px] font-semibold text-red-600">PDF</a>
                    : <HoverPreview url={url} previewW={560}><a href={url} target="_blank" rel="noreferrer" className="block w-12 h-14 rounded overflow-hidden border border-slate-200 bg-white">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="w-full h-full object-cover" /></a></HoverPreview>}
                  <div className="flex-1 min-w-[14rem]">
                    <div className="text-sm text-slate-800 font-medium">บิลร้าน {b.bill_no ? <span className="font-mono text-xs">No. {b.bill_no}</span> : null} <span className="text-xs font-normal text-slate-400">{b.bill_date ? `· ${formatDate(b.bill_date)}` : ""}</span>
                      <span className={`ml-2 ${b.status === "applied" ? CHIP_OK : CHIP_WARN}`}>{b.status === "applied" ? `ใส่ลงใบแล้ว ${b.applied_at ? formatDate(b.applied_at) : ""}` : "ยังไม่ได้ใส่ลงใบ"}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">ร้านในบิล: {b.seller_text ?? "—"}{(b.raw?.files ?? []).length > 1 && <span className="ml-2">· ไฟล์บิล {(b.raw?.files ?? []).map((ref, k) => <a key={ref} href={fileUrls[ref] ?? undefined} target="_blank" rel="noreferrer" className="ml-1 text-blue-600 hover:underline">หน้า {k + 1}</a>)}</span>}</div>
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      <span className={CHIP_NEU}>อ่านได้ {lines.length} แถว</span>
                      {math.totalOk === true && <span className={CHIP_OK}>{lines.some((x) => billLineDiscount(x) > 0) ? "หลังหักส่วนลด" : "จำนวน × ราคา"} = ยอดรวมบิล ¥{n2(b.total_amount)} ตรง</span>}
                      {lines.some((x) => billLineDiscount(x) > 0) && <span className={`${chip} bg-red-50 text-red-700 border-red-200`} title="รวมส่วนลดทุกแถวในบิลนี้">ส่วนลดรวม ¥{n2(lines.reduce((a, x) => a + billLineDiscount(x), 0))}</span>}
                      {math.totalOk === false && <span className={CHIP_WARN}>รวมรายการ ¥{n2(math.sum)} ≠ ยอดบิล ¥{n2(b.total_amount)} — เช็กตัวเลข</span>}
                      {math.totalOk === null && <span className={CHIP_NEU}>รวม ¥{n2(math.sum)} (บิลไม่มียอดรวม)</span>}
                      {math.rowsBad.length > 0 && <span className={CHIP_WARN}>{math.rowsBad.length} แถว จำนวน × ราคา ≠ ยอด</span>}
                      <span className={CHIP_NEU}>ค้นใน PO ร้านนี้ {groups.length} รายการ</span>
                    </div>
                  </div>
                  {!readonly && <button onClick={() => setDelBill(b)} disabled={busy === b.id} title="ถอดบิลนี้" className="h-8 w-8 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"><Icon value="🗑️" /></button>}
                </div>

                {/* ★ 2026-11-14 แบบ B (เจ้าของเลือก): แถวละ 2 บรรทัด — ① ในบิล + จำนวน×ราคา ② สินค้าที่จับคู่ + ป้าย PO (หลาย PO ในแถวเดียว) · ปุ่ม ยืนยัน/เปลี่ยน/ข้าม/ลบ เห็นตลอด */}
                <div className="divide-y divide-slate-100">
                  {lines.map((l, i) => {
                    const g = gAny(l.match_key);
                    const hint = !g && otherGroups ? otherShopHint(l, otherGroups) : null;
                    const picked = !g && l.sku_pick ? l.sku_pick : null;
                    const done = l.decision === "confirmed" || l.decision === "skip" || l.decision === "expense";
                    const bad = math.rowsBad.includes(i);
                    const dk = bi * ROW_SPAN + i;   // ดัชนีของตัวลาก (แยกบิล)
                    const added = !l.no && (l.rid ?? "").startsWith("m");
                    const alloc = allocOf(l);
                    const multi = alloc.length >= 2;
                    const short = g ? expandAllocRows([l]).parts.reduce((s2, p) => s2 + shortfallOf(p, gAny(p.match_key)), 0) : 0;
                    const addable = g && !l.move_po ? roundsOf(g, groups).filter((r) => !alloc.some((a) => a.key === r.key) && r.remaining > 0) : [];
                    const applied = (l.voucher_line_ids?.length ?? 0) > 0;
                    const rk = l.rid ?? String(i);
                    const pctMode = (l.discount_pct ?? 0) > 0 || pctRows.has(rk);
                    const disc = billLineDiscount(l);
                    const setQty = (q: number | null) => setLines(b.id, (ls) => ls.map((x, k) => (k === i ? rebalanceAlloc({ ...x, qty: q, amount: q != null && x.unit_price != null ? Math.round(q * x.unit_price * 100) / 100 : x.amount }) : x)));
                    return (
                      <div key={l.rid ?? i} {...drag.rowProps(dk)} className={`flex items-start gap-1.5 px-3 py-1.5 ${done ? "bg-emerald-50/30" : l.level === "no" ? "bg-red-50/30" : ""} ${l.decision === "skip" ? "opacity-60" : ""} ${drag.rowCls(dk)}`}>
                        {/* เลขบรรทัดบนกระดาษ + หูจับลากย้ายแถว (lib/bill-line-order · components/sortable-list) */}
                        {!ro && <DragHandle {...drag.handleProps(dk)} title="ลากเพื่อย้ายแถว" className="pt-1 text-base" />}
                        <span className={`shrink-0 w-8 pt-1 font-mono text-[11px] ${added ? "text-blue-600" : "text-slate-400"}`} title={added ? "รายการที่เพิ่มเอง (ไม่ได้อยู่บนกระดาษ)" : "บรรทัดที่เท่าไรในบิล (บนกระดาษ)"}>{added ? "เพิ่ม" : `#${billLineNo(l.no, i)}`}</span>
                        <div className="min-w-0 flex-1">
                          {/* บรรทัด 1: ในบิล + จำนวน × ราคา = ยอด */}
                          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                            {added ? (
                              <input value={l.name_th ?? ""} disabled={ro} onChange={(e) => setLine(b.id, i, { name_th: e.target.value || null })} placeholder="ชื่อรายการ"
                                className="h-7 px-2 text-xs border border-slate-200 rounded-md w-56 max-w-full" title="ชื่อรายการที่เพิ่มเอง" />
                            ) : (
                              <span className="min-w-0 max-w-[26rem] truncate text-sm text-slate-800" title={`${l.name_cn ?? ""} ${l.spec_cn ?? ""}\n${[l.name_th, l.spec_th].filter(Boolean).join(" ")}`}>
                                {l.name_cn ?? "—"}{l.spec_cn && <span className="text-slate-500"> {l.spec_cn}</span>}
                                <span className="ml-1.5 text-[11px] text-slate-400">{[l.name_th, l.spec_th].filter(Boolean).join(" ")}</span>
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                              <input type="number" inputMode="decimal" step="any" min={0} value={l.qty ?? ""} disabled={ro} onChange={(e) => setQty(e.target.value === "" ? null : Number(e.target.value))} className={`${inp} w-16 ${bad ? "border-amber-300" : ""}`} title="จำนวนในบิล (แก้ได้ถ้า AI อ่านผิด)" />
                              <span>{l.unit ?? ""} × ¥</span>
                              <input type="number" inputMode="decimal" step="any" min={0} value={l.unit_price ?? ""} disabled={ro} onChange={(e) => { const p = e.target.value === "" ? null : Number(e.target.value); setLine(b.id, i, { unit_price: p, amount: p != null && l.qty != null ? Math.round(l.qty * p * 100) / 100 : l.amount }); }} className={`${inp} w-16 ${bad ? "border-amber-300" : ""}`} title="ราคาต่อหน่วยในบิล" />
                              {/* ★ 2026-11-14 ส่วนลดของแถว: ยอดเงิน ¥ หรือ % (กดปุ่มข้างช่องสลับ) · ยอด = จำนวน × ราคา − ส่วนลด */}
                              <span className="text-slate-400">− ลด</span>
                              <input type="number" inputMode="decimal" step="any" min={0} disabled={ro} value={(pctMode ? l.discount_pct : l.discount) ?? ""} placeholder="0"
                                onChange={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); setLine(b.id, i, pctMode ? { discount_pct: v, discount: null } : { discount: v, discount_pct: null }); }}
                                className={`${inp} w-14 ${disc > 0 ? "border-red-200 text-red-600" : ""}`} title={pctMode ? "ส่วนลดเป็น % ของ จำนวน × ราคา" : "ส่วนลดเป็นยอดเงิน ¥"} />
                              <button type="button" disabled={ro} onClick={() => { setPctRows((p) => { const nx = new Set(p); if (pctMode) nx.delete(rk); else nx.add(rk); return nx; }); setLine(b.id, i, { discount: null, discount_pct: null }); }}
                                title={pctMode ? "ตอนนี้: เป็น % — กดเพื่อใส่เป็นยอดเงิน ¥" : "ตอนนี้: เป็นยอดเงิน ¥ — กดเพื่อใส่เป็น %"}
                                className="h-7 min-w-6 px-1 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">{pctMode ? "%" : "¥"}</button>
                              <span>= <b className="font-medium text-slate-800">¥{n2((l.amount ?? (l.qty ?? 0) * (l.unit_price ?? 0)) - disc)}</b>{disc > 0 && <span className="ml-1 text-[10px] text-red-400">(ลด ¥{n2(disc)})</span>}</span>
                            </span>
                          </div>
                          {/* บรรทัด 2: จับคู่ → สินค้า + ป้าย PO */}
                          <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px]">
                            <LevelBadge l={l} />
                            {l.level === "fee" ? (
                              <span className="text-slate-500">ค่าใช้จ่ายในบิล ไม่จับกับใบสั่งซื้อ — เพิ่มเป็นค่าใช้จ่าย หรือข้าม</span>
                            ) : g ? (<>
                              {g.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={g.image_url} alt="" className="w-5 h-5 rounded object-cover border border-slate-100 shrink-0" />}
                              <span className="min-w-0 max-w-[20rem] truncate text-slate-700" title={`${g.code || ""} ${g.item_name}${g.name_cn ? ` · ${g.name_cn}` : ""}${g.lines.some((x) => x.from_gr) ? "\nมาจากใบรับในใบนี้ (ใส่ราคาอย่างเดียว)" : ""}`}>
                                <span className="font-mono text-slate-500">{g.code || "—"}</span> {g.item_name}
                              </span>
                              <span className="text-slate-300">→</span>
                              {l.move_po ? (
                                <span className={`${chip} bg-blue-50 text-blue-700 border-blue-200`}>ย้าย {l.move_po.po_no} มาร้านนี้{l.move_po.from_name ? ` (จาก ${l.move_po.from_name})` : ""} ตอนใส่ลงใบ</span>
                              ) : alloc.map((a) => {
                                const r = gAny(a.key);
                                const label = (r?.po_no ?? "PO").replace(/^PO-\d{4}-/, "PO-");
                                const tip = r ? `${r.po_no} · สั่ง ${r.order_date ? formatDate(r.order_date) : "—"} · ค้าง ${n2(r.remaining)} ${r.uom ?? ""} · ${r.unit_price != null ? `¥${n2(r.unit_price, 4)}` : "PO ไม่มีราคา"}` : a.key;
                                return multi ? (
                                  <span key={a.key} className={`${chip} bg-blue-50 text-blue-700 border-blue-200 gap-0.5`} title={`${tip}\nแก้จำนวนที่ลง PO นี้ได้ — PO อื่นปรับให้รวมเท่าจำนวนในบิล`}>
                                    {label} ·
                                    <input type="number" inputMode="decimal" step="any" min={0} value={a.qty} disabled={ro} onChange={(e) => allocSet(b.id, i, a.key, Number(e.target.value) || 0)}
                                      className="w-12 h-5 px-0.5 text-[11px] text-right bg-white border border-blue-200 rounded tabular-nums disabled:bg-transparent disabled:border-transparent" />
                                    {!ro && <button type="button" onClick={() => allocRemove(b.id, i, a.key)} title="เอา PO นี้ออก" className="ml-0.5 text-blue-400 hover:text-red-600">×</button>}
                                  </span>
                                ) : (
                                  <span key={a.key} className={`${chip} bg-blue-50 text-blue-700 border-blue-200`} title={tip}>{label} · ค้าง {n2(r?.remaining)}</span>
                                );
                              })}
                              {!ro && addable.length > 0 && (
                                <select value="" onChange={(e) => { if (e.target.value) allocAdd(b.id, i, e.target.value); }} title="ของที่สั่งหลาย PO แต่ส่งมาพร้อมกัน — เพิ่ม PO ในแถวนี้ แล้วแบ่งจำนวนเก่าก่อน"
                                  className="h-5 px-1 text-[11px] border border-dashed border-blue-300 rounded text-blue-700 bg-white">
                                  <option value="">+ PO ({addable.length})</option>
                                  {addable.map((r) => <option key={r.key} value={r.key}>{r.po_no} · {r.order_date ? formatDate(r.order_date) : "—"} · ค้าง {n2(r.remaining)}</option>)}
                                </select>
                              )}
                              {l.reasons.length > 0 && <span className={CHIP_OK} title={l.reasons.join("\n")}>{l.reasons[0]}{l.reasons.length > 1 ? ` +${l.reasons.length - 1}` : ""}</span>}
                              {l.warns.length > 0 && <span className={`${CHIP_WARN} cursor-help`} title={l.warns.join("\n")}>เตือน {l.warns.length}</span>}
                            </>) : picked ? (<>
                              <span className="min-w-0 max-w-[20rem] truncate text-slate-700"><span className="font-mono text-slate-500">{picked.code || "—"}</span> {picked.name}</span>
                              <span className={CHIP_NEU} title="ราคา ¥ จากบิล → ราคาต่อร้าน + ราคาบนสินค้า">นอกใบสั่งซื้อ{backfill ? " · เปิด PO ย้อนหลังตอนใส่ลงใบ" : ""}</span>
                            </>) : (<>
                              <span className="text-red-600">ไม่พบใน PO ร้านนี้ — กดเลือกจับคู่เอง หรือข้าม</span>
                              {hint && !ro && (<>
                                <span className={CHIP_WARN} title={`${hint.po_no} · ${hint.partner_name ?? "—"} · ${hint.code || "—"} ${hint.item_name}`}>ใบ้: เจอใน {hint.po_no} ({hint.partner_name ?? "ร้านอื่น"})</span>
                                <button type="button" onClick={() => openPick(b.id, i, "other", hint.code || hint.item_name)} className="text-blue-600 hover:underline">ดู</button>
                              </>)}
                            </>)}
                          </div>
                          {/* บิลลงน้อยกว่าที่ค้าง → คงไว้รอส่วนที่เหลือ (ค่าเริ่ม) / ลด PO ตามบิล */}
                          {g && short > 0 && l.decision !== "skip" && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px]">
                              <span className="text-amber-700">ขาด {n2(short)} {g.uom ?? ""}:</span>
                              <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
                                <button type="button" disabled={ro} onClick={() => setLine(b.id, i, { short_action: "keep" })} title="ใบสั่งซื้อคงจำนวนเดิม — ส่วนที่เหลือยังค้างรับ รอร้านส่งรอบหน้า"
                                  className={`h-5 px-2 ${l.short_action !== "reduce" ? "bg-slate-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-60`}>คงไว้รอส่วนที่เหลือ</button>
                                <button type="button" disabled={ro} onClick={() => setLine(b.id, i, { short_action: "reduce" })} title="แก้จำนวนในใบสั่งซื้อเท่าที่บิลลงมา (บรรทัดที่ไม่ได้ของเลย = ปิดยอด) — ทำตอนกดใส่ลงใบ"
                                  className={`h-5 px-2 border-l border-slate-200 ${l.short_action === "reduce" ? "bg-amber-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-60`}>ลด PO ตามบิล</button>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* ปุ่ม — เห็นตลอด */}
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          {l.level === "fee" ? (<>
                            <button disabled={ro} onClick={() => setLine(b.id, i, { decision: l.decision === "expense" ? null : "expense" })} className={`h-7 px-2 text-[11px] rounded-md border ${l.decision === "expense" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"} disabled:opacity-50`}>{l.decision === "expense" ? "✓ ค่าใช้จ่าย" : "เป็นค่าใช้จ่าย"}</button>
                            <button disabled={ro} onClick={() => setLine(b.id, i, { decision: l.decision === "skip" ? null : "skip" })} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">{l.decision === "skip" ? "ยกเลิกข้าม" : "ข้าม"}</button>
                          </>) : (<>
                            {(g || picked) && <button disabled={ro} onClick={() => setLine(b.id, i, { decision: l.decision === "confirmed" ? null : "confirmed" })} className={`h-7 px-2.5 text-[11px] font-medium rounded-md border ${l.decision === "confirmed" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"} disabled:opacity-50`}>{l.decision === "confirmed" ? "✓ ยืนยันแล้ว" : "✓ ยืนยัน"}</button>}
                            <button disabled={ro} onClick={() => openPick(b.id, i)} className={`h-7 px-2 text-[11px] rounded-md border ${g || picked ? "border-slate-200 text-slate-600" : "border-blue-300 bg-blue-50 text-blue-700"} hover:bg-slate-50 disabled:opacity-50`}>{g || picked ? "เปลี่ยน" : "เลือกจับคู่"}</button>
                            <button disabled={ro} onClick={() => setLine(b.id, i, { decision: l.decision === "skip" ? null : "skip" })} className="h-7 px-1.5 text-[11px] text-slate-400 hover:text-slate-600 disabled:opacity-50">{l.decision === "skip" ? "ยกเลิกข้าม" : "ข้าม"}</button>
                          </>)}
                          {!ro && (
                            <button type="button" onClick={() => removeRow(b.id, i)} disabled={applied} title={applied ? "แถวนี้ใส่ลงใบแล้ว — ลบไม่ได้ (กดข้ามแทน หรือลบที่ตารางใบสำคัญ)" : "ลบแถวนี้ (AI อ่านผิด/ซ้ำ) — กดเลิกทำได้ 5 วิ"}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300"><Icon name="delete" /></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!ro && (
                  <button type="button" onClick={() => openPick(b.id, -1)} className="w-full h-8 text-[11px] text-blue-600 hover:bg-blue-50 border-t border-slate-100 inline-flex items-center justify-center gap-1">
                    <Icon name="add" /> เพิ่มรายการสินค้าเอง (AI อ่านตกหล่น)
                  </button>
                )}

                {/* ★ 2026-11-15 สรุปยอดบิล (付款详情) — ยอดสินค้า/ส่วนลด/ค่าส่งในจีน/ค่าธรรมเนียม/ยอดจ่ายจริง → ใส่ลงใบแล้วขึ้นหัวใบ + เรทจากยอดจ่ายจริง */}
                <BillSummaryBox s={sums[b.id] ?? b.summary ?? emptySummary()} lines={lines} readonly={ro} rereading={rereading === b.id}
                  onChange={(p) => setSum(b.id, p)} onReread={() => void rereadSummary(b.id)} />

                {/* ไม่อยู่ในบิล — ของที่สั่งรอบเดียวกัน (PO เดียวกัน + วันเดียวกัน) ที่ร้านยังไม่ส่ง: รอรอบหน้า (คงค้างรับ) / ปิดยอด (ของไม่มาแล้ว → หน้าขอซื้อ/ใบสั่งผลิตกลับเป็น "ต้องซื้อ") */}
                {(() => {
                  const scope = missScope[b.id] ?? "bill";
                  const flat = expandAllocRows(lines).parts;   // แถวที่ลงหลาย PO นับทุก PO
                  const miss = missingGroups(flat, groups, scope);
                  const shopCount = missingGroups(flat, groups, "shop").length;
                  if (miss.length === 0 && shopCount === 0) return null;
                  const acts = missAct[b.id] ?? {};
                  const setAct = (key: string, a: "wait" | "close") => setMissAct((m) => ({ ...m, [b.id]: { ...(m[b.id] ?? {}), [key]: a } }));
                  return (
                    <div className="border-t border-slate-200">
                      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-amber-50/40">
                        <span className="text-xs font-semibold text-slate-700">ไม่อยู่ในบิล</span>
                        <span className="text-[11px] text-slate-500">{scope === "bill" ? "ของที่สั่งรอบเดียวกับบิลนี้ (PO เดียวกัน + PO ที่สั่งวันเดียวกัน) ที่ร้านยังไม่ส่ง" : "ของค้างรับทั้งร้าน ที่บิลนี้ไม่มี"} ({miss.length})</span>
                        <button type="button" onClick={() => setMissScope((m) => ({ ...m, [b.id]: scope === "bill" ? "shop" : "bill" }))} className="text-[11px] text-blue-600 hover:underline">{scope === "bill" ? `แสดงทั้งร้าน (${shopCount})` : "เฉพาะรอบเดียวกับบิล"}</button>
                        {!readonly && miss.length > 0 && <button type="button" onClick={() => setMissAct((m) => ({ ...m, [b.id]: {} }))} className="ml-auto text-[11px] text-slate-500 hover:text-slate-700">ทั้งหมด = รอรอบหน้า</button>}
                      </div>
                      {miss.length === 0 ? <div className="px-3 py-2 text-[11px] text-slate-400">— บิลนี้มีครบทุกรายการใน PO เดียวกัน —</div> : (
                        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                          {miss.map((g) => {
                            const a = acts[g.key] ?? "wait";
                            return (
                              <div key={g.key} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${a === "close" ? "bg-red-50/40" : ""}`}>
                                {g.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={g.image_url} alt="" className="w-7 h-7 rounded object-cover border border-slate-100 shrink-0" /> : <span className="w-7 h-7 rounded bg-slate-50 border border-slate-100 shrink-0" />}
                                <span className="font-mono text-[11px] text-slate-500 w-28 shrink-0 truncate">{g.code || "—"}</span>
                                <span className="flex-1 min-w-0 truncate text-slate-800" title={g.item_name}>{g.item_name}</span>
                                <span className="text-[11px] text-slate-500 shrink-0">{g.po_no} · ค้างรับ {n2(pendingReceiveOf(g))} {g.uom ?? ""}</span>
                                <div className="inline-flex rounded-md border border-slate-200 overflow-hidden shrink-0">
                                  <button type="button" disabled={ro} onClick={() => setAct(g.key, "wait")} title="คงค้างรับเหมือนเดิม รอร้านส่งรอบหน้า"
                                    className={`h-6 px-2 text-[11px] ${a === "wait" ? "bg-slate-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-60`}>รอรอบหน้า</button>
                                  <button type="button" disabled={ro} onClick={() => setAct(g.key, "close")} title="ของไม่มาแล้ว — ปิดยอดบรรทัดนี้ในใบสั่งซื้อ (หน้าขอซื้อ/ใบสั่งผลิตจะกลับเป็น ต้องซื้อ) · ทำตอนกดใส่ลงใบ"
                                    className={`h-6 px-2 text-[11px] border-l border-slate-200 ${a === "close" ? "bg-red-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-60`}>ปิดยอด</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!readonly && (
                  <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-t border-slate-100 bg-slate-50/60">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300" /> จำคู่ที่ยืนยันไว้ ครั้งหน้าจับให้เอง</label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600" title="ใช้ชื่อ + สเปกตามบิลร้าน (เช่น 狗扣 9mm 银色) เป็นชื่อจีนของสินค้า — ไม่ทับชื่อจีนที่มีอยู่แล้ว · ใช้ต่อที่ใบ PO ร้านจีน และช่วยจับคู่บิลครั้งหน้า"><input type="checkbox" checked={fillCn} onChange={(e) => setFillCn(e.target.checked)} className="rounded border-slate-300" /> เติมชื่อจีนให้สินค้าที่ยังไม่มี</label>
                    {outsidePoLines(lines).length > 0 && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 basis-full" title="ติ๊ก = เปิดใบสั่งซื้อของร้านนี้ (วันที่บิล) ใส่รายการนอกใบสั่งซื้อ แล้วผูกให้ → รับของได้ · ใบสั่งผลิตรู้ว่าซื้อแล้ว · มีใบให้มาร์คจ่ายเงิน · ไม่ติ๊ก = เก็บแค่ราคาต่อร้าน + ราคาสินค้า">
                        <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} className="rounded border-slate-300" />
                        เปิดใบสั่งซื้อย้อนหลังให้ร้านนี้ สำหรับรายการนอกใบสั่งซื้อ ({outsidePoLines(lines).length} รายการ) — แนะนำ
                        {!backfill && <span className="text-amber-700">· ไม่เปิด = รับของ/จ่ายเงินตาม PO ไม่ได้ ใบสั่งผลิตยังขึ้น &quot;ต้องซื้อ&quot;</span>}
                      </label>
                    )}
                    <button onClick={() => void patch(b.id, "rematch")} disabled={busy === b.id} title="จับคู่ใหม่เฉพาะแถวที่ยังไม่ได้ตัดสิน (หลังแก้ตัวเลข/เพิ่ม PO)" className="h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">จับคู่ใหม่</button>
                    <span className="flex-1" />
                    <button onClick={() => setLines(b.id, (ls) => ls.map((l) => (l.level === "ok" && l.match_key && !l.decision ? { ...l, decision: "confirmed" } : l)))} disabled={busy === b.id} className="h-8 px-2.5 text-xs rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">ยืนยันทุกแถวที่มั่นใจสูง</button>
                    <button onClick={() => void patch(b.id, "save")} disabled={busy === b.id} className="h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">บันทึก</button>
                    <button onClick={() => void patch(b.id, "apply")} disabled={busy === b.id} className="h-8 px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                      {busy === b.id ? "กำลังบันทึก…" : `${b.status === "applied" ? "ใส่ลงใบอีกครั้ง" : "ใส่ลงใบสำคัญรับ"} (${decided}/${lines.length})${(() => { const c = planCount(buildPlan(b.id)); return c ? ` + แก้ PO ${c}` : ""; })()}`}
                    </button>
                    {msg[b.id] && <div className="basis-full text-[11px] text-red-600">{msg[b.id]}</div>}
                    <div className="basis-full text-[11px] text-slate-400">ใส่ลงใบ = ราคา ¥ จากบิล + ผูกบรรทัดใบสั่งซื้อ · ตอนกดยืนยันใบ ราคาจะเขียนกลับ PO / ราคาต่อร้าน ตามเดิม · รายการที่ไม่ได้มาจากใบรับของ จะยังไม่เข้าสต๊อกจนกว่าจะรับของ</div>
                  </div>
                )}
              </div>
            );
          })}
          {/* ★ 2026-11-14 บันทึกร่างอัตโนมัติ — แถบสถานะกลาง (SaveBar mode auto · ถามก่อนปิด/รีโหลดถ้ายังไม่บันทึก) */}
          {!readonly && bills.length > 0 && (
            <SaveBar mode="auto" dirty={auto.pending} saving={auto.saving} error={auto.err} savedAt={auto.at} onSave={() => void flushSave()} note="บิลจากร้าน — แก้/ย้าย/ลบแถว ระบบเก็บร่างให้เองใน 2 วิ" />
          )}
        </div>
      )}

      {/* ป๊อปเลือกจับคู่เอง 3 แท็บ: ① PO ร้านนี้ · ② PO ร้านอื่น (ย้าย PO มา / ใช้แค่รหัส) · ③ สินค้าทั้งหมด (นอกใบสั่งซื้อ) */}
      {pickFor && pickLine && (
        <ERPModal open onClose={closePick} size="lg" storageKey="pv-seller-bill-pick"
          title={pickFor.idx < 0 ? "เพิ่มรายการเอง — เลือกสินค้า" : `เลือกจับคู่: ${pickLine.name_cn ?? ""} ${pickLine.spec_cn ?? ""}`.trim()}
          description={pickFor.idx < 0 ? "เลือกจาก PO ร้านนี้ (ได้จำนวนที่ค้าง + ราคา PO) หรือสินค้าทั้งหมด — แก้จำนวน/ราคาต่อในแถวได้" : `${[pickLine.name_th, pickLine.spec_th].filter(Boolean).join(" ")} · ${n2(pickLine.qty)} × ¥${n2(pickLine.unit_price, 4)}`}
          footer={<button onClick={closePick} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>}>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs mb-2">
            {([["this", `① PO ร้านนี้ (${groups.length})`], ["other", `② PO ร้านอื่น${otherGroups ? ` (${otherGroups.length})` : ""}`], ["sku", "③ สินค้าทั้งหมด"]] as [PickTab, string][]).map(([k, label], n) => (
              <button key={k} type="button" onClick={() => { setPickTab(k); setPickAsk(null); }} className={`h-8 px-3 ${n > 0 ? "border-l border-slate-200" : ""} ${pickTab === k ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mb-2">
            {pickTab === "this" ? "ใบสั่งซื้อที่ยังค้างของร้านนี้ (แบบเดิม)"
              : pickTab === "other" ? "ใบสั่งซื้อที่ยังค้างของร้านอื่น (สกุลเดียวกับใบนี้) — เลือกแล้วระบบถามว่าจะย้าย PO มาร้านนี้ หรือใช้แค่รหัสสินค้า"
              : "สินค้าทุกตัวในคลัง — ผูกรหัสสินค้าอย่างเดียว ไม่มีใบสั่งซื้อ (เปิด PO ย้อนหลังให้ได้ตอนใส่ลงใบ)"}
          </p>
          {pickTab === "sku" ? (
            <div className="space-y-2">
              <SkuPicker value={pickSku} onChange={(v) => setPickSku(v)} placeholder="ค้นรหัส / ชื่อสินค้า…" />
              {pickSku && (
                <div className="flex items-center gap-2 flex-wrap border border-slate-200 rounded-lg px-3 py-2">
                  <span className="font-mono text-xs text-slate-500">{pickSku.code}</span><span className="text-sm text-slate-800">{pickSku.name}</span>
                  <span className={CHIP_WARN}>นอกใบสั่งซื้อ</span>
                  <button type="button" onClick={() => chooseSku({ id: pickSku.id, code: pickSku.code, name: pickSku.name, uom: pickSku.uom_name ?? null })} className="ml-auto h-8 px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700">ใช้สินค้านี้</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <input autoFocus value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder={pickTab === "other" ? "ค้นรหัส ชื่อ เลข PO หรือชื่อร้าน" : "ค้นรหัส ชื่อไทย/จีน หรือเลข PO"} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg mb-2" />
              {pickTab === "other" && otherGroups == null && <div className="text-xs text-slate-400 py-3 text-center">กำลังโหลดใบสั่งซื้อร้านอื่น…</div>}
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
                {pickList.map((g) => {
                  const on = pickLine.match_key === g.key || pickAsk?.key === g.key;
                  return (
                    <button key={g.key} onClick={() => (pickTab === "other" ? setPickAsk(g) : choose(g))} className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm ${on ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <span className="w-9 h-9 rounded bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">{g.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={g.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-xs">—</span>}</span>
                      <span className="font-mono text-xs text-slate-500 w-28 shrink-0 truncate">{g.code || "—"}</span>
                      <span className="flex-1 min-w-0"><span className="block truncate text-slate-800">{g.item_name}{g.name_cn && <span className="ml-1 text-slate-400">· {g.name_cn}</span>}</span><span className="block text-[11px] text-slate-400">{g.po_no}{pickTab === "other" && g.partner_name ? ` · ${g.partner_name}` : ""}{g.order_date ? ` · ${formatDate(g.order_date)}` : ""}{g.lines.length > 1 ? ` · ${g.lines.length} บรรทัด` : ""}{g.in_voucher ? " · อยู่ในใบนี้แล้ว" : ""}</span></span>
                      <span className="text-xs text-slate-500 tabular-nums shrink-0 w-20 text-right">ค้าง {n2(g.remaining)}</span>
                      <span className="text-xs text-slate-700 tabular-nums shrink-0 w-16 text-right">{g.unit_price != null ? `¥${n2(g.unit_price, 4)}` : "—"}</span>
                    </button>
                  );
                })}
                {pickList.length === 0 && (pickTab !== "other" || otherGroups != null) && <div className="px-3 py-6 text-center text-xs text-slate-400">ไม่พบ ลองค้นคำอื่น หรือดูแท็บอื่น</div>}
              </div>
              {/* ② เลือก PO ร้านอื่นแล้ว → ถามวิธี (ผูกเฉย ๆ ราคา/การจ่ายเงินจะไปลงร้านนั้น) */}
              {pickTab === "other" && pickAsk && (
                <div className="mt-3 border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
                  <div className="text-xs text-slate-700"><span className={CHIP_WARN}>ใบสั่งซื้อนี้เป็นของ {pickAsk.partner_name ?? "ร้านอื่น"}</span> <span className="ml-1">ถ้าผูกเฉย ๆ ราคาและการจ่ายเงินจะไปลงร้านนั้น ไม่ใช่ร้านในบิล — เลือกวิธี:</span></div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" disabled={!!pickAsk.po_locked || !voucher?.seller_name} onClick={() => chooseMove(pickAsk)} title={pickAsk.po_locked ? `ย้ายไม่ได้ — ${pickAsk.po_locked}` : `ทั้งใบ ${pickAsk.po_no} เปลี่ยนร้านเป็น ${voucher?.seller_name ?? "ร้านนี้"} (ตัวแก้ใบสั่งซื้อกลาง · ลงประวัติ) ตอนกดใส่ลงใบ`}
                      className="h-8 px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">ย้าย {pickAsk.po_no} มาเป็นร้านนี้ (แนะนำ)</button>
                    <button type="button" disabled={!pickAsk.item_sku_id} onClick={() => pickAsk.item_sku_id && chooseSku({ id: pickAsk.item_sku_id, code: pickAsk.code, name: pickAsk.item_name, uom: pickAsk.uom })} title={pickAsk.item_sku_id ? "ผูกรหัสสินค้าอย่างเดียว ไม่แตะใบสั่งซื้อของร้านนั้น" : "บรรทัดนี้ไม่มีรหัสสินค้า — ใช้แท็บ สินค้าทั้งหมด แทน"}
                      className="h-8 px-3 text-xs rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">ใช้แค่รหัสสินค้า ไม่ผูก PO</button>
                  </div>
                  {pickAsk.po_locked && <div className="text-[11px] text-red-600">ย้าย PO ไม่ได้ — {pickAsk.po_locked} (กันข้อมูลการเงิน/สต๊อกผิดร้าน)</div>}
                </div>
              )}
            </>
          )}
        </ERPModal>
      )}

      {/* ยืนยันก่อนแก้ใบสั่งซื้อ (ลดจำนวนตามบิล / ปิดยอดของที่ไม่มา) */}
      <ConfirmDialog open={!!poPlan} onClose={() => setPoPlan(null)} variant={poPlan?.closeLabels.length ? "danger" : "default"} loading={!!poPlan && busy === poPlan.billId}
        onConfirm={() => { const p = poPlan; setPoPlan(null); if (p) void patch(p.billId, "apply", p); }}
        title="ใส่ลงใบสำคัญ + แก้ใบสั่งซื้อ?" confirmText="ยืนยัน"
        message={poPlan && (
          <div className="space-y-2 text-[13px]">
            {poPlan.moves.length > 0 && <div><b className="font-medium text-blue-700">ย้ายใบสั่งซื้อมาเป็นร้านนี้ ({poPlan.moves.length})</b><ul className="list-disc pl-5 text-slate-600">{poPlan.moves.map((m) => <li key={m.po_id}>{m.po_no}{m.from_name ? ` (จาก ${m.from_name})` : ""} → {voucher?.seller_name ?? "ร้านนี้"}</li>)}</ul></div>}
            {poPlan.reduceLabels.length > 0 && <div><b className="font-medium text-slate-700">ลดจำนวนใน PO ตามบิล ({poPlan.reduceLabels.length})</b><ul className="list-disc pl-5 text-slate-600">{poPlan.reduceLabels.map((t) => <li key={t}>{t}</li>)}</ul></div>}
            {poPlan.closeLabels.length > 0 && <div><b className="font-medium text-red-700">ปิดยอด — ของไม่มาแล้ว ({poPlan.closeLabels.length})</b><ul className="list-disc pl-5 text-slate-600">{poPlan.closeLabels.map((t) => <li key={t}>{t}</li>)}</ul></div>}
            {poPlan.reduceLabels.length + poPlan.closeLabels.length > 0 && <p className="text-[11px] text-slate-500">ของที่ปิดยอด หน้าขอซื้อ / ใบสั่งผลิตจะกลับเป็น &quot;ต้องซื้อ&quot; เอง · ของที่รับเข้าแล้วไม่ถูกแตะ · ลงประวัติทุกบรรทัด</p>}
            {poPlan.moves.length > 0 && <p className="text-[11px] text-slate-500">ย้ายร้านทั้งใบ (ราคา/การจ่ายเงินของใบนั้นจะไปอยู่ที่ร้านนี้) · ย้ายก่อน แล้วค่อยใส่ลงใบ · ลงประวัติใบสั่งซื้อ</p>}
          </div>
        )} />

      <ConfirmDialog open={!!delBill} onClose={() => setDelBill(null)} onConfirm={() => void removeBill()} variant="danger" loading={!!delBill && busy === delBill.id}
        title="ถอดบิลร้านนี้?" message="ผลที่ AI อ่านและการจับคู่ของบิลนี้จะหายไป · รายการที่ใส่ลงใบสำคัญแล้วยังอยู่ (ลบได้ที่ตารางรายการ)" confirmText="ถอดบิล" />
    </div>
  );
}
