"use client";

/**
 * "ช้อปจ่ายงาน" — มุมมองแบบช้อปปิ้ง (คู่กับบอร์ดลากการ์ด) ในหน้า /master/work-board
 *  • การ์ดสินค้ารอจ่าย + ค้นหา / เรียง / จัดกลุ่ม / กรอง (เหมือนหน้าขอซื้อ)
 *  • ระบบตะกร้า: ติ๊กหลายรายการ → เลือกโต๊ะ + "ช่างได้หลายคน" → กดจ่าย = ป๊อปยืนยัน "แบ่งงาน" (จำนวนต่อช่าง)
 *    + ติ๊กเลือกได้ว่าจะทำงานไหนเป็น "ตัด/เตรียมครบ" ตอนจ่ายด้วย
 * ใช้ระบบเดิม: วนสร้างใบจ่ายงานทีละใบ/ช่างผ่าน POST /api/mo/work-orders · mark ครบผ่าน /api/mo/[id]/mark-ready
 * ของกลาง: HoverImage, ERPModal, useToast, apiFetch
 */
import { useMemo, useState } from "react";
import dynamicImport from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { HoverImage, HoverPreview } from "@/components/hover-image";
import { ERPModal } from "@/components/modal";
import { withImageWidth } from "@/lib/r2-image";
import { useViewPref } from "@/lib/use-view-pref";
import { useBackClose } from "@/lib/use-back-close";

// รับ PendingMO/Dept/Assignee จากหน้า work-board แบบ subset (structural) — ไม่ผูกชนิดข้ามไฟล์
type ShopMO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; remaining: number; due_date: string | null;
  image_url: string | null; brand: string | null; brand_color: string | null; ready: boolean;
  color?: string | null;   // สี (color_th ก่อน ไม่มีใช้ color) — โชว์ต่อท้ายชื่อ
  has_bom?: boolean;       // ใบนี้มีสูตรวัตถุดิบไหม (ไม่มี = เตือนบนการ์ด)
  // ธงที่ผู้บริหารติดไว้ในแท็บ 👔 แผนผู้บริหาร — 0=ปกติ 1=สำคัญ 2=เร่งด่วน (อ่านอย่างเดียวที่นี่)
  priority?: number; priority_note?: string | null;
};
type ShopDept = { id: string; name: string };
type ShopCraftsman = { id: string; name: string; code: string | null; department_id?: string | null };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const stageOfDept = (name: string) => (name.includes("ตัด") || name.includes("เตรียม") ? "cut" : "assemble");
const daysUntil = (due: string | null): number | null => {
  if (!due) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.floor((new Date(due + "T00:00:00").getTime() - t.getTime()) / 86400000);
};
const dueText = (due: string | null) => (due ? new Date(due + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
const dueClass = (due: string | null) => { const d = daysUntil(due); if (d == null) return "text-slate-400"; if (d < 0) return "text-rose-600 font-semibold"; if (d < 3) return "text-amber-600 font-semibold"; return "text-slate-500"; };

// แบ่งจำนวน total ให้ช่าง K คนเท่า ๆ กัน (เศษจำนวนเต็มไปคนแรก ๆ, เศษทศนิยมไปคนแรก)
function evenSplit(total: number, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const K = ids.length;
  if (K === 0) return out;
  const base = Math.floor(total / K);
  ids.forEach((id) => { out[id] = base; });
  let rem = total - base * K;
  let i = 0;
  while (rem >= 1 && i < K) { out[ids[i]] += 1; rem -= 1; i++; }
  if (rem > 0) out[ids[0]] = Math.round((out[ids[0]] + rem) * 10000) / 10000;
  return out;
}

type SortKey = "due" | "remaining" | "sku" | "mo" | "priority";

// ธงงานเร่งที่ผู้บริหารติดไว้ (ตั้งค่าที่แท็บ 👔 แผนผู้บริหาร — ที่นี่โชว์อย่างเดียว)
const PRIO_BADGE: Record<number, { icon: string; label: string; cls: string }> = {
  2: { icon: "🔥", label: "เร่งด่วน", cls: "bg-rose-600 text-white" },
  1: { icon: "⭐", label: "สำคัญ", cls: "bg-amber-500 text-white" },
};
const prioBadge = (m: ShopMO) => {
  const p = PRIO_BADGE[m.priority ?? 0];
  if (!p) return null;
  return (
    <span title={`ผู้บริหารทำเครื่องหมายว่า “${p.label}”${m.priority_note ? ` — ${m.priority_note}` : ""}`}
      className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${p.cls}`}>{p.icon} {p.label}</span>
  );
};
// เหตุผลที่ผู้บริหารเขียนไว้ตอนติดธง — ให้คนจ่ายงานเห็นว่าทำไมต้องเร่ง
const prioNote = (m: ShopMO) => ((m.priority ?? 0) > 0 && m.priority_note
  ? <div className="mt-1 text-[10px] text-rose-600 truncate" title={m.priority_note}>📌 {m.priority_note}</div>
  : null);
// หน้าตาการ์ด: big = รูปใหญ่เต็มการ์ด (ค่าเริ่มต้น) · compact = รูปเล็กข้างข้อความ (แบบเดิม)
const CARD_MODES = ["big", "compact"] as const;
type CardMode = (typeof CARD_MODES)[number];

/**
 * จำนวนการ์ดต่อแถว — จำค่าต่อผู้ใช้
 * ⚠️ ห้ามใช้ breakpoint ของ Tailwind (sm/lg/xl) เพราะมันอิง "ความกว้างจอ" ไม่ใช่เลขที่ผู้ใช้กด
 *    (เคยทำแบบนั้น → กด 6 บนจอ ~1000px ได้ 3 คอลัมน์ = ผิดความคาดหวัง)
 *    จึงสั่งด้วย inline style ให้ได้เลขตรงตามที่กดเสมอ
 */
const CARD_COLS = ["3", "4", "6", "8", "10"] as const;
type CardCols = (typeof CARD_COLS)[number];

// ป๊อปจัดกลุ่ม/ย้ายกลุ่มใบสั่งผลิต (ของกลางตัวเดียวกับหน้าตาราง/หน้าใบสั่งผลิต) — โหลดตอนกดเท่านั้น
const AssignToGroupModal = dynamicImport(
  () => import("@/app/master/manufacturing-orders/mo-groups-modal").then((m) => m.AssignToGroupModal),
  { ssr: false },
);

// ตัวขอแก้สูตร — โหลดตอนกดเท่านั้น (ตัวแก้สูตรของจริงหนัก ไม่ควรถ่วงหน้าช้อป)
const BomChangeRequestEditor = dynamicImport(
  () => import("@/components/bom-change-request").then((m) => m.BomChangeRequestEditor),
  { ssr: false },
);

const SORTS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "🔥 งานเร่งก่อน" },
  { key: "due", label: "ใกล้ครบกำหนด" },
  { key: "remaining", label: "คงเหลือมาก→น้อย" },
  { key: "sku", label: "รหัสสินค้า" },
  { key: "mo", label: "เลขใบสั่งผลิต" },
];

export function DispatchShop({
  pending, departments, craftsmen, canDispatch, moGroups, groupOf, laborByMo, onOpenMO, onReload,
}: {
  pending: ShopMO[];
  departments: ShopDept[];
  craftsmen: ShopCraftsman[];
  canDispatch: boolean;
  moGroups: { name: string; mo_nos: string[] }[];
  groupOf: (moNo: string) => string | null;
  laborByMo: Record<string, number>;
  onOpenMO: (mo: ShopMO) => void;
  onReload: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [groupMode, setGroupMode] = useState<"none" | "group" | "brand">("none");
  const [readyFilter, setReadyFilter] = useState<"all" | "ready" | "not" | "gap" | "urgent">("all");   // gap = ขาดสูตร/ค่าแรง · urgent = งานที่ผู้บริหารติดธง
  const [groupFilter, setGroupFilter] = useState<string>("__all__");
  // หน้าตาการ์ด (รูปใหญ่ / แบบรายการ) — จำต่อผู้ใช้ผ่านของกลาง useViewPref
  const { view: cardMode, setView: setCardMode, saveDefault: saveCardMode } = useViewPref("work_board_shop_card", CARD_MODES, "big");
  const { view: cardCols, setView: setCardCols, saveDefault: saveCardCols } = useViewPref("work_board_shop_cols", CARD_COLS, "4");
  const [cart, setCart] = useState<Record<string, number>>({});   // mo.id → จำนวนที่จะจ่าย
  const [cartOpen, setCartOpen] = useState(false);                // เปิด "หน้าตะกร้า" เต็มจอ (แทนแผงข้าง)
  const [groupOpen, setGroupOpen] = useState(false);              // ป๊อปจัดกลุ่ม/ย้ายกลุ่มใบที่ติ๊กไว้
  const [bomReqFor, setBomReqFor] = useState<ShopMO | null>(null); // กดป้าย "ไม่มีสูตร" → เปิดตัวเสนอสูตรของใบนั้น
  const [dept, setDept] = useState<string>("");
  const [craftIds, setCraftIds] = useState<string[]>([]);          // ช่างที่เลือก (หลายคน)
  const [craftListOpen, setCraftListOpen] = useState(false);
  const [craftSearch, setCraftSearch] = useState("");
  const [due, setDue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // ป๊อปยืนยันจ่ายงาน
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [splits, setSplits] = useState<Record<string, Record<string, number>>>({});   // itemId → craftId → qty
  const [markReady, setMarkReady] = useState<Record<string, boolean>>({});             // itemId → mark ตัด/เตรียมครบ
  const [rates, setRates] = useState<Record<string, number>>({});                       // itemId → ค่าแรง/ชิ้น (บังคับ >0)
  const [saveBom, setSaveBom] = useState(false);                                        // บันทึกค่าแรงกลับเข้า BOM (ราคากลาง)

  const selDept = departments.find((d) => d.id === dept) ?? null;
  const isHire = !!selDept && /เหมา/.test(selDept.name);   // แผนกช่างเหมา = ต้องระบุช่าง
  const craftPool = useMemo(
    () => (!selDept || isHire ? craftsmen : craftsmen.filter((c) => c.department_id === selDept.id)),
    [craftsmen, selDept, isHire],
  );
  const selectedCrafts = useMemo(() => craftIds.map((id) => craftPool.find((c) => c.id === id) ?? craftsmen.find((c) => c.id === id)).filter(Boolean) as ShopCraftsman[], [craftIds, craftPool, craftsmen]);
  const changeDept = (id: string) => { setDept(id); setCraftIds([]); setCraftListOpen(false); };
  const toggleCraft = (id: string) => setCraftIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hasGap = (m: ShopMO) => m.has_bom === false || !((laborByMo[m.mo_no] ?? 0) > 0);
    const list = pending.filter((m) =>
      (readyFilter === "all" ? true : readyFilter === "urgent" ? (m.priority ?? 0) > 0 : readyFilter === "gap" ? hasGap(m) : readyFilter === "ready" ? m.ready : !m.ready) &&
      (groupFilter === "__all__" ? true : groupFilter === "__none__" ? groupOf(m.mo_no) === null : groupOf(m.mo_no) === groupFilter) &&
      (q === "" || `${m.product_sku ?? ""} ${m.product_name ?? ""} ${m.mo_no}`.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => {
      // งานเร่งก่อน → เท่ากันค่อยดูกำหนดส่ง
      if (sortKey === "priority") {
        const d = (b.priority ?? 0) - (a.priority ?? 0);
        if (d !== 0) return d;
        return (daysUntil(a.due_date) ?? 99999) - (daysUntil(b.due_date) ?? 99999);
      }
      if (sortKey === "due") return (daysUntil(a.due_date) ?? 99999) - (daysUntil(b.due_date) ?? 99999);
      if (sortKey === "remaining") return b.remaining - a.remaining;
      if (sortKey === "sku") return (a.product_sku ?? "").localeCompare(b.product_sku ?? "");
      return a.mo_no.localeCompare(b.mo_no);
    });
  }, [pending, search, readyFilter, groupFilter, groupOf, sortKey, laborByMo]);

  const buckets = useMemo(() => {
    if (groupMode === "none") return [{ name: "", items: filtered }];
    const map = new Map<string, ShopMO[]>();
    for (const m of filtered) {
      const k = groupMode === "group" ? (groupOf(m.mo_no) ?? "— ยังไม่จับกลุ่ม —") : (m.brand ?? "— ไม่ระบุแบรนด์ —");
      (map.get(k) ?? map.set(k, []).get(k)!).push(m);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [filtered, groupMode, groupOf]);

  const cartItems = useMemo(() => pending.filter((m) => cart[m.id] != null), [pending, cart]);
  const cartTotalQty = useMemo(() => cartItems.reduce((s, m) => s + (cart[m.id] || 0), 0), [cartItems, cart]);
  // กด back ของเบราว์เซอร์/ปัดขวาบนมือถือ ตอนอยู่หน้าตะกร้า = กลับไปหน้าเลือกงาน (ไม่หลุดออกจากบอร์ด)
  useBackClose(cartOpen, () => setCartOpen(false), "cart");

  const toggleCart = (m: ShopMO) => setCart((c) => { const n = { ...c }; if (n[m.id] != null) delete n[m.id]; else n[m.id] = m.remaining; return n; });
  const setQty = (id: string, v: number, max: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(max, v || 0)) }));
  const removeCart = (id: string) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });
  const addAllShown = () => setCart((c) => { const n = { ...c }; for (const m of filtered) if (n[m.id] == null) n[m.id] = m.remaining; return n; });

  // เปิดป๊อปยืนยัน — ตั้งค่าเริ่มต้น: แบ่งเท่ากันทุกช่าง + ไม่ mark ครบ
  const openConfirm = () => {
    if (!selDept) { toast.error("เลือกโต๊ะ/แผนกก่อน"); return; }
    if (craftIds.length === 0 && isHire) { toast.error("งานเหมา ต้องเลือกช่างอย่างน้อย 1 คน"); return; }
    const items = cartItems.filter((m) => (cart[m.id] || 0) > 0);
    if (items.length === 0) { toast.error("ตะกร้าว่าง (หรือจำนวนเป็น 0)"); return; }
    const initSplit: Record<string, Record<string, number>> = {};
    const initMark: Record<string, boolean> = {};
    const initRates: Record<string, number> = {};
    let anyZero = false;
    for (const m of items) {
      initSplit[m.id] = craftIds.length > 0 ? evenSplit(cart[m.id] || 0, craftIds) : { __dept__: cart[m.id] || 0 };
      initMark[m.id] = false;
      const r = laborByMo[m.mo_no] ?? 0; initRates[m.id] = r; if (!(r > 0)) anyZero = true;
    }
    setSplits(initSplit); setMarkReady(initMark); setRates(initRates); setSaveBom(anyZero); setConfirmOpen(true);
  };

  // คอลัมน์ในป๊อป = ช่างที่เลือก (ถ้าไม่เลือกช่าง = จ่ายทั้งแผนก 1 คอลัมน์)
  const cols = craftIds.length > 0 ? selectedCrafts.map((c) => ({ id: c.id, name: c.name })) : [{ id: "__dept__", name: selDept?.name ?? "ทั้งแผนก" }];
  const itemSum = (id: string) => Object.values(splits[id] ?? {}).reduce((n, v) => n + (v || 0), 0);
  const confirmItems = cartItems.filter((m) => (cart[m.id] || 0) > 0);
  const anyOver = confirmItems.some((m) => itemSum(m.id) > m.remaining + 0.0001);
  const totalWO = confirmItems.reduce((n, m) => n + cols.filter((c) => (splits[m.id]?.[c.id] || 0) > 0).length, 0);
  const missingRate = confirmItems.some((m) => itemSum(m.id) > 0 && !((rates[m.id] ?? 0) > 0));   // มีใบที่จ่ายแต่ยังไม่ใส่ค่าแรง

  const doDispatch = async () => {
    const craftById = new Map(craftsmen.map((c) => [c.id, c]));
    setSaving(true);
    let ok = 0; const fails: string[] = [];
    for (const m of confirmItems) {
      let dispatched = 0;
      const rate = rates[m.id] ?? 0;
      for (const c of cols) {
        const qty = splits[m.id]?.[c.id] || 0;
        if (qty <= 0) continue;
        const craft = c.id === "__dept__" ? null : craftById.get(c.id) ?? null;
        try {
          const res = await apiFetch("/api/mo/work-orders", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mo_no: m.mo_no, product_sku: m.product_sku, product_name: m.product_name,
              stage: stageOfDept(selDept!.name), department_id: selDept!.id, department_name: selDept!.name,
              assignee_type: craft ? "craftsman" : "department", assignee_id: craft?.id ?? null, assignee_name: craft?.name ?? selDept!.name,
              qty, uom: "ชิ้น", dispatch_date: new Date().toISOString().slice(0, 10), due_date: due || m.due_date || null,
              note: `จากใบสั่งผลิต ${m.mo_no}`, labor_cost: rate > 0 ? rate * qty : null }) });
          const j = await res.json(); if (j.error) throw new Error(j.error);
          ok++; dispatched += qty;
        } catch { fails.push(`${m.mo_no}·${craft?.name ?? "แผนก"}`); }
      }
      // ติ๊ก "ตัด/เตรียมครบ" → mark ทั้งใบ (หลังจ่ายสำเร็จอย่างน้อยบางส่วน)
      if (markReady[m.id] && dispatched > 0) {
        await apiFetch(`/api/mo/${encodeURIComponent(m.id)}/mark-ready`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ready: true }) }).catch(() => {});
      }
      // บันทึกค่าแรง/ชิ้น กลับเข้า BOM (ราคากลาง) ถ้าติ๊กไว้
      if (saveBom && dispatched > 0 && rate > 0 && m.product_sku) {
        await apiFetch("/api/bom/labor-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_sku: m.product_sku, rate }) }).catch(() => {});
      }
    }
    setSaving(false); setConfirmOpen(false);
    if (ok > 0) toast.success(`จ่ายเข้า ${selDept!.name} แล้ว ${ok} ใบจ่ายงาน${fails.length ? ` · พลาด ${fails.length}` : ""}`);
    else toast.error(`จ่ายไม่สำเร็จ: ${fails.slice(0, 3).join(", ")}`);
    setCart({}); setCraftIds([]); setCartOpen(false);   // จ่ายเสร็จ → กลับไปหน้าเลือกงาน
    await onReload();
  };

  const gridCols = `grid ${cardMode === "big" ? "gap-2.5" : "gap-2"}`;
  // เลขคอลัมน์ตรงตามที่กดเสมอ (ไม่อิงความกว้างจอ) — การ์ดจะแคบลงเองเมื่อเลือกเยอะ
  const gridStyle = { gridTemplateColumns: `repeat(${Number(cardCols)}, minmax(0, 1fr))` };
  const dense = Number(cardCols) >= 8;   // แถวละเยอะ = การ์ดแคบ ต้องย่อรูป/ตัวหนังสือ

  const readyBadge = (m: ShopMO) => (m.ready
    ? <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">พร้อม ✓</span>
    : <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">ยังไม่พร้อม</span>);

  // เตือนข้อมูลตั้งต้นที่ยังขาด — ไม่มีสูตร = จ่ายงานไปก็ไม่รู้ต้องใช้อะไร · ไม่มีค่าแรง = คิดเงินช่างไม่ได้
  const gapBadges = (m: ShopMO) => {
    const noBom = m.has_bom === false;
    const noLabor = !((laborByMo[m.mo_no] ?? 0) > 0);
    if (!noBom && !noLabor) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {noBom && (m.product_sku
          ? <button type="button" onClick={(e) => { e.stopPropagation(); setBomReqFor(m); }}
              title="ใบนี้ยังไม่มีสูตรวัตถุดิบ (BOM) — กดเพื่อเสนอสูตร (เข้าคิวรออนุมัติ ยังไม่กระทบสูตรจริง)"
              className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap hover:bg-rose-100 hover:border-rose-300">⚠ ไม่มีสูตร · เสนอ →</button>
          : <span title="ใบนี้ยังไม่มีสูตรวัตถุดิบ (BOM) และไม่มีรหัสสินค้า จึงเสนอสูตรจากตรงนี้ไม่ได้"
              className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">⚠ ไม่มีสูตร</span>)}
        {noLabor && <span title="ยังไม่ได้ตั้งค่าแรง/ชิ้น — ตอนจ่ายงานต้องกรอกเอง (ติ๊ก “บันทึกกลับเข้า BOM” ตอนจ่าย ครั้งหน้าจะเติมให้เอง)"
          className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">⚠ ไม่มีค่าแรง</span>}
      </div>
    );
  };

  // แถบล่างของการ์ด (เหลือ / ค่าแรง / กำหนดเสร็จ) — ใช้ร่วมทั้ง 2 แบบ
  const cardFooter = (m: ShopMO) => {
    const pp = laborByMo[m.mo_no] ?? 0;
    return (
      <>
        <div className="flex items-center justify-between gap-1 mt-2 text-[11px]">
          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 whitespace-nowrap">เหลือ <b className="text-sm">{fmt(m.remaining)}</b></span>
          {pp > 0 && <span className="text-amber-600 whitespace-nowrap">💰฿{fmt(pp)}</span>}
          <span className={`whitespace-nowrap ${dueClass(m.due_date)}`}>📅 {dueText(m.due_date)}</span>
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenMO(m); }}
          className="mt-1.5 w-full h-6 text-[11px] text-slate-500 border border-slate-200 rounded hover:bg-slate-50">📋 เช็กลิสต์</button>
      </>
    );
  };

  // การ์ดแบบรูปใหญ่ — รูปเต็มความกว้างด้านบน (ชี้ที่รูป = พรีวิวใหญ่), ข้อมูลอยู่ใต้รูป
  const renderCardBig = (m: ShopMO) => {
    const inCart = cart[m.id] != null;
    return (
      <div key={m.id} onClick={() => canDispatch && toggleCart(m)}
        className={`relative rounded-xl border bg-white overflow-hidden transition ${canDispatch ? "cursor-pointer" : ""} ${inCart ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}
        style={m.brand_color ? { borderLeftColor: m.brand_color, borderLeftWidth: 3 } : undefined}>
        <HoverPreview url={m.image_url ? (withImageWidth(m.image_url, 720) ?? m.image_url) : null} previewW={520}>
          <div className={`relative bg-slate-50 flex items-center justify-center ${dense ? "h-24" : "h-40"}`}>
            {m.image_url
              ? <img src={withImageWidth(m.image_url, dense ? 240 : 420) ?? m.image_url} alt={m.product_sku ?? ""} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
              : <span className="text-4xl text-slate-300">📦</span>}
            <span className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">{readyBadge(m)}{prioBadge(m)}</span>
            {canDispatch && (
              <input type="checkbox" checked={inCart} onClick={(e) => e.stopPropagation()} onChange={() => toggleCart(m)}
                className="absolute top-1.5 right-1.5 w-5 h-5 accent-indigo-600" />
            )}
          </div>
        </HoverPreview>
        <div className="p-2.5">
          <div className="text-sm font-semibold text-slate-800 truncate">{m.product_sku}</div>
          <div className="text-[11px] text-slate-500 truncate">{m.product_name}{m.color ? <span className="text-slate-400"> · {m.color}</span> : null}</div>
          <div className="text-[10px] text-slate-400 font-mono truncate">{m.mo_no}</div>
          {prioNote(m)}{gapBadges(m)}
          {cardFooter(m)}
        </div>
      </div>
    );
  };

  const renderCard = (m: ShopMO) => {
    if (cardMode === "big") return renderCardBig(m);
    const inCart = cart[m.id] != null;
    return (
      <div key={m.id} onClick={() => canDispatch && toggleCart(m)}
        className={`relative rounded-xl border bg-white p-2.5 transition ${canDispatch ? "cursor-pointer" : ""} ${inCart ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}
        style={m.brand_color ? { borderLeftColor: m.brand_color, borderLeftWidth: 3 } : undefined}>
        <div className="flex gap-2">
          <div className="shrink-0"><HoverImage url={m.image_url} size={48} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-slate-800 truncate">{m.product_sku}</span>
              {readyBadge(m)}
              {prioBadge(m)}
            </div>
            <div className="text-[11px] text-slate-500 truncate">{m.product_name}{m.color ? <span className="text-slate-400"> · {m.color}</span> : null}</div>
            <div className="text-[10px] text-slate-400 font-mono truncate">{m.mo_no}</div>
          </div>
          {canDispatch && <input type="checkbox" checked={inCart} onClick={(e) => e.stopPropagation()} onChange={() => toggleCart(m)} className="shrink-0 w-4 h-4 accent-indigo-600 mt-0.5" />}
        </div>
        {prioNote(m)}{gapBadges(m)}
        {cardFooter(m)}
      </div>
    );
  };

  const selCls = "h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const craftFiltered = craftPool.filter((c) => `${c.code ?? ""} ${c.name}`.toLowerCase().includes(craftSearch.trim().toLowerCase()));

  // ตัวเสนอสูตร (เปิดจากป้าย "ไม่มีสูตร") — ใช้ร่วมทั้งหน้าเลือกงานและหน้าตะกร้า
  const bomReqModal = bomReqFor?.product_sku ? (
    <BomChangeRequestEditor open onClose={() => setBomReqFor(null)}
      productSku={bomReqFor.product_sku} productName={bomReqFor.product_name} moNo={bomReqFor.mo_no}
      onSent={() => { setBomReqFor(null); void onReload(); }} />
  ) : null;

  // ป๊อปจัดกลุ่ม/ย้ายกลุ่ม — ใช้ร่วมทั้งหน้าเลือกงานและหน้าตะกร้า
  const groupModal = groupOpen ? (
    <AssignToGroupModal moNos={cartItems.map((m) => m.mo_no)}
      onClose={() => setGroupOpen(false)}
      onDone={() => { setGroupOpen(false); void onReload(); }} />
  ) : null;

  // ป๊อปยืนยันจ่ายงาน — ใช้ร่วมทั้งหน้าเลือกงานและหน้าตะกร้า
  const confirmModal = (
        <ERPModal open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} size="xl" title="ยืนยันจ่ายงาน"
          footer={<>
            <button onClick={() => setConfirmOpen(false)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
            <button onClick={() => void doDispatch()} disabled={saving || anyOver || totalWO === 0 || missingRate}
              title={missingRate ? "ต้องใส่ค่าแรง/ชิ้น ทุกใบก่อนจ่าย" : ""}
              className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังจ่าย…" : `ยืนยันจ่าย (${totalWO} ใบจ่ายงาน)`}</button>
          </>}>
          <div className="space-y-2">
            <div className="text-sm text-slate-600">
              จ่ายเข้า <b>{selDept?.name}</b>
              {cols.length > 0 && cols[0].id !== "__dept__"
                ? <> · ช่าง {cols.map((c) => c.name).join(", ")}</>
                : <> · ทั้งแผนก (ไม่ระบุช่าง)</>}
              {due && <> · กำหนดเสร็จ {due}</>}
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-slate-50">สินค้า</th>
                    {cols.map((c) => <th key={c.id} className="px-2 py-1.5 font-medium text-center whitespace-nowrap">{c.id === "__dept__" ? "จำนวน" : c.name}</th>)}
                    <th className="px-2 py-1.5 font-medium text-center">รวม</th>
                    <th className="px-2 py-1.5 font-medium text-center whitespace-nowrap">ค่าแรง/ชิ้น *</th>
                    <th className="px-2 py-1.5 font-medium text-center whitespace-nowrap">ตัด/เตรียมครบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {confirmItems.map((m) => {
                    const sum = itemSum(m.id);
                    const over = sum > m.remaining + 0.0001;
                    return (
                      <tr key={m.id}>
                        <td className="px-2 py-1.5 sticky left-0 bg-white">
                          <div className="text-xs font-semibold text-slate-800 truncate max-w-[160px]">{m.product_sku}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{m.mo_no} · เหลือ {fmt(m.remaining)}</div>
                        </td>
                        {cols.map((c) => (
                          <td key={c.id} className="px-1 py-1 text-center">
                            <input type="number" min={0} step="any" value={splits[m.id]?.[c.id] ?? 0}
                              onChange={(e) => setSplits((s) => ({ ...s, [m.id]: { ...s[m.id], [c.id]: Math.max(0, Number(e.target.value) || 0) } }))}
                              className="w-16 h-8 px-1.5 text-xs text-right border border-slate-200 rounded" />
                          </td>
                        ))}
                        <td className={`px-2 py-1.5 text-center tabular-nums font-semibold ${over ? "text-rose-600" : "text-slate-700"}`}>{fmt(sum)}</td>
                        <td className="px-1 py-1 text-center">
                          <input type="number" min={0} step="any" value={rates[m.id] ?? 0}
                            onChange={(e) => setRates((s) => ({ ...s, [m.id]: Math.max(0, Number(e.target.value) || 0) }))}
                            className={`w-16 h-8 px-1.5 text-xs text-right border rounded ${sum > 0 && !((rates[m.id] ?? 0) > 0) ? "border-rose-400 bg-rose-50" : "border-slate-200"}`} />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {m.ready
                            ? <span className="text-[10px] text-emerald-600">พร้อมแล้ว</span>
                            : <input type="checkbox" checked={!!markReady[m.id]} onChange={(e) => setMarkReady((s) => ({ ...s, [m.id]: e.target.checked }))} className="w-4 h-4 accent-emerald-600" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {anyOver && <p className="text-[11px] text-rose-600">⚠️ มีบางรายการจำนวนรวมเกิน “คงเหลือ” — แก้จำนวนก่อนจ่าย</p>}
            {missingRate && <p className="text-[11px] text-rose-600">⚠️ ต้องใส่ <b>ค่าแรง/ชิ้น</b> ทุกใบที่จ่าย (ห้ามเป็น 0)</p>}
            <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer w-fit">
              <input type="checkbox" checked={saveBom} onChange={(e) => setSaveBom(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              💾 บันทึกค่าแรงที่กรอกกลับเข้า BOM (ราคากลาง/ชิ้น) — ครั้งหน้าจะเติมให้อัตโนมัติ
            </label>
            <p className="text-[11px] text-slate-400">
              แต่ละช่องคือจำนวนที่ช่างคนนั้นได้ (แบ่งเท่ากันให้ก่อน แก้เองได้) · ช่องเป็น 0 = ไม่จ่ายให้คนนั้น ·
              ค่าแรงเติมราคากลางจาก BOM ให้ก่อน (แก้ได้) · ติ๊ก “ตัด/เตรียมครบ” = ทำเครื่องหมายทั้งใบตอนจ่าย
            </p>
          </div>
        </ERPModal>
  );

  // ฟอร์มจ่ายงาน (โต๊ะ/ช่าง/กำหนดเสร็จ/ปุ่มจ่าย) — ใช้ในหน้าตะกร้า
  const dispatchForm = (
    <div className="space-y-2.5">
      <label className="block">
        <span className="text-xs text-slate-500">โต๊ะ/แผนกที่จ่าย *</span>
        <select value={dept} onChange={(e) => changeDept(e.target.value)} className={`${selCls} w-full mt-0.5`}>
          <option value="">— เลือกโต๊ะ —</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>

      <div>
        <span className="text-xs text-slate-500">ช่าง (เลือกได้หลายคน = แบ่งงานให้{isHire ? " · งานเหมาต้องเลือก" : " · ว่าง = ทั้งแผนก"})</span>
        {selectedCrafts.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {selectedCrafts.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-indigo-50 text-indigo-700 rounded-full">
                {c.name}<button onClick={() => toggleCraft(c.id)} className="text-indigo-400 hover:text-rose-500">✕</button>
              </span>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setCraftListOpen((o) => !o)} className="mt-1 w-full h-9 text-sm text-left px-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600">
          ＋ เลือกช่าง {craftIds.length > 0 ? `(${craftIds.length})` : ""} <span className="float-right text-[9px] text-slate-400">▾</span>
        </button>
        {craftListOpen && (
          <div className="mt-1 border border-slate-200 rounded-lg bg-white">
            <input value={craftSearch} onChange={(e) => setCraftSearch(e.target.value)} placeholder="ค้นหาช่าง…" className="w-full h-8 px-2 text-sm border-b border-slate-100 focus:outline-none" />
            <div className="max-h-52 overflow-y-auto p-1">
              {craftFiltered.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={craftIds.includes(c.id)} onChange={() => toggleCraft(c.id)} className="w-4 h-4 accent-indigo-600" />
                  <span className="truncate">{c.code ? <code className="text-[10px] text-slate-400">[{c.code}] </code> : null}{c.name}</span>
                </label>
              ))}
              {craftFiltered.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-slate-300">ไม่พบช่าง</div>}
            </div>
          </div>
        )}
      </div>

      <label className="block">
        <span className="text-xs text-slate-500">กำหนดเสร็จ (ทั้งตะกร้า — ว่าง = ใช้ของแต่ละใบ)</span>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${selCls} w-full mt-0.5`} />
      </label>
      {isHire && craftIds.length === 0 && <p className="text-[11px] text-rose-500">งานเหมา — ต้องเลือกช่างอย่างน้อย 1 คนก่อนจ่าย</p>}
      <button onClick={openConfirm} disabled={cartItems.length === 0 || !selDept || (isHire && craftIds.length === 0)}
        title={isHire && craftIds.length === 0 ? "งานเหมา ต้องเลือกช่างก่อน" : ""}
        className="w-full h-12 text-base font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
        {craftIds.length > 1 ? `แบ่งงานให้ช่าง ${craftIds.length} คน (${cartItems.length} ใบ)` : `จ่ายงาน (${cartItems.length} ใบ)`}
      </button>
      <p className="text-[11px] text-slate-400">กดแล้วมีป๊อปให้ยืนยัน — ตรวจจำนวนต่อช่าง + เลือกงานที่จะ “ตัด/เตรียมครบ” ได้</p>
    </div>
  );

  // ───────── หน้าตะกร้า (เต็มจอ) — เปิดจากปุ่ม 🛒 · กลับได้ทุกเมื่อ ของในตะกร้าไม่หาย ─────────
  if (cartOpen && canDispatch) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setCartOpen(false)} className="h-10 px-4 text-sm border border-slate-200 bg-white rounded-lg text-slate-600 hover:bg-slate-50">← เลือกงานต่อ</button>
          <h2 className="text-lg font-bold text-slate-800">🛒 ตะกร้าจ่ายงาน ({cartItems.length} ใบ)</h2>
          <div className="flex-1" />
          {cartItems.length > 0 && <button onClick={() => setCart({})} className="h-9 px-3 text-sm text-slate-400 hover:text-rose-500">ล้างตะกร้า</button>}
        </div>

        {cartItems.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl py-20 text-center text-slate-400">
            ตะกร้าว่าง — กด “← เลือกงานต่อ” แล้วติ๊กการ์ดที่จะจ่าย
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-3 items-start">
            {/* รายการในตะกร้า — แถวใหญ่ อ่านง่าย */}
            <div className="flex-1 min-w-0 w-full border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
              {cartItems.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3">
                  <HoverImage url={m.image_url} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-800 truncate">{m.product_sku}</span>
                      {readyBadge(m)}
                      {prioBadge(m)}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{m.product_name}{m.color ? <span className="text-slate-400"> · {m.color}</span> : null}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{m.mo_no} · เหลือ {fmt(m.remaining)} · <span className={dueClass(m.due_date)}>📅 {dueText(m.due_date)}</span></div>
                    {prioNote(m)}{gapBadges(m)}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] text-slate-500 mb-0.5">จำนวนที่จ่าย</div>
                    <input type="number" min={0} max={m.remaining} step="any" value={cart[m.id]}
                      onChange={(e) => setQty(m.id, Number(e.target.value), m.remaining)}
                      className="w-24 h-10 px-2 text-base text-right border border-slate-200 rounded-lg" />
                  </div>
                  <button onClick={() => removeCart(m.id)} title="เอาออกจากตะกร้า" className="shrink-0 text-slate-300 hover:text-rose-500 text-lg">✕</button>
                </div>
              ))}
            </div>

            {/* ฟอร์มจ่ายงาน */}
            <div className="w-full lg:w-96 shrink-0 border border-slate-200 rounded-xl bg-white p-3 lg:sticky lg:top-2">
              <div className="text-sm font-bold text-slate-700 mb-2">จ่ายให้ใคร</div>
              {dispatchForm}
            </div>
          </div>
        )}

        {/* ป๊อปยืนยันจ่ายงาน (ตัวเดียวกับหน้าเลือกงาน) */}
        {confirmModal}
        {bomReqModal}
        {groupModal}
      </div>
    );
  }

  return (
    <div>
      {/* ตัวกรอง + การ์ด */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา สินค้า / เลขใบสั่งผลิต"
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[200px] flex-1" />
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} title="เรียงลำดับ" className={selCls}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>↕ {s.label}</option>)}
          </select>
          <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as "none" | "group" | "brand")} title="จัดกลุ่ม" className={selCls}>
            <option value="none">จัดกลุ่ม: ไม่จัด</option>
            <option value="group">จัดกลุ่ม: กลุ่มใบสั่งผลิต</option>
            <option value="brand">จัดกลุ่ม: แบรนด์</option>
          </select>
          <select value={readyFilter} onChange={(e) => setReadyFilter(e.target.value as "all" | "ready" | "not" | "gap" | "urgent")} title="กรองความพร้อม" className={selCls}>
            <option value="all">ทั้งหมด</option>
            <option value="ready">พร้อมจ่าย</option>
            <option value="not">ยังไม่พร้อม</option>
            <option value="gap">⚠ ขาดสูตร/ค่าแรง</option>
            <option value="urgent">🔥 งานเร่ง (ผู้บริหารสั่ง)</option>
          </select>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} title="กรองตามกลุ่ม" className={selCls}>
            <option value="__all__">🗂 ทุกกลุ่ม</option>
            {moGroups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
            <option value="__none__">— ยังไม่จับกลุ่ม —</option>
          </select>
          {/* หน้าตาการ์ด: รูปใหญ่ / แบบรายการ — เลือกแล้วจำเป็นค่าเริ่มต้นของฉัน */}
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden shrink-0" title="หน้าตาการ์ด (จำค่าที่เลือกไว้ให้)">
            {([{ k: "big" as CardMode, label: "🖼 รูปใหญ่" }, { k: "compact" as CardMode, label: "▤ แบบรายการ" }]).map((o, i) => (
              <button key={o.k} onClick={() => { setCardMode(o.k); void saveCardMode(o.k); }}
                className={`h-9 px-2.5 text-sm whitespace-nowrap ${i > 0 ? "border-l border-slate-200" : ""} ${cardMode === o.k ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{o.label}</button>
            ))}
          </div>
          {/* จำนวนการ์ดต่อแถว — เลือกแล้วจำเป็นค่าเริ่มต้นของฉัน */}
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden shrink-0" title="จำนวนการ์ดต่อแถว (จอกว้าง)">
            {CARD_COLS.map((c, i) => (
              <button key={c} onClick={() => { setCardCols(c); void saveCardCols(c); }}
                className={`h-9 w-8 text-sm ${i > 0 ? "border-l border-slate-200" : ""} ${cardCols === c ? "bg-slate-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>{c}</button>
            ))}
          </div>
          {canDispatch && filtered.length > 0 && (
            <button onClick={addAllShown} className="h-9 px-3 text-sm border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 whitespace-nowrap">＋ ใส่ตะกร้าทั้งหมดที่เห็น ({filtered.length})</button>
          )}
          {/* จัดกลุ่ม/ย้ายกลุ่มใบที่ติ๊กไว้ — ใช้ป๊อปของกลางตัวเดียวกับหน้าตาราง/ใบสั่งผลิต */}
          {canDispatch && cartItems.length > 0 && (
            <button onClick={() => setGroupOpen(true)} title="จัดกลุ่ม / ย้ายกลุ่มใบที่ติ๊กไว้"
              className="h-9 px-3 text-sm font-medium border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 whitespace-nowrap ml-auto">
              🗂 จัดกลุ่ม ({cartItems.length})
            </button>
          )}
          {/* ไปหน้าตะกร้า (เต็มจอ) — แทนแผงข้างเดิม */}
          {canDispatch && (
            <button onClick={() => setCartOpen(true)} disabled={cartItems.length === 0}
              className={`h-9 px-4 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap ${cartItems.length > 0 ? "" : "ml-auto"}`}>
              🛒 ตะกร้า ({cartItems.length}) →
            </button>
          )}
        </div>

        <div className="max-h-[calc(100vh-230px)] overflow-y-auto pr-1 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-300 text-sm">{pending.length === 0 ? "ไม่มีงานรอจ่าย 🎉" : "ไม่พบรายการที่ตรงกับตัวกรอง"}</div>
          ) : groupMode === "none" ? (
            <div className={gridCols} style={gridStyle}>{filtered.map(renderCard)}</div>
          ) : (
            buckets.map((b) => (
              <div key={b.name}>
                <div className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 mb-2">
                  {groupMode === "brand" ? "🏷 " : "🗂 "}{b.name} <span className="text-slate-400 font-normal">({b.items.length})</span>
                </div>
                <div className={gridCols} style={gridStyle}>{b.items.map(renderCard)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ปุ่มตะกร้าลอย — ติดมุมขวาล่าง เลื่อนดูการ์ดลงไปไกลแค่ไหนก็ยังกดจ่ายงานได้ */}
      {canDispatch && cartItems.length > 0 && (
        <button onClick={() => setCartOpen(true)} title="ไปหน้าตะกร้าเพื่อจ่ายงาน"
          className="fixed bottom-5 right-5 z-30 h-14 pl-4 pr-5 flex items-center gap-2 rounded-full bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition">
          <span className="text-2xl leading-none">🛒</span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm">ตะกร้า {cartItems.length} ใบ</span>
            <span className="text-[10px] font-normal text-indigo-100">รวม {fmt(cartTotalQty)} ชิ้น · กดเพื่อจ่ายงาน</span>
          </span>
        </button>
      )}

      {confirmModal}
      {bomReqModal}
      {groupModal}
    </div>
  );
}
