"use client";

// ============================================================
// ปฏิทินจัดซื้อ — 2 โหมด: 📦 ของเข้า (expected_date) · 💰 จ่ายเงิน (payment_due_date)
// ใช้ ScheduleBoard (ของกลาง): ลากการ์ดไปวางบนวัน = ตั้งวัน · ปุ่ม "ติดตาม" (งานเร่ง) เน้นแดง
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { ScheduleBoard, type SchedFilter } from "@/components/schedule-board";
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

const baht = (n: number) => "฿" + Math.round(n || 0).toLocaleString("th-TH");
const qtyFmt = (n: number) => Number(n || 0).toLocaleString("th-TH");
// วันที่แบบไทยสั้น เช่น "25 ก.ค. 69"
const thDate = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

export default function PurchasingCalendarPage() {
  const [mode, setMode] = useState<"in" | "pay">("in");
  const [items, setItems] = useState<PoCalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PoCalItem | null>(null);   // PO ที่กดดูรายละเอียด (popup)
  const [termDraft, setTermDraft] = useState<string | null>(null); // เครดิตที่กำลังตั้งใน popup
  const [leadDraft, setLeadDraft] = useState<string | null>(null); // ระยะเวลาส่งของที่กำลังตั้งใน popup
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; currency: string }[]>([]);   // ทะเบียนร้าน (ไว้ผูกใบที่ยังไม่มีร้าน)
  const [newPartnerFor, setNewPartnerFor] = useState<PoCalItem | null>(null);   // เปิด drawer เพิ่มร้านใหม่จากใบนี้
  // เปิด record อื่นจาก popup (ใบสั่งผลิต MO / สินค้า SKU) ด้วย drawer กลาง
  const [openRecord, setOpenRecord] = useState<{ moduleKey: string; apiPath: string; id: string; title: string; icon: string } | null>(null);
  const [savingTerm, setSavingTerm] = useState(false);
  const toast = useToast();

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
  const setDate = async (it: PoCalItem, date: string | null) => {
    const prev = it.date;
    setItems((is) => is.map((x) => (x.id === it.id ? { ...x, date } : x)));
    try {
      const r = await apiFetch("/api/purchasing/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, [dateField]: date }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
    } catch { setItems((is) => is.map((x) => (x.id === it.id ? { ...x, date: prev } : x))); }
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

  // ใส่ราคาสินค้าในใบ → อัปเดตบรรทัด + ยอดรวมใบ + บันทึกเข้าตารางราคาหลายร้านกลาง (supplier_items)
  const savePrice = async (lineId: string, price: number) => {
    const r = await apiFetch("/api/purchasing/po-line-price", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: lineId, price }),
    });
    const j = await r.json(); if (j.error) throw new Error(j.error);
    toast.success(j.saved_to_price_list ? "บันทึกราคาแล้ว + เก็บเข้าตารางราคาของร้านนี้ด้วย" : "บันทึกราคาแล้ว");
    load();
  };

  const filters = useMemo<SchedFilter[]>(() => {
    const s = [...new Set(items.map((i) => i.seller_name).filter(Boolean) as string[])].sort();
    return [{ value: "all", label: "ทุกร้าน" }, ...s.map((x) => ({ value: x, label: x }))];
  }, [items]);

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">📅 ปฏิทินจัดซื้อ</h1>
            <p className="text-sm text-slate-500 mt-1">ลากใบสั่งซื้อไปวางบนวัน = ตั้งวัน · กด ⚑ = ติดตาม (งานเร่ง)</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setMode("in")} className={`text-sm px-3 py-1.5 rounded-md font-medium ${mode === "in" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>📦 ของเข้า</button>
              <button onClick={() => setMode("pay")} className={`text-sm px-3 py-1.5 rounded-md font-medium ${mode === "pay" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>💰 จ่ายเงิน</button>
            </div>
            <button onClick={load} disabled={loading} className="h-9 px-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm">🔄</button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-5xl mx-auto w-full">
        <ScheduleBoard<PoCalItem>
          items={items}
          getDate={(i) => i.date}
          onSchedule={setDate}
          filters={filters}
          getFilter={(i) => i.seller_name ?? undefined}
          getSearchText={(i) => `${i.po_no} ${i.seller_name ?? ""}`}
          backlogTitle={mode === "pay" ? "ยังไม่ลงวันจ่าย" : "ยังไม่ลงวันเข้า"}
          hint={mode === "pay" ? "🔄 วันจ่ายมาจากเครดิตร้านอัตโนมัติ (ตั้งเครดิตที่ /master/partners) · ลากไปวางวัน = ตั้งเอง (ทับอัตโนมัติ) · กด ⚑ = ติดตาม" : "ลากไปวางบนวัน = ตั้งวันคาดว่าของจะเข้า · กด ⚑ = ติดตาม"}
          dayFooter={(its) => {
            const total = its.reduce((a, x) => a + x.amount_thb, 0);
            const hasF = its.some((x) => x.follow_up);
            return <div className={`text-[9px] px-1 tabular-nums ${hasF ? "text-rose-600 font-semibold" : "text-slate-400"}`}>รวม {baht(total)}</div>;
          }}
          renderChip={(i) => (
            <div title={`${i.po_no} · ${i.seller_name ?? ""}${i.auto ? " · วันจ่ายอัตโนมัติ (เครดิตร้าน)" : ""}`}
              className={`text-[9px] leading-tight rounded px-1 py-0.5 flex items-center gap-1 ${i.follow_up ? "bg-rose-50 text-rose-700 font-bold" : "bg-slate-100 text-slate-600"} ${i.auto ? "border border-dashed border-indigo-300" : ""}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i.follow_up ? "bg-rose-500" : i.auto ? "bg-indigo-400" : "bg-slate-400"}`} />
              <span className="truncate flex-1">{i.po_no}</span>
              <span className="shrink-0 tabular-nums">{baht(i.amount_thb)}</span>
            </div>
          )}
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
              {/* ป้ายวันจ่ายอัตโนมัติ (จากเครดิตร้าน) — ยังลากตั้งวันเองทับได้ */}
              {i.auto && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5"
                  title="วันจ่ายคำนวณจากเครดิตของร้าน · ลากไปวางวันอื่นเพื่อตั้งเอง">🔄 วันจ่ายอัตโนมัติ</div>
              )}
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
                {detail.auto && <span className="text-indigo-600"> · วันจ่ายคำนวณอัตโนมัติ</span>}</div>
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

      {/* เพิ่มร้านใหม่จากใบสั่งซื้อ — drawer ของกลาง (ฟอร์มร้านเต็ม: เครดิต/ระยะเวลาส่ง/ที่อยู่ ฯลฯ)
          ตั้งชื่อร้านให้ตรงกับชื่อบนใบไว้ก่อน → บันทึกแล้วใบนี้จับคู่ร้านได้ทันที */}
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

      {/* เปิดดู/แก้ไข record อื่นจาก popup — ใบสั่งผลิต (MO) หรือ สินค้า (SKU) ด้วย drawer กลางตัวเดียวกับหน้า master */}
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
    </PlaygroundShell>
  );
}
