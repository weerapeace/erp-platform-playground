"use client";

/**
 * MissingBrandModal (ของกลาง) — ป๊อปอัป "ใส่แบรนด์ให้สินค้าที่ยังไม่มี"
 *
 * โชว์เฉพาะสินค้าในใบสั่งผลิตที่ยังไม่มีแบรนด์ → เลือกแบรนด์ → บันทึก แล้วแถวนั้นหายไป
 * แบรนด์เก็บที่สินค้าหลัก (Parent SKU) ใส่ครั้งเดียวได้ทุกสี/ทุกใบสั่งผลิตของสินค้านั้น
 * ระบบจัดการต้นทางให้เอง (สร้าง Parent / ผูก SKU / ลงทะเบียน SKU) ผ่าน /api/mo/missing-brand
 *
 * ใช้: <MissingBrandModal open onClose={...} onChanged={reload} />
 *   - onChanged: เรียกตอนปิด ถ้ามีการบันทึกอย่างน้อย 1 แถว (ให้หน้าที่เปิดโหลดข้อมูลใหม่)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { MissingBrandItem, MissingBrandOption, MissingBrandResponse, MissingBrandCause } from "@/app/api/mo/missing-brand/route";

const MAX_CHIPS = 8;

// คำอธิบายสาเหตุ + สิ่งที่ระบบจะทำเมื่อกดบันทึก (ภาษาคน)
function explain(it: MissingBrandItem): { why: string; will: string } {
  const newSkus = it.skus.filter((s) => !s.sku_id).length;
  const hasParent = !!it.parent_id;
  const why: Record<MissingBrandCause, string> = {
    parent_no_brand: "สินค้าหลักยังไม่ได้ใส่แบรนด์",
    sku_no_parent: hasParent ? `ยังไม่ได้ผูกกับสินค้าหลัก ${it.code}` : "ยังไม่มีสินค้าหลัก (Parent) ให้ผูก",
    sku_missing: "รหัสนี้ยังไม่ได้ลงทะเบียนเป็นสินค้าในระบบ",
  };
  const steps: string[] = [];
  if (!hasParent) steps.push(`สร้างสินค้าหลัก ${it.code}`);
  if (!it.parent_brand_id) steps.push("ใส่แบรนด์ให้สินค้าหลัก");
  const toLink = it.skus.filter((s) => s.sku_id).length;
  if (it.cause !== "parent_no_brand" && toLink > 0) steps.push(`ผูก ${toLink} รายการเข้าสินค้าหลัก`);
  if (newSkus > 0) steps.push(`ลงทะเบียนสินค้าใหม่ ${newSkus} รายการ`);
  return { why: why[it.cause], will: steps.join(" → ") };
}

export function MissingBrandModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can("products.edit" as Parameters<typeof can>[0]);
  const [items, setItems] = useState<MissingBrandItem[]>([]);
  const [brands, setBrands] = useState<MissingBrandOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});      // key → brand_id ที่เลือก
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [changed, setChanged] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    apiFetch("/api/mo/missing-brand")
      .then((r) => r.json())
      .then((j: MissingBrandResponse) => {
        if (j.error) { setError(j.error); return; }
        setItems(j.items ?? []); setBrands(j.brands ?? []);
      })
      .catch(() => setError("โหลดรายการไม่ได้ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (open) { setPick({}); setChanged(false); load(); } }, [open, load]);

  const brandOf = (it: MissingBrandItem) => it.parent_brand_id ?? pick[it.key] ?? "";
  const ready = useMemo(() => items.filter((it) => (it.parent_brand_id ?? pick[it.key]) && !saving.has(it.key)), [items, pick, saving]);
  const needPick = items.filter((it) => !it.parent_brand_id);
  const totalMo = items.reduce((a, it) => a + it.mo_count, 0);

  const saveOne = async (it: MissingBrandItem): Promise<boolean> => {
    setSaving((s) => new Set(s).add(it.key));
    try {
      const r = await apiFetch("/api/mo/missing-brand", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: it.key, brand_id: it.parent_brand_id ? null : pick[it.key] }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { toast.error(`${it.code}: ${j.error ?? "บันทึกไม่สำเร็จ"}`); return false; }
      setItems((list) => list.filter((x) => x.key !== it.key));
      setChanged(true);
      return true;
    } catch {
      toast.error(`${it.code}: เชื่อมต่อไม่ได้ กรุณาลองใหม่`);
      return false;
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(it.key); return n; });
    }
  };
  const save = async (it: MissingBrandItem) => { if (await saveOne(it)) toast.success(`ใส่แบรนด์ให้ ${it.code} แล้ว`); };
  // บันทึกทีละแถวตามลำดับ (ไม่ยิงพร้อมกัน — แต่ละแถวเขียนหลายตาราง)
  const saveAll = async () => {
    let ok = 0;
    for (const it of ready) if (await saveOne(it)) ok += 1;
    if (ok > 0) toast.success(`ใส่แบรนด์แล้ว ${ok} สินค้า`);
  };

  const close = () => { if (changed) onChanged?.(); onClose(); };
  const busy = saving.size > 0;

  return (
    <ERPModal open={open} onClose={close} size="xl" storageKey="missing-brand-modal"
      title="🏷️ ใส่แบรนด์ให้สินค้าที่ยังไม่มี"
      description="ใส่ครั้งเดียวที่สินค้าหลัก — ทุกสี ทุกใบสั่งผลิตของสินค้านั้นได้แบรนด์ตามทันที"
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-slate-400 mr-auto">แก้แบรนด์ภายหลังได้ที่หน้า Parent SKU</span>
          <button type="button" onClick={close} className="h-9 px-4 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ปิด</button>
          {canEdit && items.length > 0 && (
            <button type="button" onClick={saveAll} disabled={busy || ready.length === 0}
              className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              {busy ? "กำลังบันทึก…" : `บันทึกทั้งหมดที่เลือกแล้ว (${ready.length})`}
            </button>
          )}
        </div>
      }>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={load} className="mt-2 text-xs text-red-600 underline">ลองใหม่</button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-14 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-sm font-medium text-slate-700">ครบแล้ว — สินค้าในใบสั่งผลิตทุกตัวมีแบรนด์</p>
          <p className="text-xs text-slate-400 mt-1">ปิดหน้าต่างนี้แล้วการ์ดจะย้ายไปอยู่ใต้แบรนด์ของตัวเอง</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
            <span>ยังไม่มีแบรนด์ <b className="text-slate-700">{items.length}</b> สินค้า · ใช้ใน <b className="text-slate-700">{totalMo}</b> ใบสั่งผลิต</span>
            {canEdit && needPick.length > 1 && (
              <label className="ml-auto inline-flex items-center gap-1.5">
                <span>ใส่แบรนด์เดียวกันให้ทุกแถวที่ยังว่าง:</span>
                <select value="" onChange={(e) => { const v = e.target.value; if (v) setPick((p) => { const n = { ...p }; for (const it of needPick) if (!n[it.key]) n[it.key] = v; return n; }); }}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white">
                  <option value="">เลือกแบรนด์…</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {!canEdit && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              คุณไม่มีสิทธิ์แก้ข้อมูลสินค้า — ดูรายการได้ แต่ต้องให้ผู้มีสิทธิ์เป็นคนใส่แบรนด์
            </div>
          )}

          {items.map((it) => {
            const ex = explain(it);
            const val = brandOf(it);
            const color = brands.find((b) => b.id === val)?.color ?? null;
            const isSaving = saving.has(it.key);
            return (
              <div key={it.key} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 flex-wrap sm:flex-nowrap">
                <HoverImage url={it.image_url} size={56} previewSize={260} />
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-800">{it.code}</span>
                    <span className="text-[11px] text-slate-400">ใช้ใน {it.mo_count} ใบสั่งผลิต</span>
                  </div>
                  {it.name && <div className="text-sm text-slate-600 line-clamp-1" title={it.name}>{it.name}</div>}
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    {it.skus.slice(0, MAX_CHIPS).map((s) => (
                      <span key={s.code} title={s.name ?? s.code}
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${s.sku_id ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                        {s.code}{!s.sku_id && " · ใหม่"}
                      </span>
                    ))}
                    {it.skus.length > MAX_CHIPS && <span className="text-[10px] text-slate-400">+{it.skus.length - MAX_CHIPS}</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    <span className="text-amber-700">⚠ {ex.why}</span>
                    {ex.will && <span className="text-slate-400"> · กดบันทึกแล้วระบบจะ: {ex.will}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  {it.parent_brand_id ? (
                    <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 flex-1 sm:flex-none"
                      title={`สินค้าหลัก ${it.code} มีแบรนด์อยู่แล้ว — แค่ผูกเข้าไป`}>
                      🏷️ {it.parent_brand_name}
                    </span>
                  ) : (
                    <div className="relative flex-1 sm:flex-none">
                      {color && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none" style={{ background: color }} />}
                      <select value={val} disabled={!canEdit || isSaving}
                        onChange={(e) => setPick((p) => ({ ...p, [it.key]: e.target.value }))}
                        className={`h-9 w-full sm:w-44 pr-2 text-sm border rounded-lg bg-white disabled:opacity-50 ${color ? "pl-7" : "pl-2"} ${val ? "border-slate-300 text-slate-800" : "border-amber-300 text-slate-400"}`}>
                        <option value="">เลือกแบรนด์…</option>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => save(it)} disabled={!val || isSaving}
                      className="h-9 px-3 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shrink-0">
                      {isSaving ? "กำลังบันทึก…" : !it.parent_brand_id ? "บันทึก" : it.skus.some((x) => !x.sku_id) ? "ลงทะเบียน" : "ผูกเลย"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ERPModal>
  );
}
