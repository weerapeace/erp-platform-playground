"use client";

/**
 * TaobaoBrowser — กล่องพัก "สินค้าจาก Taobao" (ปุ่มที่ 3 ในหน้า /master/skus แท็บ "เลือกดูตามแท็ก")
 *
 * ของที่เครื่องมือ taobao-catalog ส่งเข้ามา (ชื่อจีน/ชื่อไทย/ราคา ¥/ลิงก์/รูป/ตัวเลือก) จะพักอยู่ที่นี่
 * ยังไม่เข้า SKU จริง จนกว่าจะกดปุ่มใดปุ่มหนึ่ง:
 *   🔗 จับคู่ SKU เดิม  → บันทึกเป็น "ราคาร้านจีน" ผ่าน API เดิม /api/purchasing/sku-suppliers (supplier_items)
 *   ➕ สร้าง SKU ใหม่   → เปิด SkuWizard ของกลาง โดยเติมชื่อไทย/ราคา/ลิงก์ ให้ล่วงหน้า
 *   🚫 ตีตก            → ซ่อนออกจากรายการ (กู้คืนได้)
 *
 * ของกลางที่ใช้: SkuPicker · ParentSkuPicker(ผ่าน SkuPicker+โหมด) · SupplierPicker · ERPModal · useToast · apiFetch · SkuWizard
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { SkuPicker, SupplierPicker, type SkuPickerValue, type SupplierPickerValue } from "@/components/pickers";
import { SkuWizard } from "@/app/master/skus/sku-wizard";
import { r2ImageUrl } from "@/lib/r2-image";

type Variant = { originalName?: string; translatedName?: string };
type Card = {
  id: string;
  original_name: string | null;
  translated_name: string | null;
  price_text: string | null;
  price_rmb: number | null;
  taobao_url: string | null;
  image_url: string | null;
  variants: Variant[];
  note: string | null;
  status: "new" | "matched" | "rejected";
  matched_sku_id: string | null;
  matched_parent_sku_id: string | null;
  matched_label: string | null;
  supplier_item_id: string | null;
  created_at: string | null;
};
type Counts = { new: number; matched: number; rejected: number };

const PAGE = 60;
const STATUS_TABS = [
  { key: "new",      label: "🆕 ยังไม่จับคู่" },
  { key: "matched",  label: "✅ จับคู่แล้ว" },
  { key: "rejected", label: "🚫 ตีตก" },
] as const;
type StatusKey = (typeof STATUS_TABS)[number]["key"];

const fmtRmb = (n: number | null) => (n == null ? null : `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`);

/** รูปที่เก็บไว้เป็น R2 key → ผ่าน proxy ของกลาง (ย่อขนาดให้) · ถ้าเป็น URL เต็มอยู่แล้วก็ใช้ตรง ๆ */
const imgSrc = (v: string | null, w: number) => (!v ? null : v.startsWith("http") ? v : r2ImageUrl(v, w));

export function TaobaoBrowser() {
  const toast = useToast();
  const [status, setStatus] = useState<StatusKey>("new");
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [counts, setCounts] = useState<Counts>({ new: 0, matched: 0, rejected: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rate, setRate] = useState(5.2);            // เรตหยวน→บาท (ui_config rmb_to_thb_rate)
  const [matchRow, setMatchRow] = useState<Card | null>(null);
  const [wizardRow, setWizardRow] = useState<Card | null>(null);

  // เรตหยวน→บาท (ของกลางเดียวกับ SkuWizard)
  useEffect(() => {
    apiFetch("/api/ui-config?key=rmb_to_thb_rate").then((r) => r.json())
      .then((j) => { const rr = Number((j.value ?? {}).rate); if (Number.isFinite(rr) && rr > 0) setRate(rr); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (offset = 0) => {
    offset === 0 ? setLoading(true) : setLoadingMore(true);
    try {
      const p = new URLSearchParams({ status, limit: String(PAGE), offset: String(offset) });
      if (search.trim()) p.set("search", search.trim());
      const j = await apiFetch(`/api/taobao-products?${p}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const rows = (j.data ?? []) as Card[];
      setCards((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setTotal(Number(j.total ?? rows.length));
      if (j.counts) setCounts(j.counts as Counts);
      if (offset === 0) setSel(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ");
    } finally { setLoading(false); setLoadingMore(false); }
  }, [status, search, toast]);

  // โหลดครั้งแรก + เปลี่ยนสถานะ · ค้นหา debounce 300ms
  useEffect(() => { const t = setTimeout(() => { void load(0); }, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);

  const toggleSel = (id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = cards.length > 0 && cards.every((c) => sel.has(c.id));

  // เปลี่ยนสถานะ (ตีตก / กู้คืน) — รองรับหลายรายการ
  const patchStatus = async (ids: string[], next: StatusKey) => {
    if (ids.length === 0) return;
    try {
      const res = await apiFetch("/api/taobao-products", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: next }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(next === "rejected" ? `ตีตก ${ids.length} รายการแล้ว` : `กู้คืน ${ids.length} รายการแล้ว`);
      void load(0);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  const removeRows = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`ลบ ${ids.length} รายการออกจากกล่องพัก? (ไม่กระทบ SKU ในระบบ)`)) return;
    try {
      const res = await apiFetch(`/api/taobao-products?ids=${ids.join(",")}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`ลบ ${ids.length} รายการแล้ว`);
      void load(0);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const tabCount = (k: StatusKey) => counts[k] ?? 0;

  return (
    <div>
      {/* แถบสถานะ + ค้นหา */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {STATUS_TABS.map((t, i) => (
            <button key={t.key} onClick={() => setStatus(t.key)}
              className={`h-9 px-3.5 text-sm ${i > 0 ? "border-l border-slate-200" : ""} ${status === t.key ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>
              {t.label} <span className="text-[11px] text-slate-400">{tabCount(t.key).toLocaleString("th-TH")}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 min-w-[240px] bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-slate-400">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อไทย / ชื่อจีน / ลิงก์"
            className="flex-1 h-full text-sm outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>
      </div>

      {/* แถบเลือกหลายรายการ */}
      {sel.size > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 h-11 bg-indigo-50 border border-indigo-200 rounded-lg flex-wrap">
          <span className="text-sm text-indigo-800 font-medium">เลือก {sel.size} รายการ</span>
          {status !== "rejected" && (
            <button onClick={() => patchStatus([...sel], "rejected")}
              className="h-8 px-3 text-[12px] bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🚫 ตีตก</button>
          )}
          {status !== "new" && (
            <button onClick={() => patchStatus([...sel], "new")}
              className="h-8 px-3 text-[12px] bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">↩️ กู้คืน</button>
          )}
          <button onClick={() => removeRows([...sel])}
            className="h-8 px-3 text-[12px] bg-white border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-50">🗑 ลบ</button>
          <button onClick={() => setSel(new Set())} className="h-8 px-2 text-[12px] text-slate-500 hover:text-slate-700 ml-auto">ยกเลิกเลือก</button>
        </div>
      )}

      {/* จำนวน + เลือกทั้งหมด */}
      {!loading && cards.length > 0 && (
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <p className="text-[12px] text-slate-400">{total.toLocaleString("th-TH")} รายการ (แสดง {cards.length.toLocaleString("th-TH")})</p>
          <button onClick={() => setSel(allSelected ? new Set() : new Set(cards.map((c) => c.id)))}
            className={`h-8 px-2.5 text-[12px] rounded-lg border ${allSelected ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            {allSelected ? "☑ เลือกแล้ว" : "☐ เลือกทั้งหมด"}
          </button>
        </div>
      )}

      {/* การ์ด */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลด…</div>
      ) : cards.length === 0 ? (
        <EmptyBox status={status} hasSearch={!!search.trim()} />
      ) : (
        <>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {cards.map((c) => (
              <TaobaoCardView key={c.id} card={c} rate={rate} selected={sel.has(c.id)}
                onToggle={() => toggleSel(c.id)}
                onMatch={() => setMatchRow(c)}
                onCreate={() => setWizardRow(c)}
                onReject={() => patchStatus([c.id], "rejected")}
                onRestore={() => patchStatus([c.id], "new")} />
            ))}
          </div>
          {cards.length < total && (
            <div className="text-center mt-4">
              <button onClick={() => void load(cards.length)} disabled={loadingMore}
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {loadingMore ? "กำลังโหลด…" : `โหลดเพิ่ม (เหลืออีก ${(total - cards.length).toLocaleString("th-TH")})`}
              </button>
            </div>
          )}
        </>
      )}

      {/* ป๊อปจับคู่ SKU เดิม */}
      {matchRow && (
        <MatchModal row={matchRow} rate={rate}
          onClose={() => setMatchRow(null)}
          onDone={() => { setMatchRow(null); void load(0); }} />
      )}

      {/* สร้าง SKU ใหม่ — Wizard ของกลาง (เติมค่าให้ล่วงหน้า) */}
      {wizardRow && (
        <SkuWizard open onClose={() => setWizardRow(null)}
          prefill={{
            name_th: wizardRow.translated_name ?? "",
            rmb_cost: wizardRow.price_rmb ?? undefined,
            purchase_link: wizardRow.taobao_url ?? "",
          }}
          onCreated={async (res) => {
            const newId = res?.ids?.[0] ?? null;
            try {
              await apiFetch("/api/taobao-products", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: wizardRow.id, status: "matched", matched_sku_id: newId }),
              });
            } catch { /* สร้าง SKU สำเร็จแล้ว — พลาดแค่ทำเครื่องหมาย ไม่ต้องขัดจังหวะ */ }
            setWizardRow(null);
            void load(0);
          }} />
      )}
    </div>
  );
}

// ── การ์ด 1 ใบ ──
function TaobaoCardView({ card, rate, selected, onToggle, onMatch, onCreate, onReject, onRestore }: {
  card: Card; rate: number; selected: boolean;
  onToggle: () => void; onMatch: () => void; onCreate: () => void; onReject: () => void; onRestore: () => void;
}) {
  const baht = card.price_rmb != null ? card.price_rmb * rate : null;
  return (
    <div className={`border rounded-xl bg-white overflow-hidden flex flex-col transition ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"}`}>
      <div className="relative bg-slate-50 h-[150px] flex items-center justify-center">
        {card.image_url
          ? <img src={imgSrc(card.image_url, 420) ?? ""} alt={card.translated_name ?? ""} className="max-h-full max-w-full object-contain" loading="lazy" />
          : <span className="text-slate-300 text-3xl">🖼️</span>}
        <button onClick={onToggle}
          className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border text-[11px] leading-none flex items-center justify-center ${selected ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white/90 border-slate-300 text-transparent hover:border-indigo-400"}`}
          title="เลือก">✓</button>
        {card.status === "matched" && <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">จับคู่แล้ว</span>}
        {card.status === "rejected" && <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">ตีตก</span>}
      </div>

      <div className="p-2.5 flex-1 flex flex-col gap-1">
        <p className="text-[13px] font-medium text-slate-800 line-clamp-2 leading-snug" title={card.translated_name ?? ""}>
          {card.translated_name || <span className="text-slate-400">(ยังไม่มีชื่อไทย)</span>}
        </p>
        {card.original_name && <p className="text-[11px] text-slate-400 line-clamp-1" title={card.original_name}>{card.original_name}</p>}

        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-[13px] font-semibold text-rose-600 tabular-nums">{fmtRmb(card.price_rmb) ?? card.price_text ?? "—"}</span>
          {baht != null && <span className="text-[11px] text-slate-400 tabular-nums">≈ ฿{baht.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</span>}
        </div>

        {card.variants.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {card.variants.slice(0, 3).map((v, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 max-w-full truncate"
                title={`${v.translatedName ?? ""} ${v.originalName ? `(${v.originalName})` : ""}`}>
                {v.translatedName || v.originalName}
              </span>
            ))}
            {card.variants.length > 3 && <span className="text-[10px] text-slate-400">+{card.variants.length - 3}</span>}
          </div>
        )}

        {card.matched_label && <p className="text-[10px] text-emerald-700 line-clamp-1 mt-0.5" title={card.matched_label}>🔗 {card.matched_label}</p>}

        <div className="mt-auto pt-2 flex items-center gap-1 flex-wrap">
          {card.taobao_url && (
            <a href={card.taobao_url} target="_blank" rel="noopener noreferrer"
              className="h-7 px-2 text-[11px] border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center" title="เปิดหน้า Taobao">🔗 Taobao</a>
          )}
          {card.status === "rejected" ? (
            <button onClick={onRestore} className="h-7 px-2 text-[11px] border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">↩️ กู้คืน</button>
          ) : (
            <>
              <button onClick={onMatch} className="h-7 px-2 text-[11px] border border-indigo-200 rounded-lg text-indigo-700 hover:bg-indigo-50" title="ผูกกับ SKU ที่มีอยู่แล้ว">🔗 จับคู่</button>
              <button onClick={onCreate} className="h-7 px-2 text-[11px] border border-emerald-200 rounded-lg text-emerald-700 hover:bg-emerald-50" title="สร้าง SKU ใหม่จากข้อมูลนี้">➕ สร้าง</button>
              <button onClick={onReject} className="h-7 px-2 text-[11px] text-slate-400 hover:text-rose-600" title="ไม่เอา">🚫</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ป๊อป "จับคู่ SKU เดิม" ──
function MatchModal({ row, rate, onClose, onDone }: { row: Card; rate: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [supplier, setSupplier] = useState<SupplierPickerValue | null>(null);
  const [price, setPrice] = useState<string>(row.price_rmb != null ? String(row.price_rmb) : "");
  const [saving, setSaving] = useState(false);

  const baht = Number(price) > 0 ? Number(price) * rate : null;

  const save = async () => {
    if (!sku) { toast.error("เลือก SKU ที่จะจับคู่ก่อน"); return; }
    setSaving(true);
    try {
      let supplierItemId: string | null = null;

      // 1) มีร้าน → บันทึกราคาร้านจีนผ่าน API เดิม (supplier_items + ซิงก์ rmb_cost/ลิงก์ กลับ SKU ให้อัตโนมัติ)
      if (supplier) {
        const res = await apiFetch("/api/purchasing/sku-suppliers", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku_id: sku.id, partner_id: supplier.id,
            price: Number(price) || null, currency: "RMB",
            purchase_link: row.taobao_url ?? null,
            default_if_none: true,
            note: row.original_name ? `Taobao: ${row.original_name}` : null,
          }),
        });
        const j = await res.json();
        if (j.error) throw new Error(j.error);
        supplierItemId = j.data?.id ?? null;
      }

      // 2) ทำเครื่องหมายในกล่องพักว่าจับคู่แล้ว
      const res2 = await apiFetch("/api/taobao-products", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status: "matched", matched_sku_id: sku.id, supplier_item_id: supplierItemId }),
      });
      const j2 = await res2.json(); if (j2.error) throw new Error(j2.error);

      toast.success(supplier ? `จับคู่กับ ${sku.code} + บันทึกราคาร้านแล้ว` : `จับคู่กับ ${sku.code} แล้ว`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "จับคู่ไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="🔗 จับคู่กับ SKU ที่มีอยู่" size="md"
      description="ผูกสินค้า Taobao นี้เข้ากับ SKU เดิม และบันทึกราคาเป็น “ราคาร้านจีน” ของ SKU นั้น"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={saving || !sku}
            className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "จับคู่และบันทึก"}
          </button>
        </div>
      }>
      <div className="space-y-4">
        {/* สรุปของที่จะจับคู่ */}
        <div className="flex gap-3 p-3 bg-slate-50 rounded-lg">
          {row.image_url && <img src={imgSrc(row.image_url, 160) ?? ""} alt="" className="w-16 h-16 object-contain bg-white rounded border border-slate-200" />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 line-clamp-2">{row.translated_name || "(ยังไม่มีชื่อไทย)"}</p>
            {row.original_name && <p className="text-[11px] text-slate-400 line-clamp-1">{row.original_name}</p>}
            <p className="text-[12px] text-rose-600 mt-0.5">{fmtRmb(row.price_rmb) ?? row.price_text ?? "—"}</p>
          </div>
        </div>

        <div>
          <label className="block text-[13px] text-slate-600 mb-1">SKU ที่จะจับคู่ <span className="text-rose-500">*</span></label>
          <SkuPicker value={sku} onChange={setSku} salesOnly={false} placeholder="ค้นหา SKU (รหัส / ชื่อ)…" />
        </div>

        <div>
          <label className="block text-[13px] text-slate-600 mb-1">ร้านที่ซื้อ (ไม่บังคับ)</label>
          <SupplierPicker value={supplier} onChange={setSupplier} placeholder="เลือกร้านจีน…" />
          <p className="text-[11px] text-slate-400 mt-1">เลือกร้าน = บันทึกราคา ¥ + ลิงก์ Taobao เข้าเป็น “ราคาร้าน” ของ SKU นี้ (ถ้ายังไม่มีร้านหลัก จะตั้งให้เป็นร้านหลัก)</p>
        </div>

        {supplier && (
          <div>
            <label className="block text-[13px] text-slate-600 mb-1">ราคา (หยวน ¥)</label>
            <div className="flex items-center gap-2">
              <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.01"
                className="h-10 w-40 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
              {baht != null && <span className="text-[12px] text-slate-400">≈ ฿{baht.toLocaleString("th-TH", { maximumFractionDigits: 2 })} (เรต {rate})</span>}
            </div>
          </div>
        )}
      </div>
    </ERPModal>
  );
}

function EmptyBox({ status, hasSearch }: { status: StatusKey; hasSearch: boolean }) {
  if (hasSearch) return <div className="text-center py-16 text-slate-400 text-sm">ไม่พบรายการที่ค้นหา</div>;
  if (status === "new") return (
    <div className="text-center py-16">
      <p className="text-4xl mb-2">🛒</p>
      <p className="text-slate-500 text-sm font-medium">ยังไม่มีสินค้าจาก Taobao</p>
      <p className="text-slate-400 text-[13px] mt-1">เปิดเครื่องมือ taobao-catalog บนเครื่อง → วิเคราะห์รูป → กด “📤 ส่งเข้า ERP” แล้วรายการจะมาโผล่ที่นี่</p>
    </div>
  );
  return <div className="text-center py-16 text-slate-400 text-sm">ยังไม่มีรายการในสถานะนี้</div>;
}
