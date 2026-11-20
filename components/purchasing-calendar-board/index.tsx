"use client";

// ============================================================
// PurchasingCalendarBoard — ของกลาง: ปฏิทินจัดซื้อ (ใช้ซ้ำได้ทุกหน้า)
//   2 โหมด: 📦 ของเข้า (expected_date) · 💰 จ่ายเงิน (payment_due_date)
//   ลากใบไปวางบนวัน = ตั้งวัน · วันที่ว่างจะคิดให้เองจาก "เครดิตร้าน / ระยะเวลาส่งของ"
//   กดหัวการ์ด = popup รายละเอียด (สินค้า/ที่มาใบขอซื้อ/MO · ใส่ราคา · ตั้งเครดิต-lead time · ผูกร้าน)
//
// ใช้ที่: /purchasing/calendar (หน้าเต็ม) · แดชบอร์ดจัดซื้อ (มุมมองปฏิทินในแผงเจาะรายการ)
// 2026-11-20 (เจ้าของเลือก): รายชื่อร้านด้านซ้ายพับได้ (แทนชิปร้านหลายแถว) · ⚙ ตั้งวันส่งของต่อร้านในหน้านี้ (ลงทะเบียนร้านช่องเดิม)
//   วันกะ (auto) = เส้นประ ไม่เขียนลงใบจนกว่าจะลากวาง/กด "ยืนยันเป็นวันจริง" (ทีละใบ/ทั้งวัน · ย้อนกลับได้) · เลยวันแล้วยังไม่เข้า = แดง
//   fullscreen = เต็มจอ (ของกลาง FullscreenStage · แถบเครื่องมือซ่อนขอบบน วางเมาส์ค่อยโชว์)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ScheduleBoard } from "@/components/schedule-board";
import { FullscreenStage, FullscreenBar, FullscreenToggle, useFullscreenStage } from "@/components/fullscreen-stage";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { ERPModal } from "@/components/modal";
import { PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { PurchaseLeadTimeInput } from "@/components/purchase-lead-time-input";
import { PriceFillInput } from "@/components/price-fill-input";
import { SupplierPicker } from "@/components/supplier-picker";
import { MasterRecordDrawer } from "@/components/master-crud";
import { formatCreditTerm, formatLeadTime } from "@/lib/credit-term";
import { useToast } from "@/components/toast";
import type { PoCalItem } from "@/app/api/purchasing/calendar/route";

export type PurchasingCalendarMode = "in" | "pay";

const SHOP_LIST_KEY = "erp_pocal_shoplist_open";
const NO_SHOP = "(ไม่ระบุร้าน)";
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const baht = (n: number) => "฿" + Math.round(n || 0).toLocaleString("th-TH");
const qtyFmt = (n: number) => Number(n || 0).toLocaleString("th-TH");
// วันที่แบบไทยสั้น เช่น "25 ก.ค. 69"
export const thDate = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

export function PurchasingCalendarBoard({
  mode: modeProp = "in", showModeSwitch = true, onModeChange, fullscreen = false,
}: {
  mode?: PurchasingCalendarMode;
  fullscreen?: boolean;                           // หน้าเต็ม: เปิดโหมดเต็มจอได้ (จำต่อคน)
  showModeSwitch?: boolean;                       // false = ล็อกโหมด (เช่นในแดชบอร์ด)
  onModeChange?: (m: PurchasingCalendarMode) => void;
}) {
  const [mode, setMode] = useState<PurchasingCalendarMode>(modeProp);
  useEffect(() => { setMode(modeProp); }, [modeProp]);
  const changeMode = (m: PurchasingCalendarMode) => { setMode(m); onModeChange?.(m); };

  const [items, setItems] = useState<PoCalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PoCalItem | null>(null);   // PO ที่กดดูรายละเอียด (popup)
  const [termDraft, setTermDraft] = useState<string | null>(null); // เครดิตที่กำลังตั้งใน popup
  const [leadDraft, setLeadDraft] = useState<string | null>(null); // ระยะเวลาส่งของที่กำลังตั้งใน popup
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; currency: string }[]>([]);   // ทะเบียนร้าน
  const [newPartnerFor, setNewPartnerFor] = useState<PoCalItem | null>(null);   // drawer เพิ่มร้านใหม่จากใบนี้
  // เปิด record อื่นจาก popup (ใบสั่งผลิต MO / สินค้า SKU) ด้วย drawer กลาง
  const [openRecord, setOpenRecord] = useState<{ moduleKey: string; apiPath: string; id: string; title: string; icon: string } | null>(null);
  const [savingTerm, setSavingTerm] = useState(false);
  const toast = useToast();
  const fs = useFullscreenStage("purchasing_cal_fullscreen", { active: fullscreen, defaultOn: true, autoHide: true });
  const fsOn = fullscreen && fs.on;
  const [shopSel, setShopSel] = useState<Set<string>>(() => new Set());     // ร้านที่ติ๊กกรอง (ว่าง = ทุกร้าน)
  const [shopListOpen, setShopListOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(SHOP_LIST_KEY) === "0") setShopListOpen(false); } catch { /* ไม่มีที่เก็บ */ } }, []);
  const toggleShopList = () => setShopListOpen((v) => { try { localStorage.setItem(SHOP_LIST_KEY, v ? "0" : "1"); } catch { /* ไม่มีที่เก็บ */ } return !v; });
  const [leadOpen, setLeadOpen] = useState(false);                          // ป๊อปตั้งวันส่งของต่อร้าน
  const [leadDrafts, setLeadDrafts] = useState<Record<string, string | null>>({});

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/purchasing/calendar?mode=${mode}`).then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? []) as PoCalItem[];
        setItems(list);
        setDetail((d) => (d ? list.find((x) => x.id === d.id) ?? d : d));   // popup ที่เปิดอยู่ = ข้อมูลสด
      })
      .catch(() => setItems([])).finally(() => setLoading(false));
  }, [mode]);
  useEffect(() => { load(); }, [load]);

  // ทะเบียนร้าน (ผู้จำหน่าย) — ใช้ใน popup ตอนใบยังไม่ผูกร้าน
  const loadSuppliers = useCallback(() => {
    const f = encodeURIComponent(JSON.stringify({ is_supplier: { type: "boolean", value: "true" } }));
    apiFetch(`/api/master-v2/partners?limit=1000&filters=${f}`).then((r) => r.json())
      .then((j) => setSuppliers(((j.data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: String(p.id), name: String(p.display_name || p.name_th || p.id), currency: String(p.default_currency || "THB"),
      })))).catch(() => {});
  }, []);
  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  // ผูกใบนี้กับร้านในทะเบียน (ชื่อบนใบไม่ตรงกับทะเบียน → เลือกร้านเอง)
  const linkPartner = async (poId: string, partnerId: string, partnerName: string) => {
    try {
      const r = await apiFetch("/api/purchasing/calendar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: poId, seller_partner_id: partnerId }),
      });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`ผูกใบนี้กับร้าน "${partnerName}" แล้ว`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ผูกร้านไม่สำเร็จ"); }
  };

  const dateField = mode === "pay" ? "payment_due_date" : "expected_date";

  // ลากตั้งวัน (optimistic + เซฟจริง)
  const saveDate = async (id: string, date: string | null) => {
    const r = await apiFetch("/api/purchasing/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, [dateField]: date }) });
    const j = await r.json(); if (j.error) throw new Error(j.error);
  };
  // ย้อนกลับ: ใบที่เดิมเป็นวันกะ (auto) → ล้างวันที่ตั้ง (ระบบกะให้ใหม่เอง) · ใบที่มีวันจริง → กลับไปวันเดิม
  const setDate = async (it: PoCalItem, date: string | null) => {
    const prev = it.date, prevAuto = it.auto;
    if (prev === date && !prevAuto) return;
    setItems((is) => is.map((x) => (x.id === it.id ? { ...x, date, auto: false } : x)));
    try {
      await saveDate(it.id, date);
      toast.undo(date ? `ตั้งวัน ${it.po_no} เป็น ${thDate(date)} แล้ว` : `เอาวัน ${it.po_no} ออกแล้ว`, async () => {
        try { await saveDate(it.id, prevAuto ? null : prev); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
        load();
      });
      if (!date) load();   // เอาวันออก → ระบบอาจกะวันให้ใหม่จากวันส่งของร้าน
    } catch (e) {
      setItems((is) => is.map((x) => (x.id === it.id ? { ...x, date: prev, auto: prevAuto } : x)));
      toast.error(`ตั้งวันไม่สำเร็จ${e instanceof Error && e.message ? " — " + e.message : ""}`);
    }
  };
  // ยืนยันวันกะเป็นวันจริง (ทีละใบ / ทั้งวัน) — เขียนลงใบสั่งซื้อ · ย้อนกลับ = ล้างกลับเป็นวันกะ
  const confirmEstimates = async (list: PoCalItem[]) => {
    const todo = list.filter((x) => x.auto && x.date);
    if (!todo.length) return;
    const ok = await Promise.all(todo.map((x) => saveDate(x.id, x.date).then(() => true, () => false)));
    const done = todo.filter((_, k) => ok[k]);
    if (done.length < todo.length) toast.error(`ยืนยันไม่สำเร็จ ${todo.length - done.length} ใบ`);
    if (done.length) toast.undo(`ยืนยันวันจริงแล้ว ${done.length} ใบ`, async () => {
      await Promise.all(done.map((x) => saveDate(x.id, null).catch(() => undefined)));
      load();
    });
    load();
  };
  // ติดตาม (งานเร่ง)
  const toggleFollow = async (it: PoCalItem) => {
    const next = !it.follow_up;
    setItems((is) => is.map((x) => (x.id === it.id ? { ...x, follow_up: next } : x)));
    try {
      const r = await apiFetch("/api/purchasing/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, follow_up: next }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
    } catch { setItems((is) => is.map((x) => (x.id === it.id ? { ...x, follow_up: !next } : x))); }
  };

  // ตั้งค่าร้านจาก popup (เครดิตการจ่าย / ระยะเวลาส่งของ) → บันทึกกลับทะเบียนร้าน แล้วทุกใบของร้านนี้คิดวันให้เอง
  const savePartnerField = async (partnerId: string, patch: Record<string, string>, okMsg: string) => {
    setSavingTerm(true);
    try {
      const r = await apiFetch(`/api/master-v2/partners/${partnerId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(okMsg);
      setTermDraft(null); setLeadDraft(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSavingTerm(false); }
  };
  const saveTerm = (partnerId: string, term: string | null) => {
    if (!term) { toast.error("เลือกเครดิตก่อน"); return; }
    void savePartnerField(partnerId, { purchase_credit_term: term },
      `ตั้งเครดิตร้านแล้ว: ${formatCreditTerm(term)} — ใบของร้านนี้จะคิดวันจ่ายให้อัตโนมัติ`);
  };
  const saveLead = (partnerId: string, lead: string | null) => {
    if (!lead) { toast.error("ใส่จำนวนวันก่อน"); return; }
    void savePartnerField(partnerId, { purchase_lead_time: lead },
      `ตั้งระยะเวลาส่งของแล้ว: ${formatLeadTime(lead)} — ใบของร้านนี้จะคิดวันของเข้าให้อัตโนมัติ`);
  };

  // ⚙ ตั้งวันส่งของต่อร้าน — รายชื่อร้านจากใบที่ค้าง (จัดกลุ่มตามชื่อบนใบ)
  const shops = useMemo(() => {
    const m = new Map<string, { name: string; count: number; partnerId: string | null; lead: string | null }>();
    for (const i of items) {
      const name = i.seller_name || NO_SHOP;
      const cur = m.get(name) ?? { name, count: 0, partnerId: null, lead: null };
      cur.count += 1; cur.partnerId ||= i.seller_partner_id; cur.lead ||= i.seller_lead_time;
      m.set(name, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"));
  }, [items]);
  const patchLead = (partnerId: string, v: string | null) => apiFetch(`/api/master-v2/partners/${partnerId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purchase_lead_time: v ?? "" }),
  }).then((r) => r.json()).then((j) => { if (j.error) throw new Error(j.error); });
  const saveShopLead = async (partnerId: string, name: string, before: string | null) => {
    const v = leadDrafts[partnerId];
    if (v === undefined) return;
    try {
      await patchLead(partnerId, v);
      setLeadDrafts((d) => { const n = { ...d }; delete n[partnerId]; return n; });
      toast.undo(v ? `${name}: ส่งของ ${formatLeadTime(v)} — ใบของร้านนี้กะวันเข้าให้เอง` : `ล้างวันส่งของ ${name} แล้ว`, async () => {
        await patchLead(partnerId, before).catch(() => undefined);
        load();
      });
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };
  // ผูกทุกใบของชื่อร้านนี้ (ที่ยังไม่ผูก) กับร้านในทะเบียน
  const linkShop = async (name: string, partnerId: string, partnerName: string) => {
    const pos = items.filter((i) => (i.seller_name || NO_SHOP) === name && !i.seller_partner_id);
    const ok = await Promise.all(pos.map((p) => apiFetch("/api/purchasing/calendar", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, seller_partner_id: partnerId }),
    }).then((r) => r.json()).then((j) => !j.error, () => false)));
    const n = ok.filter(Boolean).length;
    if (n) toast.success(`ผูก ${n} ใบของ "${name}" กับร้าน "${partnerName}" แล้ว`);
    if (n < pos.length) toast.error(`ผูกไม่สำเร็จ ${pos.length - n} ใบ`);
    load();
  };

  // ใส่ราคาสินค้าในใบ → อัปเดตบรรทัด + ยอดรวมใบ + บันทึกเข้าตารางราคาหลายร้านกลาง (supplier_items)
  const savePrice = async (lineId: string, price: number) => {
    const r = await apiFetch("/api/purchasing/po-line-price", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: lineId, price }),
    });
    const j = await r.json(); if (j.error) throw new Error(j.error);
    toast.success(j.saved_to_price_list ? "บันทึกราคาแล้ว + เก็บเข้าตารางราคาของร้านนี้ด้วย" : "บันทึกราคาแล้ว");
    load();
  };

  const shown = useMemo(() => (shopSel.size ? items.filter((i) => shopSel.has(i.seller_name || NO_SHOP)) : items), [items, shopSel]);
  const today = todayYmd();
  const isLate = (i: PoCalItem) => mode === "in" && !!i.date && i.date.slice(0, 10) < today;   // เลยวัน (กะ/จริง) แล้วยังไม่เข้า
  const leadSet = shops.filter((x) => x.lead).length;
  const toggleShop = (name: string) => setShopSel((cur) => { const n = new Set(cur); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  // รายชื่อร้านด้านซ้าย (พับเป็นแถบแคบได้ · จำในเครื่อง) — ติ๊กได้หลายร้าน · ว่าง = ทุกร้าน
  const shopList = (
    <aside className={`shrink-0 rounded-xl border border-slate-200 bg-white transition-[width] ${shopListOpen ? "w-52" : "w-10"}`}>
      <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
        {shopListOpen && <span className="flex-1 text-xs font-semibold text-slate-600">ร้าน <span className="font-normal text-slate-400">({shops.length})</span></span>}
        <button type="button" onClick={toggleShopList} title={shopListOpen ? "พับรายชื่อร้าน" : "กางรายชื่อร้าน"} className="h-6 w-6 rounded text-slate-400 hover:bg-slate-100">
          <Icon value={shopListOpen ? "i:chevron-left" : "i:chevron-right"} />
        </button>
      </div>
      {shopListOpen ? (
        <div className={`overflow-y-auto p-1 ${fsOn ? "max-h-[calc(100vh-130px)]" : "max-h-[70vh]"}`}>
          <button type="button" onClick={() => setShopSel(new Set())}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${shopSel.size === 0 ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <span className="flex-1">ทุกร้าน</span><span className="tabular-nums text-slate-400">{items.length}</span>
          </button>
          {shops.map((x) => (
            <label key={x.name} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${shopSel.has(x.name) ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}>
              <input type="checkbox" checked={shopSel.has(x.name)} onChange={() => toggleShop(x.name)} className="h-3.5 w-3.5 accent-blue-600" />
              <span className="min-w-0 flex-1 truncate" title={x.name}>{x.name}</span>
              {!x.lead && mode === "in" && <span title="ยังไม่ตั้งวันส่งของ" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
              <span className="tabular-nums text-slate-400">{x.count}</span>
            </label>
          ))}
        </div>
      ) : shopSel.size > 0 && (
        <div className="py-2 text-center text-[10px] font-medium text-blue-700" title={[...shopSel].join(", ")}>{shopSel.size}</div>
      )}
    </aside>
  );

  const board = (
    <div className={fsOn ? "flex min-h-0 flex-1 flex-col" : ""}>
      {/* แถบเครื่องมือ: สลับโหมด + ตั้งวันส่งของ + รีโหลด (เต็มจอ = ซ่อนขอบบน วางเมาส์ค่อยโชว์) */}
      <FullscreenBar order={0}>
      <div className="flex flex-wrap items-center justify-end gap-2 mb-2">
        {fullscreen && fsOn && <span className="mr-auto text-sm font-bold text-slate-800">ปฏิทินจัดซื้อ</span>}
        {mode === "in" && (
          <button type="button" onClick={() => setLeadOpen(true)} title="ตั้งว่าแต่ละร้านส่งของกี่วันหลังสั่ง — ระบบกะวันของเข้าให้เอง"
            className="h-9 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-600 hover:bg-slate-50">
            <Icon name="settings" /> ตั้งวันส่งของต่อร้าน <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${leadSet < shops.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{leadSet}/{shops.length}</span>
          </button>
        )}
        {showModeSwitch && (
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => changeMode("in")} className={`text-sm px-3 py-1.5 rounded-md font-medium ${mode === "in" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>📦 ของเข้า</button>
            <button onClick={() => changeMode("pay")} className={`text-sm px-3 py-1.5 rounded-md font-medium ${mode === "pay" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>💰 จ่ายเงิน</button>
          </div>
        )}
        <button onClick={load} disabled={loading} title="โหลดใหม่" className="h-9 px-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm"><Icon name="refresh" /></button>
        {fullscreen && <FullscreenToggle fs={fs} />}
      </div>
      </FullscreenBar>

      <div className="flex min-h-0 gap-2">
      {shopList}
      <div className="min-w-0 flex-1">
      <ScheduleBoard<PoCalItem>
        items={shown}
        getDate={(i) => i.date}
        onSchedule={setDate}
        fill={fsOn}
        fillOffset={120}
        getSearchText={(i) => `${i.po_no} ${i.seller_name ?? ""} ${i.products.map((p) => p.name).join(" ")}`}
        dayActions={(its) => {
          const est = its.filter((x) => x.auto && x.date);
          return est.length > 0 && mode === "in" ? (
            <button type="button" onClick={() => void confirmEstimates(est)} title="เขียนวันกะลงใบสั่งซื้อเป็นวันจริง (ย้อนกลับได้)"
              className="mr-auto h-9 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm text-indigo-700 hover:bg-indigo-100">ยืนยันวันกะเป็นวันจริง {est.length} ใบ</button>
          ) : null;
        }}
        backlogTitle={mode === "pay" ? "ยังไม่ลงวันจ่าย" : "ยังไม่ลงวันเข้า"}
        hint={mode === "pay"
          ? "🔄 วันจ่ายมาจากเครดิตร้านอัตโนมัติ (ตั้งเครดิตที่ /master/partners) · ลากไปวางวัน = ตั้งเอง (ทับอัตโนมัติ) · กด ⚑ = ติดตาม"
          : "🔄 วันของเข้ามาจากระยะเวลาส่งของร้านอัตโนมัติ · ลากไปวางวัน = ตั้งเอง · กด ⚑ = ติดตาม"}
        dayFooter={(its) => {
          const total = its.reduce((a, x) => a + x.amount_thb, 0);
          const hasF = its.some((x) => x.follow_up);
          return <div className={`text-[9px] px-1 tabular-nums ${hasF ? "text-rose-600 font-semibold" : "text-slate-400"}`}>รวม {baht(total)}</div>;
        }}
        renderChip={(i) => {
          const late = isLate(i), img = i.products.find((p) => p.img)?.img ?? null;
          return (
            <div title={`${i.po_no} · ${i.seller_name ?? ""}${i.auto ? " · วันกะจากวันสั่ง + วันส่งของร้าน" : ""}${late ? " · เลยวันแล้วยังไม่เข้า" : ""}`}
              className={`text-[10px] leading-tight rounded px-0.5 py-0.5 flex items-center gap-1 ${late ? "bg-red-50 text-red-700 font-semibold" : i.follow_up ? "bg-rose-50 text-rose-700 font-bold" : i.auto ? "bg-white text-slate-500" : "bg-slate-100 text-slate-600"} ${i.auto ? `border border-dashed ${late ? "border-red-300" : "border-indigo-300"}` : ""}`}>
              {img
                ? <span className="shrink-0" onClick={(e) => e.stopPropagation()}><HoverImage url={img} size={18} previewSize={240} alt={i.po_no} /></span>
                : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${late ? "bg-red-500" : i.follow_up ? "bg-rose-500" : i.auto ? "bg-indigo-400" : "bg-slate-400"}`} />}
              <span className="truncate flex-1">{i.po_no}</span>
              <span className="shrink-0 tabular-nums">{baht(i.amount_thb)}</span>
            </div>
          );
        }}
        renderCard={(i) => (
          <div className={`rounded-xl border bg-white p-2.5 ${i.follow_up ? "border-rose-300" : "border-slate-200"}`}>
            {/* กดหัวการ์ด = เปิดรายละเอียด (popup) · ลากที่ว่าง = ตั้งวัน */}
            <div onClick={(e) => { e.stopPropagation(); setTermDraft(null); setLeadDraft(null); setDetail(i); }} title="ดูรายละเอียดใบสั่งซื้อ"
              className="flex items-start justify-between gap-2 cursor-pointer group">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-600">{i.po_no} <span className="text-[10px] font-normal text-slate-300 group-hover:text-blue-400">ⓘ</span></div>
                <div className="text-[11px] text-slate-400 truncate">🏪 {i.seller_name || "—"}</div>
              </div>
              <span className="text-xs font-medium text-slate-700 tabular-nums shrink-0">{baht(i.amount_thb)}</span>
            </div>
            {/* ป้ายวันอัตโนมัติ (จากเครดิต/ระยะเวลาส่ง) — ยังลากตั้งวันเองทับได้ */}
            {i.auto && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 border border-dashed border-indigo-200 rounded px-1.5 py-0.5"
                  title={mode === "pay" ? "วันจ่ายคำนวณจากเครดิตของร้าน · ลากไปวางวันอื่นเพื่อตั้งเอง" : "วันของเข้ากะจากวันสั่ง + วันส่งของร้าน · ยังไม่ได้เขียนลงใบ"}>
                  {mode === "pay" ? "วันจ่ายอัตโนมัติ" : `วันกะ ${thDate(i.date)}`}
                </span>
                {mode === "in" && i.date && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); void confirmEstimates([i]); }} title="เขียนวันนี้ลงใบสั่งซื้อเป็นวันจริง (ย้อนกลับได้)"
                    className="text-[10px] rounded border border-indigo-200 px-1.5 py-0.5 text-indigo-700 hover:bg-indigo-50">ยืนยันเป็นวันจริง</button>
                )}
              </div>
            )}
            {isLate(i) && <div className="mt-1 text-[10px] font-medium text-red-600">เลยวัน{i.auto ? "กะ" : "นัด"}แล้ว ยังไม่เข้า — ตามร้านด้วย</div>}
            {/* สินค้าในใบ — รูป + ชื่อ (3 รายการแรก · ชี้รูปดูใหญ่ · กดหัวการ์ดดูทั้งหมด) */}
            {i.products.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {i.products.slice(0, 3).map((p, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <HoverImage url={p.img} size={22} alt={p.name} fallback="📦" />
                    <span className="text-[11px] text-slate-500 truncate flex-1" title={`${p.name}${p.qty ? ` × ${qtyFmt(p.qty)}` : ""}`}>{p.name || "—"}</span>
                  </div>
                ))}
                {i.product_count > 3 && (
                  <div className="text-[10px] text-slate-400 pl-[26px]">+{i.product_count - 3} รายการ</div>
                )}
              </div>
            )}
            <button onClick={(e) => { e.stopPropagation(); toggleFollow(i); }}
              className={`mt-1.5 w-full text-xs py-1 rounded-lg border ${i.follow_up ? "bg-rose-50 border-rose-300 text-rose-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {i.follow_up ? "⚑ กำลังติดตาม (งานเร่ง)" : "⚐ กดติดตาม"}
            </button>
          </div>
        )}
      />
      </div>
      </div>

      {/* Popup รายละเอียดใบสั่งซื้อ — กดหัวการ์ดเพื่อเปิด */}
      <ERPModal open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={detail ? `📦 ใบสั่งซื้อ ${detail.po_no}` : ""}
        description={detail?.seller_name ? `🏪 ${detail.seller_name}` : undefined}>
        {detail && (
          <div className="space-y-3">
            {/* สรุปหัวใบ */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm bg-slate-50 rounded-lg px-3 py-2">
              <div><span className="text-slate-400">ยอดรวม (บาท) </span><b className="tabular-nums text-slate-800">{baht(detail.amount_thb)}</b></div>
              {detail.order_date && <div><span className="text-slate-400">วันที่สั่ง </span><b className="text-slate-700">{thDate(detail.order_date)}</b></div>}
              {detail.date && <div><span className="text-slate-400">{mode === "pay" ? "วันจ่าย " : "วันของเข้า "}</span>{thDate(detail.date)}</div>}
              <div><span className="text-slate-400">รายการ </span>{detail.product_count}</div>
              {detail.currency && !["THB", "บาท"].includes(detail.currency) && <div><span className="text-slate-400">สกุลเงิน </span>{detail.currency === "YUAN" ? "RMB" : detail.currency}</div>}
              {detail.follow_up && <div className="text-rose-600 font-medium">⚑ กำลังติดตาม (งานเร่ง)</div>}
            </div>

            {/* เครดิตการจ่ายของร้าน — ยังไม่ตั้ง = เตือน + ตั้งได้เลยตรงนี้ (บันทึกกลับทะเบียนร้าน) */}
            {detail.seller_credit_term ? (
              <div className="text-xs text-slate-500 px-1">💳 เครดิตร้าน: <b className="text-slate-700">{formatCreditTerm(detail.seller_credit_term)}</b>
                {detail.auto && mode === "pay" && <span className="text-indigo-600"> · วันจ่ายคำนวณอัตโนมัติ</span>}</div>
            ) : detail.seller_partner_id ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <div className="text-sm text-amber-800 font-medium">⚠ ร้านนี้ยังไม่ได้ตั้ง &quot;เครดิตการจ่าย&quot;</div>
                <div className="text-[11px] text-amber-700 mt-0.5 mb-2">ตั้งครั้งเดียว → ทุกใบของร้านนี้จะไปอยู่วันที่ต้องจ่ายเองอัตโนมัติ</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <PurchaseCreditTermInput value={termDraft} onChange={setTermDraft} disabled={savingTerm} />
                  <button type="button" disabled={savingTerm || !termDraft}
                    onClick={() => saveTerm(detail.seller_partner_id!, termDraft)}
                    className="h-9 px-3 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                    {savingTerm ? "กำลังบันทึก…" : "💾 บันทึกเข้าร้าน"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                <div className="text-sm text-slate-700 font-medium">⚠ ไม่พบร้าน &quot;{detail.seller_name || "—"}&quot; ในทะเบียนร้าน</div>
                <div className="text-[11px] text-slate-500 mt-0.5 mb-2">ผูกกับร้านที่มีอยู่ หรือเพิ่มร้านนี้เข้าระบบ → ถึงจะตั้งเครดิต/ระยะเวลาส่งได้</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="min-w-[220px]">
                    <SupplierPicker value="" suppliers={suppliers} placeholder="🔗 เลือกร้านที่มีอยู่…"
                      onChange={(id, name) => void linkPartner(detail.id, id, name)} />
                  </div>
                  <button type="button" onClick={() => setNewPartnerFor(detail)}
                    className="h-9 px-3 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-white">
                    ➕ เพิ่มร้านนี้เข้าระบบ
                  </button>
                </div>
              </div>
            )}

            {/* ระยะเวลาส่งของ (Lead Time) — ยังไม่ตั้ง = เตือน + ตั้งได้เลยตรงนี้ */}
            {detail.seller_lead_time ? (
              <div className="text-xs text-slate-500 px-1">🚚 ระยะเวลาส่งของ: <b className="text-slate-700">{formatLeadTime(detail.seller_lead_time)}</b></div>
            ) : detail.seller_partner_id ? (
              <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2">
                <div className="text-sm text-sky-800 font-medium">⚠ ร้านนี้ยังไม่ได้ตั้ง &quot;ระยะเวลาส่งของ&quot;</div>
                <div className="text-[11px] text-sky-700 mt-0.5 mb-2">ตั้งครั้งเดียว → ใบของร้านนี้จะไปอยู่วันที่ของน่าจะเข้าเองอัตโนมัติ</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <PurchaseLeadTimeInput value={leadDraft} onChange={setLeadDraft} disabled={savingTerm} />
                  <button type="button" disabled={savingTerm || !leadDraft}
                    onClick={() => saveLead(detail.seller_partner_id!, leadDraft)}
                    className="h-9 px-3 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50">
                    {savingTerm ? "กำลังบันทึก…" : "💾 บันทึกเข้าร้าน"}
                  </button>
                </div>
              </div>
            ) : null}

            {/* รายการสินค้า */}
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
              {detail.products.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-400">ไม่มีรายการสินค้าในใบนี้</div>
              ) : detail.products.map((p, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2">
                  <HoverImage url={p.img} size={44} previewSize={320} alt={p.name} fallback="📦" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-700 truncate">
                      {p.name || "—"}
                      {p.sku_id && (
                        <button type="button" title="เปิด/แก้ไขสินค้า (SKU)"
                          onClick={() => setOpenRecord({ moduleKey: "skus-v2", apiPath: "skus", id: p.sku_id!, title: "SKU", icon: "🏷️" })}
                          className="ml-1 text-slate-300 hover:text-blue-600 text-xs align-middle">✎</button>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      จำนวน {qtyFmt(p.qty)}{p.uom ? ` ${p.uom}` : ""}
                      {p.pr_date && <> · 📝 ขอซื้อ {thDate(p.pr_date)}{p.pr_no ? ` (${p.pr_no})` : ""}</>}
                      {p.pr_requester && <> · โดย {p.pr_requester}</>}
                    </div>
                    {/* เหตุผลที่สั่ง (จากใบขอซื้อ) */}
                    {(p.pr_note || p.pr_used_for || p.pr_mo_no) && (
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {p.pr_mo_no && (p.mo_id ? (
                          <button type="button" onClick={() => setOpenRecord({ moduleKey: "manufacturing-orders", apiPath: "manufacturing-orders", id: p.mo_id!, title: "ใบสั่งผลิต", icon: "🏭" })}
                            title="เปิดดูใบสั่งผลิต"
                            className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-medium">
                            🏭 {p.pr_mo_no}{p.mo_sku ? ` · ผลิต ${p.mo_sku}` : ""} ↗
                          </button>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">🏭 {p.pr_mo_no}</span>
                        ))}
                        {p.mo_product && <span className="text-slate-500 truncate" title={p.mo_product}>({p.mo_product})</span>}
                        {p.pr_used_for && <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100">ใช้กับ {p.pr_used_for}</span>}
                        {p.pr_note && <span className="text-slate-500 truncate" title={p.pr_note}>💬 {p.pr_note}</span>}
                      </div>
                    )}
                  </div>
                  {/* ราคา — ยังไม่มี = เตือน + ใส่ได้เลย (ของกลาง) → บันทึกเข้าใบ + ตารางราคาของร้าน */}
                  <div className="shrink-0">
                    <PriceFillInput value={p.price} qty={p.qty} currency={detail.currency}
                      onSave={(price) => savePrice(p.line_id, price)} />
                  </div>
                </div>
              ))}
              {detail.product_count > detail.products.length && (
                <div className="p-2 text-center text-xs text-slate-400">…และอีก {detail.product_count - detail.products.length} รายการ</div>
              )}
            </div>
          </div>
        )}
      </ERPModal>

      {/* เพิ่มร้านใหม่จากใบสั่งซื้อ — drawer ของกลาง (ฟอร์มร้านเต็ม) · ตั้งชื่อตรงกับใบ → จับคู่ได้ทันที */}
      {newPartnerFor && (
        <MasterRecordDrawer
          moduleKey="partners-v2"
          apiPath="partners"
          recordId={null}
          startInEdit
          title="ร้าน / ผู้จำหน่าย"
          createTitle={`เพิ่มร้าน "${newPartnerFor.seller_name || ""}"`}
          icon="🏪"
          createDefaults={{ display_name: newPartnerFor.seller_name ?? "", name_th: newPartnerFor.seller_name ?? "", is_supplier: true }}
          onChanged={() => { loadSuppliers(); load(); }}
          onClose={() => setNewPartnerFor(null)}
        />
      )}

      {/* เปิดดู/แก้ไข record อื่นจาก popup — ใบสั่งผลิต (MO) หรือ สินค้า (SKU) ด้วย drawer กลาง */}
      {openRecord && (
        <MasterRecordDrawer
          moduleKey={openRecord.moduleKey}
          apiPath={openRecord.apiPath}
          recordId={openRecord.id}
          title={openRecord.title}
          icon={openRecord.icon}
          onChanged={() => load()}
          onClose={() => setOpenRecord(null)}
        />
      )}

      {/* ⚙ ตั้งวันส่งของต่อร้าน — บันทึกลงทะเบียนร้าน (ช่องเดียวกับหน้าร้านค้า) · ทุกใบของร้านนั้นกะวันเข้าให้เอง (ไม่เขียนลงใบ) */}
      <ERPModal open={leadOpen} onClose={() => setLeadOpen(false)} size="lg" title="ตั้งวันส่งของต่อร้าน" defaultExpanded={false} storageKey="pocal-lead-settings"
        description={`ตั้งแล้ว ${leadSet} / ${shops.length} ร้าน · วันในปฏิทินเป็นวันกะ (เส้นประ) จนกว่าจะลากวางหรือกดยืนยัน`}
        hasUnsavedChanges={Object.keys(leadDrafts).length > 0}>
        <div className="divide-y divide-slate-100">
          {shops.map((x) => {
            const draft = x.partnerId ? leadDrafts[x.partnerId] : undefined;
            const dirty = draft !== undefined && (draft ?? null) !== (x.lead ?? null);
            return (
              <div key={x.name} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-[160px] flex-1">
                  <div className="truncate text-sm font-medium text-slate-700" title={x.name}>{x.name}</div>
                  <div className="text-[11px] text-slate-400">{x.count} ใบค้าง{x.lead ? ` · ตอนนี้: ${formatLeadTime(x.lead)}` : " · ยังไม่ตั้ง"}</div>
                </div>
                {x.partnerId ? (<>
                  <PurchaseLeadTimeInput value={draft !== undefined ? draft : x.lead} onChange={(v) => setLeadDrafts((d) => ({ ...d, [x.partnerId!]: v }))} />
                  <button type="button" disabled={!dirty} onClick={() => void saveShopLead(x.partnerId!, x.name, x.lead)}
                    className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">บันทึก</button>
                </>) : (
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">ยังไม่ผูกทะเบียนร้าน</span>
                    <div className="w-56"><SupplierPicker value="" suppliers={suppliers} placeholder="ผูกกับร้านที่มีอยู่…" onChange={(id, name) => void linkShop(x.name, id, name)} /></div>
                  </div>
                )}
              </div>
            );
          })}
          {shops.length === 0 && <p className="py-6 text-center text-sm text-slate-400">ไม่มีใบสั่งซื้อที่ค้างอยู่</p>}
        </div>
      </ERPModal>
    </div>
  );

  return fullscreen ? <FullscreenStage fs={fs} className="">{board}</FullscreenStage> : board;
}
