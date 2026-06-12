"use client";

/**
 * หน้ารับสินค้าเข้า (Goods Receipt) — 2 มุมมอง
 *  A) ตามใบสั่งซื้อ (PO): เลือกร้าน/PO → รับทั้งใบ
 *  B) สินค้าที่รอเข้า: รวมทุกบรรทัดที่ยังรับไม่ครบจากทุก PO (sort ตาม ETA → ชื่อ) เลือกรับข้ามใบได้
 * บังคับแนบ "ใบรับของ + บิล" (รูป/PDF) ทุกครั้งก่อนบันทึก
 * รับไม่ครบ (แท็บ A) จะเด้งถามว่าจบงาน/รอของ · รับเกินได้
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission } from "@/components/auth";
import { useBackdropDismiss, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { FileInput } from "@/components/file-input";
import { useCardLayout, CardLayoutEditor, type CardField } from "@/components/card-layout";

type PO = { id: string; po_no: string; seller_name: string; status: string; currency: string; expected_date?: string | null; order_date?: string | null };
type Line = { id: string; item_name: string; qty: number; uom: string; qty_received: number };
type Input = { recv: string; def: string; close?: boolean };   // close=true → ปิดบิล (จบยอดที่ขาด)
type PayloadLine = { po_line_id: string; qty_received: number; qty_defective: number; case_type: string };
// ประวัติการรับของบรรทัดสินค้า
type HistRow = { gr_no: string; receive_date: string | null; receiver: string; qty_received: number; qty_defective: number; case_type: string };
const CASE_LABEL: Record<string, string> = { full: "รับครบ", full_defective: "รับครบ", partial_wait: "รับบางส่วน (รอของ)", partial_close: "ปิดยอด (ขาด)" };
// ป้ายสถานะบรรทัดที่ปิดแล้ว (แท็บรับครบแล้ว)
const DONE_BADGE: Record<string, { text: string; cls: string }> = {
  received: { text: "✅ รับครบ", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  short_closed: { text: "🔴 ปิดยอด (ขาด)", cls: "bg-orange-50 text-orange-700 border-orange-200" },
};
// ป้ายสถานะจ่ายเงิน (การ์ดติดตาม)
function payBadge(it: { payment_status: string; ship_before_pay: boolean; paid_date: string | null }): { text: string; cls: string } {
  if (it.payment_status === "paid") return { text: `🟢 จ่ายแล้ว${it.paid_date ? ` ${formatDate(it.paid_date)}` : ""}`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (it.ship_before_pay) return { text: "🚚 ส่งก่อนจ่าย", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  return { text: "🟡 รอจ่าย", cls: "bg-amber-50 text-amber-700 border-amber-200" };
}

// ป้ายสถานะใบ PO (การ์ดแท็บตามใบสั่งซื้อ)
const PO_BADGE: Record<string, { text: string; cls: string }> = {
  draft: { text: "ร่าง", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  confirmed: { text: "ยืนยันแล้ว", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  purchase: { text: "สั่งซื้อแล้ว", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  partial: { text: "รับบางส่วน", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};
// แท็บ B/C: บรรทัดจาก /api/purchasing/receivable — รูป/รหัส/วันสั่ง/วันคาด/วันเหลือ/ยอดรับ
type PendItem = {
  id: string; po_id: string; po_no: string; po_status: string; seller_name: string;
  item_sku_id: string | null; item_name: string; code: string; image_url: string | null;
  uom: string; qty: number; qty_received: number; qty_defective: number; line_status: string;
  remaining: number; currency: string;
  order_date: string | null; expected_date: string | null;
  expected_source: "po" | "lead" | null; lead_time_days: number | null;
  days_remaining: number | null;
  source_mo_no: string | null; used_for_label: string | null;   // ใบสั่งผลิตต้นทาง
  receive_count: number;                                          // รับมาแล้วกี่ครั้ง (ใบรับ GR)
  payment_status: string; paid_date: string | null; ship_before_pay: boolean; duration_days: number | null;  // สถานะจ่ายเงิน + ค้างมากี่วัน
};
type PendSort = "eta" | "order" | "name";
type PendGroup = "none" | "shop" | "eta" | "po" | "mo";

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
// ตัด [code] นำหน้าชื่อสินค้าออก (รหัสโชว์เป็น chip แยกอยู่แล้ว)
const stripCode = (name: string) => name?.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;

// ป้าย "วันที่เหลือ" จนถึงวันคาดการณ์ของเข้า → สี + ข้อความ
function etaBadge(days: number | null): { text: string; cls: string } {
  if (days == null) return { text: "ยังไม่ระบุ", cls: "bg-slate-100 text-slate-500 border-slate-200" };
  if (days < 0) return { text: `เลยกำหนด ${Math.abs(days)} วัน`, cls: "bg-red-50 text-red-700 border-red-200" };
  if (days === 0) return { text: "ถึงกำหนดวันนี้", cls: "bg-orange-50 text-orange-700 border-orange-200" };
  if (days <= 3) return { text: `เหลือ ${days} วัน`, cls: "bg-orange-50 text-orange-700 border-orange-200" };
  return { text: `เหลือ ${days} วัน`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

const PEND_VIEW_KEY = "recv_pend_view", PEND_COLS_KEY = "recv_pend_cols", PEND_SORT_KEY = "recv_pend_sort", PEND_GROUP_KEY = "recv_pend_group";
const COL_OPTIONS = [3, 4, 5, 6, 8, 10];
// ข้อมูลที่เลือกโชว์ได้บนการ์ดติดตาม (Card Builder)
const TRACK_CARD_FIELDS: CardField[] = [
  { key: "shop_po", label: "ร้าน / PO" },
  { key: "order_date", label: "วันที่สั่ง" },
  { key: "expected", label: "วันคาดการณ์ของเข้า" },
  { key: "payment", label: "สถานะจ่ายเงิน + ค้างกี่วัน" },
  { key: "mo", label: "ใบสั่งผลิต (MO)" },
];

export default function ReceiveGoodsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<"po" | "pending" | "done">("pending");
  const [pos, setPos] = useState<PO[]>([]);
  const [poId, setPoId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [inputs, setInputs] = useState<Record<string, Input>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shortDialog, setShortDialog] = useState<{ base: PayloadLine[]; shortIds: string[]; shortNames: string[] } | null>(null);

  // ไฟล์แนบ (บังคับทั้งคู่)
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [billKey, setBillKey] = useState<string | null>(null);
  const attachReady = !!receiptKey && !!billKey;

  // แท็บ B — สินค้าที่รอเข้า
  const [pend, setPend] = useState<PendItem[]>([]);
  const [pendInputs, setPendInputs] = useState<Record<string, Input>>({});
  const [pendQ, setPendQ] = useState("");
  const [pendLoading, setPendLoading] = useState(false);
  const [pendView, setPendView] = useState<"card" | "table">("card");
  const [activeShop, setActiveShop] = useState<string | null>(null);   // list ร้านด้านซ้าย (แท็บรอเข้า/รับครบ)
  const [activeMo, setActiveMo] = useState<string | null>(null);       // filter ตามใบสั่งผลิต (MO)
  const [shopQ, setShopQ] = useState("");
  const [poQ, setPoQ] = useState("");                                  // ค้นหาใบ PO (แท็บตามใบสั่งซื้อ)
  const [pendCols, setPendCols] = useState(6);
  const [pendSort, setPendSort] = useState<PendSort>("eta");
  const [pendGroup, setPendGroup] = useState<PendGroup>("none");
  const canDesign = usePermission("products.edit");                    // ตั้งค่าเริ่มต้นการ์ดทุกคน (admin)
  const { fields: cardFields, reload: reloadCard } = useCardLayout("receive-tracking");
  const [designOpen, setDesignOpen] = useState(false);
  const trackKeys = cardFields ?? TRACK_CARD_FIELDS.map((f) => f.key);   // ยังไม่ตั้ง = โชว์ทั้งหมด
  const [etaEdit, setEtaEdit] = useState<{ po_id: string; po_no: string; seller_name: string; value: string } | null>(null);
  const [etaSaving, setEtaSaving] = useState(false);
  const [qtyEdit, setQtyEdit] = useState<PendItem | null>(null);   // คลิกการ์ด → popup กรอกจำนวน
  const [history, setHistory] = useState<HistRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // โหลดประวัติการรับเมื่อเปิดป๊อปกรอกจำนวน
  useEffect(() => {
    const id = qtyEdit?.id;
    if (!id) { setHistory([]); return; }
    let alive = true;
    setHistLoading(true);
    apiFetch(`/api/purchasing/receive-history?po_line_id=${encodeURIComponent(id)}`).then((r) => r.json())
      .then((j) => { if (alive) setHistory((j.data ?? []) as HistRow[]); })
      .catch(() => { if (alive) setHistory([]); })
      .finally(() => { if (alive) setHistLoading(false); });
    return () => { alive = false; };
  }, [qtyEdit?.id]);

  // โหลดค่า view/cols/sort/group ที่จำไว้
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(PEND_VIEW_KEY); if (v === "card" || v === "table") setPendView(v);
    const c = Number(localStorage.getItem(PEND_COLS_KEY)); if (COL_OPTIONS.includes(c)) setPendCols(c);
    const s = localStorage.getItem(PEND_SORT_KEY); if (s === "eta" || s === "order" || s === "name") setPendSort(s as PendSort);
    const g = localStorage.getItem(PEND_GROUP_KEY); if (["none","shop","eta","po","mo"].includes(g ?? "")) setPendGroup(g as PendGroup);
  }, []);
  const changePendView = (v: "card" | "table") => { setPendView(v); localStorage.setItem(PEND_VIEW_KEY, v); };
  const changePendCols = (n: number) => { setPendCols(n); localStorage.setItem(PEND_COLS_KEY, String(n)); };
  const changePendSort = (s: PendSort) => { setPendSort(s); localStorage.setItem(PEND_SORT_KEY, s); };
  const changePendGroup = (g: PendGroup) => { setPendGroup(g); localStorage.setItem(PEND_GROUP_KEY, g); };

  useEffect(() => {
    apiFetch("/api/master-v2/purchase-orders-v2?limit=200").then((r) => r.json()).then((j) => {
      const list = ((j.data ?? []) as PO[]).filter((p) => p.status !== "received" && p.status !== "cancelled");
      setPos(list);
    }).catch(() => {});
  }, [done]);

  // ---- แท็บ A: โหลดบรรทัดของ PO ----
  const loadLines = useCallback((id: string) => {
    if (!id) { setLines([]); return; }
    setLoading(true); setErr(null);
    const flt = encodeURIComponent(JSON.stringify({ po_id: { type: "text", value: id } }));
    apiFetch(`/api/master-v2/purchase-order-lines-v2?limit=200&filters=${flt}`).then((r) => r.json()).then((j) => {
      const ls = (j.data ?? []) as Line[];
      setLines(ls);
      const init: Record<string, Input> = {};
      for (const l of ls) {
        const remaining = Math.max(0, num(l.qty) - num(l.qty_received));
        init[l.id] = { recv: remaining > 0 ? String(remaining) : "0", def: "0" };
      }
      setInputs(init);
    }).catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }, []);

  const onPickPo = (id: string) => { setPoId(id); setDone(null); loadLines(id); };
  const setInput = (id: string, patch: Partial<Input>) => setInputs((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const selectedPo = useMemo(() => pos.find((p) => p.id === poId), [pos, poId]);

  // ---- แท็บ B/C: โหลดบรรทัดจาก API กลาง (B = รอเข้า · C = ปิดแล้ว ดู/แก้) ----
  const doneMode = tab === "done";
  const loadPending = useCallback(async (mode: "pending" | "done") => {
    setPendLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/purchasing/receivable${mode === "done" ? "?mode=done" : ""}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const items = (j.data ?? []) as PendItem[];
      setPend(items);
      const init: Record<string, Input> = {};
      items.forEach((it) => { init[it.id] = { recv: String(it.remaining), def: "0" }; });
      setPendInputs(init);
    } catch (e) { setErr(String(e)); }
    finally { setPendLoading(false); }
  }, []);

  // โหลดทุกแท็บ — แท็บ PO ใช้ข้อมูล pending นับ "รายการรอรับ" บนการ์ดใบ PO
  useEffect(() => { void loadPending(tab === "done" ? "done" : "pending"); }, [tab, loadPending]);
  // สลับแท็บ → ล้างร้านที่เลือกไว้ (รายชื่อร้านของแต่ละแท็บไม่เหมือนกัน)
  useEffect(() => { setActiveShop(null); setActiveMo(null); }, [tab]);

  // มาร์ค/ยกเลิก "จ่ายแล้ว" ที่ใบ PO — ผ่าน API กลาง (audit) → วันคาดเข้าเริ่มนับจากวันจ่าย
  const [marking, setMarking] = useState(false);
  const [payEdit, setPayEdit] = useState<{ po_id: string; po_no: string; value: string } | null>(null);   // popup ใส่วันที่จ่าย
  const patchPayment = useCallback(async (poId: string, body: Record<string, unknown>, okMsg: string) => {
    setMarking(true);
    try {
      const res = await apiFetch(`/api/master-v2/purchase-orders-v2/${poId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(okMsg);
      setPayEdit(null); setQtyEdit(null);
      await loadPending(doneMode ? "done" : "pending");
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setMarking(false); }
  }, [user?.name, toast, loadPending, doneMode]);
  const savePaid = (poId: string, poNo: string, date: string) => patchPayment(poId, { payment_status: "paid", paid_date: date || null }, `มาร์คจ่ายแล้ว — ${poNo}`);
  const unmarkPaid = (it: PendItem) => patchPayment(it.po_id, { payment_status: "unpaid", paid_date: null }, `ยกเลิกจ่าย — ${it.po_no}`);

  // เปิดบรรทัดที่ปิดแล้วกลับมา "รอรับ" (เคสปิดผิด/ของมาเพิ่ม) — ผ่าน API กลาง (audit log)
  const [reopening, setReopening] = useState(false);
  const reopenLine = useCallback(async (it: PendItem) => {
    setReopening(true);
    try {
      const res = await apiFetch(`/api/master-v2/purchase-order-lines-v2/${it.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_status: "partial", actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      // ใบ PO ที่ปิดไปแล้ว ต้องกลับมาเป็น "รับบางส่วน" ไม่งั้นรายการไม่โผล่ในแท็บรอเข้า
      if (it.po_status === "received" || it.po_status === "short_closed") {
        await apiFetch(`/api/master-v2/purchase-orders-v2/${it.po_id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "partial", actor: user?.name }),
        });
      }
      toast.success(`เปิดกลับมารอรับแล้ว — ${stripCode(it.item_name)}`);
      setQtyEdit(null);
      await loadPending("done");
    } catch (e) { toast.error("เปิดกลับไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setReopening(false); }
  }, [user?.name, toast, loadPending]);
  const setPendInput = (id: string, patch: Partial<Input>) => setPendInputs((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  // ค้นหา + ร้านที่เลือก + เรียงลำดับ (วันคาด / วันสั่ง / ชื่อ) — ค่าว่างไปท้ายสุดเสมอ
  const shownPend = useMemo(() => {
    const ql = pendQ.trim().toLowerCase();
    let filtered = !ql ? pend : pend.filter((it) =>
      it.item_name.toLowerCase().includes(ql) || it.code.toLowerCase().includes(ql) ||
      it.po_no.toLowerCase().includes(ql) || it.seller_name.toLowerCase().includes(ql));
    if (activeShop) filtered = filtered.filter((it) => it.seller_name === activeShop);
    if (activeMo) filtered = filtered.filter((it) => it.source_mo_no === activeMo);
    const byName = (a: PendItem, b: PendItem) => a.item_name.localeCompare(b.item_name, "th");
    const byDate = (ka: keyof PendItem) => (a: PendItem, b: PendItem) => {
      const va = (a[ka] as string) || "9999-12-31", vb = (b[ka] as string) || "9999-12-31";
      return va !== vb ? (va < vb ? -1 : 1) : byName(a, b);
    };
    const cmp = pendSort === "name" ? byName : pendSort === "order" ? byDate("order_date") : byDate("expected_date");
    return [...filtered].sort(cmp);
  }, [pend, pendQ, pendSort, activeShop, activeMo]);

  // รายชื่อร้าน (list ซ้ายมือ) — นับจากข้อมูลแท็บปัจจุบัน
  const pendShops = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of pend) m.set(it.seller_name, (m.get(it.seller_name) ?? 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [pend]);

  // รายการใบสั่งผลิต (MO) ที่มีของรอรับ (list ซ้ายมือ — section "จากใบสั่งผลิต")
  const pendMos = useMemo(() => {
    const m = new Map<string, { count: number; product: string }>();
    for (const it of pend) {
      if (!it.source_mo_no) continue;
      const g = m.get(it.source_mo_no) ?? { count: 0, product: "" };
      g.count += 1; if (!g.product && it.used_for_label) g.product = it.used_for_label;
      m.set(it.source_mo_no, g);
    }
    return [...m.entries()].map(([mo, v]) => ({ mo, ...v })).sort((a, b) => b.mo.localeCompare(a.mo, "th"));
  }, [pend]);

  // การ์ดใบ PO (แท็บตามใบสั่งซื้อ) — นับรายการรอรับจากข้อมูล pending + ค้นหาเลข PO/ร้าน
  const poCards = useMemo(() => {
    const cnt = new Map<string, number>();
    for (const it of pend) cnt.set(it.po_id, (cnt.get(it.po_id) ?? 0) + 1);
    const ql = poQ.trim().toLowerCase();
    return pos
      .filter((p) => !ql || p.po_no.toLowerCase().includes(ql) || p.seller_name.toLowerCase().includes(ql))
      .map((p) => ({ ...p, pendCount: cnt.get(p.id) ?? 0 }))
      .sort((a, b) => String(b.order_date ?? "").localeCompare(String(a.order_date ?? "")));
  }, [pos, pend, poQ]);

  // จัดกลุ่ม (ร้าน / วันคาดเข้า / PO) — คงลำดับ sort ภายในกลุ่ม
  const groupedPend = useMemo<{ key: string; label: string; items: PendItem[] }[]>(() => {
    if (pendGroup === "none") return [{ key: "_all", label: "", items: shownPend }];
    const keyOf = (it: PendItem) =>
      pendGroup === "shop" ? (it.seller_name || "—")
      : pendGroup === "po" ? (it.po_no || "—")
      : pendGroup === "mo" ? (it.source_mo_no || "—")
      : (it.expected_date || "");   // eta
    const labelOf = (it: PendItem) =>
      pendGroup === "shop" ? `🏪 ${it.seller_name || "—"}`
      : pendGroup === "po" ? `📋 ${it.po_no || "—"} · ${it.seller_name || "—"}`
      : pendGroup === "mo" ? (it.source_mo_no ? `🏭 ${it.source_mo_no}${it.used_for_label ? ` · ${it.used_for_label}` : ""}` : "🏭 ไม่ได้มาจากใบสั่งผลิต")
      : (it.expected_date ? `🚚 คาดเข้า ${formatDate(it.expected_date)}` : "🚚 ยังไม่ระบุวันคาด");
    const m = new Map<string, { key: string; label: string; items: PendItem[] }>();
    for (const it of shownPend) {
      const k = keyOf(it);
      const g = m.get(k); if (g) g.items.push(it);
      else m.set(k, { key: k, label: labelOf(it), items: [it] });
    }
    const groups = [...m.values()];
    // เรียงหัวกลุ่ม: eta ตามวันที่ (ว่าง=ท้าย), อื่นๆ ตามชื่อ
    groups.sort((a, b) => pendGroup === "eta"
      ? ((a.key || "9999-12-31") < (b.key || "9999-12-31") ? -1 : 1)
      : a.label.localeCompare(b.label, "th"));
    return groups;
  }, [shownPend, pendGroup]);

  // บันทึกวันคาดการณ์ของเข้าลงใบ PO (ผ่าน API กลาง — มี audit/guard) → ใช้กับทุกบรรทัดของใบนั้น
  const saveEta = async () => {
    if (!etaEdit) return;
    setEtaSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/purchase-orders-v2/${etaEdit.po_id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_date: etaEdit.value || null, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`บันทึกวันคาดการณ์ของเข้า — ${etaEdit.po_no} แล้ว`);
      setEtaEdit(null);
      await loadPending(doneMode ? "done" : "pending");
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setEtaSaving(false); }
  };

  // ---- ยิง API (1 PO) ----
  const postReceive = async (poIdArg: string, payloadLines: PayloadLine[]) => {
    const res = await apiFetch("/api/purchasing/receive", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ po_id: poIdArg, receiver: user?.name, lines: payloadLines, receipt_doc_r2_key: receiptKey, bill_doc_r2_key: billKey }),
    });
    return res.json();
  };

  const resetAfterSave = () => { setReceiptKey(null); setBillKey(null); };

  // แท็บ A: บันทึก
  const doSubmit = async (payloadLines: PayloadLine[]) => {
    setSaving(true); setErr(null);
    try {
      const j = await postReceive(poId, payloadLines);
      if (j.error) { setErr(j.error); return; }
      setDone(`✅ รับสินค้าสำเร็จ — เลขที่ ${j.gr_no} · สถานะ PO: ${j.po_status}`);
      setPoId(""); setLines([]); setInputs({}); setShortDialog(null); resetAfterSave();
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  };

  const onSave = () => {
    setErr(null);
    if (!attachReady) { setErr("ต้องแนบ ใบรับของ + บิล ให้ครบก่อนบันทึก"); return; }
    const base: PayloadLine[] = [];
    const shortIds: string[] = [];
    const shortNames: string[] = [];
    for (const l of lines) {
      const recv = num(inputs[l.id]?.recv);
      const def = num(inputs[l.id]?.def);
      if (recv <= 0 && def <= 0) continue;
      const remaining = Math.max(0, num(l.qty) - num(l.qty_received));
      const isShort = recv < remaining;
      base.push({ po_line_id: l.id, qty_received: recv, qty_defective: def, case_type: isShort ? "partial_wait" : "full" });
      if (isShort) { shortIds.push(l.id); shortNames.push(l.item_name); }
    }
    if (base.length === 0) { setErr("กรอกจำนวนรับอย่างน้อย 1 รายการ"); return; }
    if (shortIds.length > 0) setShortDialog({ base, shortIds, shortNames });
    else void doSubmit(base);
  };

  const resolveShort = (caseType: "partial_close" | "partial_wait") => {
    if (!shortDialog) return;
    const ids = new Set(shortDialog.shortIds);
    const payload = shortDialog.base.map((l) => ids.has(l.po_line_id) ? { ...l, case_type: caseType } : l);
    void doSubmit(payload);
  };

  // แท็บ B: บันทึก (จัดกลุ่มตาม PO → ยิงทีละใบ)
  // รับครบ/เกิน = full · รับไม่ครบ + เลือกปิดบิล = partial_close · รับไม่ครบ (ค่าเริ่มต้น) = partial_wait
  // บันทึกเฉพาะรายการที่มองเห็น (shownPend) — กันเผลอรับของที่ถูกซ่อนด้วยตัวกรองร้าน/คำค้น
  const savePending = async () => {
    setErr(null);
    if (!attachReady) { setErr("ต้องแนบ ใบรับของ + บิล ให้ครบก่อนบันทึก"); return; }
    const byPo = new Map<string, PayloadLine[]>();
    for (const it of shownPend) {
      const inp = pendInputs[it.id];
      const recv = num(inp?.recv);
      const def = num(inp?.def);
      if (recv <= 0 && def <= 0) continue;
      const isShort = recv < it.remaining;
      const caseType = !isShort ? "full" : (inp?.close ? "partial_close" : "partial_wait");
      const arr = byPo.get(it.po_id) ?? [];
      arr.push({ po_line_id: it.id, qty_received: recv, qty_defective: def, case_type: caseType });
      byPo.set(it.po_id, arr);
    }
    if (byPo.size === 0) { setErr("กรอกจำนวนรับอย่างน้อย 1 รายการ"); return; }
    setSaving(true);
    try {
      const results: string[] = [];
      for (const [pid, payload] of byPo) {
        const j = await postReceive(pid, payload);
        if (j.error) { setErr(`PO ${pos.find(p => p.id === pid)?.po_no ?? pid}: ${j.error}`); setSaving(false); return; }
        results.push(j.gr_no);
      }
      setDone(`✅ รับสินค้าสำเร็จ ${results.length} ใบรับ (${byPo.size} ใบสั่งซื้อ): ${results.join(", ")}`);
      resetAfterSave();
      await loadPending("pending");
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  };

  const dialogDismiss = useBackdropDismiss(() => setShortDialog(null));

  // กล่องแนบไฟล์ (ใช้ร่วม 2 แท็บ)
  const attachBox = (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
      <div className="text-sm font-semibold text-slate-700 mb-2">📎 เอกสารแนบ (บังคับ) <span className="text-xs font-normal text-slate-400">— รูปถ่ายหรือ PDF</span></div>
      <div className="grid grid-cols-2 gap-3">
        <FileInput label="📄 ใบรับของ" value={receiptKey} onChange={setReceiptKey} folder="goods-receipts" required hasError={!receiptKey && !!err} />
        <FileInput label="🧾 บิล / ใบเสร็จ" value={billKey} onChange={setBillKey} folder="goods-receipts" required hasError={!billKey && !!err} />
      </div>
    </div>
  );

  return (
    <PlaygroundShell>
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-xl font-bold text-slate-800">📥 รับสินค้าเข้า</h1>
        <p className="text-sm text-slate-500 mt-0.5 mb-4">เลือกวิธีรับ → กรอกจำนวนที่รับจริง → แนบใบรับ/บิล → บันทึก (รับเกินได้ · ถ้ารับไม่ครบจะถามว่าจบงานหรือรอของ)</p>

        {/* แท็บเลือกมุมมอง */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden mb-4 text-sm">
          <button onClick={() => { setTab("pending"); setDone(null); }} className={`px-4 py-2 transition-colors ${tab === "pending" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>📦 สินค้าที่รอเข้า</button>
          <button onClick={() => { setTab("po"); setDone(null); }} className={`px-4 py-2 transition-colors ${tab === "po" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>📋 ตามใบสั่งซื้อ</button>
          <button onClick={() => { setTab("done"); setDone(null); }} className={`px-4 py-2 transition-colors ${tab === "done" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>✅ รับครบแล้ว</button>
        </div>

        {done && <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{done} — <a href="/m/goods-receipts-v2" className="underline">ดูใบรับสินค้า</a></div>}
        {err && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {err}</div>}

        {tab === "pending" && attachBox}

        {tab === "po" ? (
          <>
            {/* ค้นหาใบ PO */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-700">ใบสั่งซื้อที่รอรับ ({poCards.length})</span>
              <input value={poQ} onChange={(e) => setPoQ(e.target.value)} placeholder="🔎 ค้นหา เลขที่ PO / ร้าน..."
                className="ml-auto w-72 h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>

            {/* การ์ดใบ PO — กดเพื่อเปิด popup รับของ */}
            {poCards.length === 0 ? (
              <div className="py-16 text-center text-slate-300 text-sm">{poQ.trim() ? "— ไม่พบใบสั่งซื้อที่ค้นหา —" : "— ไม่มีใบสั่งซื้อที่รอรับ —"}</div>
            ) : (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {poCards.map((p) => {
                  const badge = PO_BADGE[p.status] ?? { text: p.status, cls: "bg-slate-100 text-slate-600 border-slate-200" };
                  return (
                    <div key={p.id} onClick={() => onPickPo(p.id)}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-800">{p.po_no}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${badge.cls}`}>{badge.text}</span>
                      </div>
                      <div className="text-sm text-slate-700 mt-1 truncate" title={p.seller_name}>🏪 {p.seller_name}</div>
                      <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-3 flex-wrap">
                        <span>📅 สั่ง: {p.order_date ? formatDate(p.order_date) : "—"}</span>
                        {p.expected_date && <span>🚚 คาดเข้า: {formatDate(p.expected_date)}</span>}
                      </div>
                      <div className="mt-2 h-8 px-2 text-xs font-medium rounded-md flex items-center justify-center bg-blue-50 text-blue-700 border border-blue-100">
                        📦 รอรับ {p.pendCount.toLocaleString()} รายการ — แตะเพื่อรับของ
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* แท็บ B/C: สินค้าที่รอเข้า / รับครบแล้ว — มี list ร้านซ้ายมือ */
          <div className="flex flex-col lg:flex-row gap-4">
            {/* ซ้าย: รายชื่อร้าน (กดเพื่อกรอง) */}
            <aside className="w-full lg:w-52 shrink-0">
              <div className="text-xs font-medium text-slate-500 mb-1.5">ร้าน ({pendShops.length})</div>
              <input value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder="🔎 ค้นหาร้าน…" className="w-full h-8 px-2 mb-2 text-xs border border-slate-200 rounded-md" />
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => { setActiveShop(null); setActiveMo(null); }} className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 ${!activeShop && !activeMo ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🛍️ ทุกร้าน ({pend.length})</button>
                {pendShops.filter((s) => !shopQ.trim() || s.name.toLowerCase().includes(shopQ.trim().toLowerCase())).map((s) => (
                  <button key={s.name} onClick={() => { setActiveShop(s.name); setActiveMo(null); }} className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 ${activeShop === s.name ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <div className={`text-sm ${activeShop === s.name ? "text-blue-700 font-medium" : "text-slate-700"}`}>🏪 {s.name}</div>
                    <div className="text-[11px] text-slate-400">{s.count} รายการ</div>
                  </button>
                ))}
              </div>

              {/* จากใบสั่งผลิต (MO) — กดเพื่อดูเฉพาะของที่ขอซื้อมาจากใบสั่งผลิตนั้น */}
              {pendMos.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-slate-500 mb-1.5">🏭 จากใบสั่งผลิต ({pendMos.length})</div>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    {pendMos.map((m) => (
                      <button key={m.mo} onClick={() => { setActiveMo(m.mo); setActiveShop(null); }} className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 ${activeMo === m.mo ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                        <div className={`text-sm ${activeMo === m.mo ? "text-indigo-700 font-medium" : "text-slate-700"}`}>🏭 {m.mo}</div>
                        <div className="text-[11px] text-slate-400">{m.product ? `${m.product} · ` : ""}{m.count} รายการ</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* ขวา: เนื้อหาเดิม */}
            <div className="flex-1 min-w-0">
            {/* แถบเครื่องมือ: ค้นหา / เรียงลำดับ / การ์ด-แถว / สลับมุมมอง */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-700">{doneMode ? "รายการที่ปิดแล้ว" : "สินค้าที่รอเข้า"} ({pend.length})</span>
              <input value={pendQ} onChange={(e) => setPendQ(e.target.value)} placeholder="🔎 ค้นหา ชื่อ / รหัส / PO / ร้าน..."
                className="ml-auto w-64 h-9 px-3 text-sm border border-slate-200 rounded-md" />
              <label className="flex items-center gap-1.5 text-xs text-slate-500">เรียงตาม
                <select value={pendSort} onChange={(e) => changePendSort(e.target.value as PendSort)} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
                  <option value="eta">วันคาดการณ์ของเข้า</option>
                  <option value="order">วันที่สั่ง</option>
                  <option value="name">ชื่อสินค้า</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">จัดกลุ่ม
                <select value={pendGroup} onChange={(e) => changePendGroup(e.target.value as PendGroup)} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
                  <option value="none">ไม่จัดกลุ่ม</option>
                  <option value="shop">ร้าน</option>
                  <option value="eta">วันคาดการณ์ของเข้า</option>
                  <option value="po">ใบสั่งซื้อ (PO)</option>
                  <option value="mo">ใบสั่งผลิต (MO)</option>
                </select>
              </label>
              {pendView === "card" && !doneMode && (
                <button onClick={() => setDesignOpen(true)} title="เลือกข้อมูลที่โชว์บนการ์ด" className="h-9 px-3 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">🎨 ออกแบบการ์ด</button>
              )}
              {pendView === "card" && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500">การ์ด/แถว
                  <select value={pendCols} onChange={(e) => changePendCols(Number(e.target.value))} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">{COL_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </label>
              )}
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                <button onClick={() => changePendView("card")} className={`h-9 px-3 ${pendView === "card" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▦ การ์ด</button>
                <button onClick={() => changePendView("table")} className={`h-9 px-3 border-l border-slate-200 ${pendView === "table" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▤ ตาราง</button>
              </div>
            </div>

            {pendLoading ? (
              <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            ) : pend.length === 0 ? (
              <div className="py-16 text-center text-slate-300 text-sm">{doneMode ? "— ยังไม่มีรายการที่รับครบ —" : "— ไม่มีสินค้าค้างรับ —"}</div>
            ) : shownPend.length === 0 ? (
              <div className="py-16 text-center text-slate-300 text-sm">— ไม่พบรายการที่ค้นหา —</div>
            ) : pendView === "card" ? (
              /* มุมมองการ์ด — แตะการ์ดเพื่อกรอกจำนวนใน popup */
              <div className="space-y-5">
                {groupedPend.map((g) => (
                  <section key={g.key}>
                    {g.label && <h3 className="text-sm font-semibold text-slate-700 mb-2">{g.label} <span className="text-xs font-normal text-slate-400">({g.items.length})</span></h3>}
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${pendCols}, minmax(0, 1fr))` }}>
                      {g.items.map((it) => {
                        const inp = pendInputs[it.id] ?? { recv: "0", def: "0" };
                        const recv = num(inp.recv), def = num(inp.def);
                        const hasQty = !doneMode && (recv > 0 || def > 0);
                        const short = recv > 0 && recv < it.remaining;
                        const b = doneMode
                          ? (DONE_BADGE[it.line_status] ?? { text: it.line_status, cls: "bg-slate-100 text-slate-500 border-slate-200" })
                          : etaBadge(it.days_remaining);
                        return (
                          <div key={it.id} onClick={() => setQtyEdit(it)}
                            className={`bg-white border rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all ${hasQty ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-blue-300 hover:shadow-sm"}`}>
                            <div className="aspect-square bg-slate-50 flex items-center justify-center relative">
                              <span className={`absolute top-1.5 left-1.5 z-10 text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.text}</span>
                              {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-3xl">📦</span>}
                            </div>
                            <div className="p-2.5 flex flex-col flex-1">
                              <div className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug" title={it.item_name}>{stripCode(it.item_name)}</div>
                              {it.code && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{it.code}</div>}
                              {doneMode ? (
                                <>
                                  <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums leading-none">{it.qty_received.toLocaleString()} <span className="text-sm font-normal text-slate-400">/ {it.qty.toLocaleString()} {it.uom}</span></div>
                                  <div className="text-[11px] text-slate-400">รับแล้ว / สั่ง{it.qty_defective > 0 ? <span className="text-red-500"> · เสีย {it.qty_defective.toLocaleString()}</span> : ""}{it.remaining > 0 ? <span className="text-orange-600"> · ขาด {it.remaining.toLocaleString()}</span> : ""}</div>
                                </>
                              ) : (
                                <>
                                  <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums leading-none">{it.remaining.toLocaleString()} <span className="text-xs font-normal text-slate-400">{it.uom}</span></div>
                                  <div className="text-[11px] text-slate-400">คงเหลือรอรับ{it.qty_received > 0 ? <span className="text-emerald-600"> · รับแล้ว {it.qty_received.toLocaleString()} ({it.receive_count} ครั้ง)</span> : ""}</div>
                                </>
                              )}
                              {doneMode ? (
                                <>
                                  <div className="text-[11px] text-slate-500 mt-1 truncate" title={`${it.seller_name} · ${it.po_no}`}>🏪 {it.seller_name} · {it.po_no}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">📅 สั่ง: {it.order_date ? formatDate(it.order_date) : "—"}</div>
                                </>
                              ) : (
                                /* การ์ดติดตาม: โชว์เฉพาะ field ที่ตั้งค่าไว้ (Card Builder) ตามลำดับ */
                                <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                                  {trackKeys.map((k) => {
                                    if (k === "shop_po") return <div key={k} className="truncate" title={`${it.seller_name} · ${it.po_no}`}>🏪 {it.seller_name} · {it.po_no}</div>;
                                    if (k === "order_date") return <div key={k}>📅 สั่ง: {it.order_date ? formatDate(it.order_date) : "—"}</div>;
                                    if (k === "expected") return (
                                      <div key={k} className="flex items-center gap-1 flex-wrap">
                                        <span>🚚 คาดเข้า: {it.expected_date ? formatDate(it.expected_date) : <span className="text-slate-300">ยังไม่ระบุ</span>}</span>
                                        {it.expected_source === "lead" && <span title="ประเมินจากลีดไทม์ร้าน (แก้ได้)" className="text-[10px] text-indigo-500">~ลีดไทม์</span>}
                                        <button onClick={(e) => { e.stopPropagation(); setEtaEdit({ po_id: it.po_id, po_no: it.po_no, seller_name: it.seller_name, value: it.expected_source === "po" ? (it.expected_date ?? "") : "" }); }}
                                          title="แก้วันคาดการณ์ของเข้า (ใช้กับทั้งใบ PO)" className="text-slate-400 hover:text-blue-600 text-xs">✎</button>
                                      </div>
                                    );
                                    if (k === "payment") { const pb = payBadge(it); return (
                                      <div key={k} className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pb.cls}`}>{pb.text}</span>
                                        {it.duration_days != null && <span className="text-[10px] text-slate-400">ค้างมา {it.duration_days} วัน</span>}
                                      </div>
                                    ); }
                                    if (k === "mo") return it.source_mo_no ? <div key={k}>🏭 {it.source_mo_no}{it.used_for_label ? <span className="text-slate-400"> · {it.used_for_label}</span> : ""}</div> : null;
                                    return null;
                                  })}
                                </div>
                              )}
                              {/* แถบล่าง: pending = สรุปจำนวนที่จะรับ (คลิกการ์ดเพื่อกรอก) · done = ดูประวัติ */}
                              {doneMode ? (
                                <div className="mt-2 h-8 px-2 text-xs font-medium rounded-md flex items-center justify-center bg-slate-50 text-slate-500 border border-slate-200">👁 ดูประวัติ / แก้ไข</div>
                              ) : (
                                <div className={`mt-2 h-8 px-2 text-xs font-medium rounded-md flex items-center justify-center ${hasQty ? (short ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-blue-100 text-blue-700 border border-blue-200") : "bg-slate-50 text-slate-400 border border-slate-200"}`}>
                                  {hasQty ? <>✓ รับ {recv.toLocaleString()} {it.uom}{def > 0 ? ` · เสีย ${def.toLocaleString()}` : ""}{short ? (inp.close ? " · ปิดบิล" : " · รอรับเพิ่ม") : ""}</> : "แตะเพื่อกรอก / ดูสถานะ"}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              /* มุมมองตาราง */
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-3 py-2 font-medium w-14">รูป</th>
                        <th className="text-left px-3 py-2 font-medium">สินค้า</th>
                        <th className="text-left px-3 py-2 font-medium">ร้าน / PO</th>
                        <th className="text-left px-3 py-2 font-medium">วันที่สั่ง</th>
                        {doneMode ? (
                          <>
                            <th className="text-left px-3 py-2 font-medium">สถานะ</th>
                            <th className="text-right px-3 py-2 font-medium">สั่ง</th>
                            <th className="text-right px-3 py-2 font-medium">รับแล้ว</th>
                            <th className="text-right px-3 py-2 font-medium">เสีย/ผิด</th>
                          </>
                        ) : (
                          <>
                            <th className="text-left px-3 py-2 font-medium">คาดเข้า</th>
                            <th className="text-right px-3 py-2 font-medium">คงเหลือ</th>
                            <th className="px-3 py-2 font-medium">รับครั้งนี้</th>
                            <th className="px-3 py-2 font-medium">เสีย/ผิด</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groupedPend.map((g) => (
                        <Fragment key={g.key}>
                          {g.label && <tr className="bg-slate-50/70"><td colSpan={8} className="px-3 py-1.5 text-xs font-semibold text-slate-600">{g.label} <span className="font-normal text-slate-400">({g.items.length})</span></td></tr>}
                          {g.items.map((it) => {
                        const inp = pendInputs[it.id] ?? { recv: "0", def: "0" };
                        const short = num(inp.recv) > 0 && num(inp.recv) < it.remaining;
                        const b = etaBadge(it.days_remaining);
                        return (
                          <tr key={it.id}>
                            <td className="px-3 py-2">
                              <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100">
                                {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2"><div className="text-slate-700">{stripCode(it.item_name)}</div>{it.code && <div className="text-[11px] font-mono text-slate-400">{it.code}</div>}</td>
                            <td className="px-3 py-2 text-slate-500"><div className="text-slate-700">{it.seller_name}</div><div className="text-[11px] text-slate-400">{it.po_no}</div></td>
                            <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{it.order_date ? formatDate(it.order_date) : "—"}</td>
                            {doneMode ? (
                              <>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${(DONE_BADGE[it.line_status] ?? { cls: "bg-slate-100 text-slate-500 border-slate-200" }).cls}`}>{(DONE_BADGE[it.line_status] ?? { text: it.line_status }).text}</span>
                                  <button onClick={(e) => { e.stopPropagation(); setQtyEdit(it); }} title="ดูประวัติ / แก้ไข" className="ml-1 text-slate-400 hover:text-blue-600 text-xs">👁</button>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{it.qty.toLocaleString()} {it.uom}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">{it.qty_received.toLocaleString()}{it.remaining > 0 ? <span className="text-[10px] text-orange-600 ml-1">ขาด {it.remaining.toLocaleString()}</span> : ""}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${it.qty_defective > 0 ? "text-red-600" : "text-slate-300"}`}>{it.qty_defective > 0 ? it.qty_defective.toLocaleString() : "-"}</td>
                              </>
                            ) : (
                              <>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="text-xs text-slate-500">{it.expected_date ? formatDate(it.expected_date) : <span className="text-slate-300">ยังไม่ระบุ</span>}{it.expected_source === "lead" && <span className="text-[10px] text-indigo-500 ml-1">~ลีดไทม์</span>}</div>
                              <div className="flex items-center gap-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.text}</span>
                                <button onClick={() => setEtaEdit({ po_id: it.po_id, po_no: it.po_no, seller_name: it.seller_name, value: it.expected_source === "po" ? (it.expected_date ?? "") : "" })}
                                  title="แก้วันคาดการณ์ของเข้า (ใช้กับทั้งใบ PO)" className="text-slate-400 hover:text-blue-600 text-xs">✎</button>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">{it.remaining.toLocaleString()} {it.uom}</td>
                            <td className="px-3 py-2">
                              <input type="number" step="any" min={0} value={inp.recv} onChange={(e) => setPendInput(it.id, { recv: e.target.value })}
                                className={`w-20 h-8 px-2 text-sm text-right border rounded ${short ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="any" min={0} value={inp.def} onChange={(e) => setPendInput(it.id, { def: e.target.value })}
                                className="w-20 h-8 px-2 text-sm text-right border border-slate-200 rounded" />
                            </td>
                              </>
                            )}
                          </tr>
                        );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* แถบบันทึก — รับได้ทั้งโหมดการ์ด (กรอกในป๊อป) และตาราง (กรอก inline) */}
            {!doneMode && shownPend.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mt-4 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs text-slate-400">รับไม่ครบ = &quot;รอรับเพิ่ม&quot; (เปลี่ยนเป็นปิดบิลได้ในแต่ละรายการ)</span>
                <button onClick={savePending} disabled={saving || !attachReady} title={!attachReady ? "แนบใบรับของ + บิลก่อน" : ""}
                  className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                  {saving ? "กำลังบันทึก…" : "บันทึกรับสินค้า →"}
                </button>
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* popup รับของตามใบ PO — กดการ์ดใบ PO แล้วกรอกจำนวน + แนบเอกสาร + บันทึกในป๊อปเดียว */}
      {poId && (
        <ERPModal open onClose={() => { if (!saving) { setPoId(""); setLines([]); } }} size="lg" storageKey="recv-po"
          title={`📥 รับสินค้า — ${selectedPo?.po_no ?? ""}`}
          description={`🏪 ${selectedPo?.seller_name ?? ""} · กรอกจำนวนที่รับจริง แนบใบรับ/บิล แล้วบันทึก`}
          footer={<>
            <button onClick={() => { setPoId(""); setLines([]); }} disabled={saving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ปิด</button>
            <button onClick={onSave} disabled={saving || !attachReady || loading || lines.length === 0} title={!attachReady ? "แนบใบรับของ + บิลก่อน" : ""}
              className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {saving ? "กำลังบันทึก…" : "บันทึกรับสินค้า →"}
            </button>
          </>}>
          {attachBox}
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : lines.length === 0 ? (
            <div className="py-10 text-center text-slate-300 text-sm">— ใบนี้ไม่มีรายการสินค้า —</div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">สินค้า</th>
                      <th className="text-right px-3 py-2 font-medium">สั่ง</th>
                      <th className="text-right px-3 py-2 font-medium">รับแล้ว</th>
                      <th className="text-right px-3 py-2 font-medium">คงเหลือ</th>
                      <th className="px-3 py-2 font-medium">รับครั้งนี้</th>
                      <th className="px-3 py-2 font-medium">เสีย/ผิด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => {
                      const remaining = Math.max(0, num(l.qty) - num(l.qty_received));
                      const inp = inputs[l.id] ?? { recv: "0", def: "0" };
                      const short = num(inp.recv) > 0 && num(inp.recv) < remaining;
                      return (
                        <tr key={l.id}>
                          <td className="px-4 py-2 text-slate-700">{stripCode(l.item_name)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{num(l.qty).toLocaleString()} {l.uom}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{num(l.qty_received).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">{remaining.toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <input type="number" step="any" min={0} value={inp.recv} onChange={(e) => setInput(l.id, { recv: e.target.value })}
                              className={`w-20 h-8 px-2 text-sm text-right border rounded ${short ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" step="any" min={0} value={inp.def} onChange={(e) => setInput(l.id, { def: e.target.value })}
                              className="w-20 h-8 px-2 text-sm text-right border border-slate-200 rounded" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ERPModal>
      )}

      {/* ป๊อปออกแบบการ์ด (Card Builder) */}
      {designOpen && (
        <CardLayoutEditor scopeKey="receive-tracking" available={TRACK_CARD_FIELDS} current={cardFields}
          canManageDefault={canDesign} onClose={() => setDesignOpen(false)}
          onSaved={() => { setDesignOpen(false); void reloadCard(); }} />
      )}

      {/* popup กรอกจำนวนรับ (แท็บรอเข้า) / ดูประวัติ+แก้ไข (แท็บรับครบแล้ว) */}
      {qtyEdit && (() => {
        const it = qtyEdit;
        // ตารางประวัติการรับ (ใช้ร่วมทั้ง 2 โหมด)
        const historyBlock = (
          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-600 mb-1.5">ประวัติการรับ {history.length > 0 && <span className="font-normal text-slate-400">· รับสะสมแล้ว {history.reduce((s, h) => s + h.qty_received, 0).toLocaleString()} {it.uom}</span>}</div>
            {histLoading ? (
              <div className="py-4 text-center text-xs text-slate-400">กำลังโหลด…</div>
            ) : history.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg">— ยังไม่เคยรับรอบก่อนหน้า —</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-2.5 py-1.5 font-medium">วันที่รับ</th>
                      <th className="text-left px-2.5 py-1.5 font-medium">ผู้รับ</th>
                      <th className="text-right px-2.5 py-1.5 font-medium">รับ</th>
                      <th className="text-right px-2.5 py-1.5 font-medium">เสีย/ผิด</th>
                      <th className="text-left px-2.5 py-1.5 font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{h.receive_date ? formatDate(h.receive_date) : "—"}</td>
                        <td className="px-2.5 py-1.5 text-slate-600">{h.receiver || "—"}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{h.qty_received.toLocaleString()}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-500">{h.qty_defective ? h.qty_defective.toLocaleString() : "-"}</td>
                        <td className="px-2.5 py-1.5 text-slate-500">{CASE_LABEL[h.case_type] ?? h.case_type}{h.gr_no ? <span className="text-slate-300"> · {h.gr_no}</span> : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

        // ── โหมดดูรายการที่ปิดแล้ว: ประวัติ + เปิดกลับมารอรับ / ลิงก์ไปใบรับ ──
        if (doneMode) {
          const badge = DONE_BADGE[it.line_status] ?? { text: it.line_status, cls: "bg-slate-100 text-slate-500 border-slate-200" };
          return (
            <ERPModal open onClose={() => !reopening && setQtyEdit(null)} size="md" storageKey="recv-done"
              title="ประวัติ / แก้ไขรายการรับ"
              description={`🏪 ${it.seller_name} · ${it.po_no}`}
              footer={<>
                <a href="/m/goods-receipts-v2" className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🔗 ไปที่ใบรับ (GR)</a>
                {it.remaining > 0 && (
                  <button onClick={() => void reopenLine(it)} disabled={reopening}
                    className="px-4 h-9 text-sm font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50">
                    {reopening ? "กำลังเปิดกลับ…" : "↩ เปิดกลับมารอรับ"}
                  </button>
                )}
                <button onClick={() => setQtyEdit(null)} disabled={reopening} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">ปิด</button>
              </>}>
              <div className="flex gap-3">
                <div className="w-20 h-20 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shrink-0">
                  {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-2xl">📦</span>}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 leading-snug">{stripCode(it.item_name)}</div>
                  {it.code && <div className="text-[11px] font-mono text-slate-500 mt-0.5">{it.code}</div>}
                  <div className="text-sm text-slate-600 mt-1">รับแล้ว <b className="text-slate-900">{it.qty_received.toLocaleString()}</b> / สั่ง {it.qty.toLocaleString()} {it.uom}{it.qty_defective > 0 && <span className="text-red-600"> · เสีย {it.qty_defective.toLocaleString()}</span>}</div>
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.text}</span>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {it.remaining > 0
                  ? <>รายการนี้ปิดยอดทั้งที่ยังขาด {it.remaining.toLocaleString()} {it.uom} — ถ้าของมาเพิ่ม กด <b>↩ เปิดกลับมารอรับ</b> เพื่อรับต่อได้</>
                  : <>รับครบจำนวนแล้ว — ถ้าตัวเลขผิด (เช่น บันทึกเกินจริง) ให้แก้ที่เอกสารใบรับ (GR) เพื่อให้หลักฐานตรงกัน</>}
              </div>
              {historyBlock}
            </ERPModal>
          );
        }

        // ── โหมดติดตาม + รับของ: กรอกรับ + สถานะจ่าย + ประวัติ (รับแบบหลายรายการที่โหมดตาราง ▤ ก็ได้) ──
        const b = etaBadge(it.days_remaining);
        const pb = payBadge(it);
        const inp = pendInputs[it.id] ?? { recv: "0", def: "0" };
        const recv = num(inp.recv), def = num(inp.def);
        const short = recv > 0 && recv < it.remaining;
        const over = recv > it.remaining;
        return (
          <ERPModal open onClose={() => !marking && setQtyEdit(null)} size="md" storageKey="recv-track"
            title="รับของ / สถานะ / ประวัติ"
            description={`🏪 ${it.seller_name} · ${it.po_no}`}
            footer={<>
              {it.payment_status === "paid"
                ? <button onClick={() => void unmarkPaid(it)} disabled={marking} className="mr-auto px-3 h-9 text-xs font-medium border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 disabled:opacity-50">↩ ยกเลิกจ่าย</button>
                : !it.ship_before_pay && <button onClick={() => setPayEdit({ po_id: it.po_id, po_no: it.po_no, value: new Date().toISOString().slice(0, 10) })} disabled={marking} className="mr-auto px-4 h-9 text-sm font-medium border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50">💰 จ่าย</button>}
              <button onClick={() => setQtyEdit(null)} disabled={marking} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">ปิด</button>
            </>}>
            <div className="flex gap-3">
              <div className="w-20 h-20 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shrink-0">
                {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-2xl">📦</span>}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 leading-snug">{stripCode(it.item_name)}</div>
                {it.code && <div className="text-[11px] font-mono text-slate-500 mt-0.5">{it.code}</div>}
                <div className="text-sm text-slate-600 mt-1">คงเหลือรอรับ <b className="text-slate-900">{it.remaining.toLocaleString()}</b> {it.uom}{it.qty_received > 0 && <span className="text-emerald-600"> · รับแล้ว {it.qty_received.toLocaleString()} ({it.receive_count} ครั้ง)</span>}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.text}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pb.cls}`}>{pb.text}</span>
                  {it.duration_days != null && <span className="text-[10px] text-slate-400">ค้างมา {it.duration_days} วัน</span>}
                </div>
              </div>
            </div>

            {/* กรอกจำนวนรับ (รอบนี้) */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">รับครั้งนี้ ({it.uom})</label>
                <input type="number" step="any" min={0} autoFocus value={inp.recv} onChange={(e) => setPendInput(it.id, { recv: e.target.value })} onFocus={(e) => e.target.select()}
                  className={`w-full h-11 px-3 text-lg text-right border rounded-md ${short || over ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">เสีย / ผิด ({it.uom})</label>
                <input type="number" step="any" min={0} value={inp.def} onChange={(e) => setPendInput(it.id, { def: e.target.value })}
                  className="w-full h-11 px-3 text-lg text-right border border-slate-200 rounded-md" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button onClick={() => setPendInput(it.id, { recv: String(it.remaining) })} className="h-8 px-3 text-xs font-medium rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">รับครบ ({it.remaining.toLocaleString()})</button>
              {over && <span className="text-[11px] text-amber-600">⚠ รับเกินจำนวนคงเหลือ</span>}
            </div>
            {short && (
              <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60">
                <div className="text-xs font-medium text-amber-800 mb-2">รับไม่ครบ (ขาด {(it.remaining - recv).toLocaleString()} {it.uom}) — จะจัดการส่วนที่ขาดอย่างไร?</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setPendInput(it.id, { close: false })} className={`text-left px-3 py-2 rounded-lg border text-xs ${!inp.close ? "border-amber-400 bg-white ring-1 ring-amber-200" : "border-slate-200 bg-white hover:border-amber-300"}`}>
                    <div className="font-medium text-slate-800">🟡 รอรับเพิ่ม</div><div className="text-[11px] text-slate-500 mt-0.5">ส่วนที่เหลือยังค้างรับต่อ</div>
                  </button>
                  <button onClick={() => setPendInput(it.id, { close: true })} className={`text-left px-3 py-2 rounded-lg border text-xs ${inp.close ? "border-orange-400 bg-white ring-1 ring-orange-200" : "border-slate-200 bg-white hover:border-orange-300"}`}>
                    <div className="font-medium text-slate-800">🔴 ปิดบิล (จบยอด)</div><div className="text-[11px] text-slate-500 mt-0.5">ไม่รอของที่ขาดแล้ว</div>
                  </button>
                </div>
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-400">กรอกแล้วกด <b>บันทึกรับสินค้า</b> ด้านล่าง (แนบใบรับ/บิลก่อน) — หรือกรอกหลายรายการที่โหมดตาราง ▤</div>
            {historyBlock}
          </ERPModal>
        );
      })()}

      {/* popup ใส่วันที่จ่าย (default วันนี้) */}
      {payEdit && (
        <ERPModal open onClose={() => !marking && setPayEdit(null)} size="sm" storageKey="recv-pay"
          title="💰 บันทึกการจ่ายเงิน"
          description={`ใบสั่งซื้อ ${payEdit.po_no} (มีผลกับทั้งใบ)`}
          footer={<>
            <button onClick={() => setPayEdit(null)} disabled={marking} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={() => void savePaid(payEdit.po_id, payEdit.po_no, payEdit.value)} disabled={marking} className="px-5 h-9 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{marking ? "กำลังบันทึก…" : "บันทึกว่าจ่ายแล้ว"}</button>
          </>}>
          <label className="block text-xs font-medium text-slate-600 mb-1">วันที่จ่ายเงิน</label>
          <input type="date" value={payEdit.value} onChange={(e) => setPayEdit((p) => p ? { ...p, value: e.target.value } : p)}
            className="w-full h-10 px-3 text-sm border border-slate-200 rounded-md" />
          <p className="text-[11px] text-slate-400 mt-2">วันคาดการณ์ของเข้าจะเริ่มนับจากวันนี้ + ลีดไทม์ร้าน</p>
        </ERPModal>
      )}

      {/* popup แก้วันคาดการณ์ของเข้า (ใช้กับทั้งใบ PO) */}
      {etaEdit && (
        <ERPModal open onClose={() => !etaSaving && setEtaEdit(null)} size="sm" storageKey="recv-eta"
          title="📅 วันคาดการณ์ของเข้า"
          description={`ใบสั่งซื้อ ${etaEdit.po_no} · ${etaEdit.seller_name} (มีผลกับทุกบรรทัดในใบนี้)`}
          footer={<>
            <button onClick={() => setEtaEdit(null)} disabled={etaSaving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={() => void saveEta()} disabled={etaSaving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{etaSaving ? "กำลังบันทึก…" : "บันทึก"}</button>
          </>}>
          <label className="block text-xs font-medium text-slate-600 mb-1">วันที่คาดว่าของจะเข้า</label>
          <input type="date" value={etaEdit.value} onChange={(e) => setEtaEdit((p) => p ? { ...p, value: e.target.value } : p)}
            className="w-full h-10 px-3 text-sm border border-slate-200 rounded-md" />
          <p className="text-[11px] text-slate-400 mt-2">เว้นว่างไว้ = กลับไปใช้ค่าประเมินจากลีดไทม์ร้าน (ถ้ามี)</p>
        </ERPModal>
      )}

      {/* popup ถามกรณีรับไม่ครบ (แท็บ A) */}
      {shortDialog && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" {...dialogDismiss}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">มีสินค้ารับไม่ครบ {shortDialog.shortIds.length} รายการ</h3>
              <p className="text-xs text-slate-500 mt-0.5">{shortDialog.shortNames.join(", ")}</p>
            </div>
            <div className="p-5 space-y-2">
              <p className="text-sm text-slate-600 mb-2">ต้องการจัดการยอดที่ขาดอย่างไร?</p>
              <button onClick={() => resolveShort("partial_close")} disabled={saving}
                className="w-full text-left px-4 py-3 border border-slate-200 rounded-lg hover:bg-orange-50 hover:border-orange-300 disabled:opacity-40">
                <div className="font-medium text-slate-800">🔴 จบงาน (ปิดยอดที่ขาด)</div>
                <div className="text-xs text-slate-500 mt-0.5">ไม่รอของส่วนที่เหลือแล้ว — สถานะ &quot;ปิดยอด (ขาด)&quot;</div>
              </button>
              <button onClick={() => resolveShort("partial_wait")} disabled={saving}
                className="w-full text-left px-4 py-3 border border-slate-200 rounded-lg hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40">
                <div className="font-medium text-slate-800">🟡 รอของ (รับเพิ่มภายหลัง)</div>
                <div className="text-xs text-slate-500 mt-0.5">ส่วนที่เหลือยังค้างรับต่อ — สถานะ &quot;รับบางส่วน&quot;</div>
              </button>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShortDialog(null)} disabled={saving}
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </PlaygroundShell>
  );
}
