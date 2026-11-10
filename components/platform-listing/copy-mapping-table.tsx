"use client";

/**
 * ตารางจับคู่ช่อง "ลงร้านอื่นจากรายการนี้" (ของกลาง) — ช่องของร้านปลายทาง ← ร้านต้นทาง / ข้อมูลในระบบ / ร่างที่แก้ไว้
 * --------------------------------------------------------------------------
 * ใช้ใน: ตัวช่วยลงสินค้า (AddToPlatformWizard ขั้น "ดูและแก้" เมื่อเปิดจากรายการบนร้าน) — วางเหนือหน้าดูก่อนส่งของ LINE
 * ทำอะไร: โชว์ทุกช่องว่าจะใช้ค่าจากไหน (ป้ายสี) · เลือกแหล่งได้ทีละช่อง → "ใช้ตามที่เลือก" = เขียนลงร่างของร้านปลายทาง (ไม่แก้สินค้าในระบบ)
 *   ราคา: บอกตัวที่ในระบบยังว่างแต่ร้านต้นทางมี → ปุ่มเติมลงระบบ (ถามก่อน · เฉพาะช่องว่าง) · ตัวที่ไม่ตรงกัน = บอกให้รู้ (ไม่ทับ)
 *   สต๊อก: ไม่คัดลอก
 * ข้อมูล: GET/POST /api/platform-listing/copy · กฎ = lib/listing-copy-map (pure + เทสต์)
 * สิทธิ์: เลือก/ใช้ = products.platforms.edit · เติมราคา = products.edit (+ edit)
 * ห้ามใช้: แก้รายละเอียดสินค้าบนร้านที่มีอยู่แล้ว (ใช้ลิ้นชักสินค้าบนร้าน) · ลงสินค้าจากข้อมูลในระบบล้วน (ใช้ตัวช่วยลงสินค้าเฉย ๆ)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { COPY_CHOICE_LABEL, priceFills, type CopyChoice, type CopyFieldKey, type CopyPlan, type CopyTarget } from "@/lib/listing-copy-map";

type Resp = { plan: CopyPlan | null; filled?: number; error: string | null };

/** ป้ายสีของแต่ละแหล่ง (ใช้ทั้งปุ่มเลือกและป้าย) */
const CHOICE_CLS: Record<CopyChoice, { on: string; badge: string }> = {
  source: { on: "border-violet-400 bg-violet-50 text-violet-800", badge: "bg-violet-50 text-violet-800 border-violet-200" },
  system: { on: "border-emerald-400 bg-emerald-50 text-emerald-800", badge: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  keep: { on: "border-amber-400 bg-amber-50 text-amber-800", badge: "bg-amber-50 text-amber-800 border-amber-200" },
};
const Badge = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{children}</span>
);
const baht = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH"));
const list = (xs: string[], n = 5) => xs.slice(0, n).join(", ") + (xs.length > n ? ` และอีก ${xs.length - n}` : "");

export function CopyMappingTable({ listingId, target = "line_shopping", canEdit, canEditPrice, onApplied }: {
  /** รายการบนร้านต้นทาง (platform_catalog_listings.id) */
  listingId: string;
  target?: CopyTarget;
  canEdit: boolean;
  canEditPrice: boolean;
  /** เขียนร่าง/ราคาแล้ว → ให้หน้าดูก่อนส่งโหลดใหม่ */
  onApplied?: () => void;
}) {
  const toast = useToast();
  const [plan, setPlan] = useState<CopyPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [choices, setChoices] = useState<Partial<Record<CopyFieldKey, CopyChoice>>>({});
  const [saving, setSaving] = useState(false);
  const [askFill, setAskFill] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  const takePlan = useCallback((p: CopyPlan) => { setPlan(p); setChoices(Object.fromEntries(p.fields.map((f) => [f.key, f.choice]))); }, []);
  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/platform-listing/copy?listing_id=${encodeURIComponent(listingId)}&target=${target}`).then((r) => r.json()) as Resp;
      if (j.error || !j.plan) throw new Error(j.error || "โหลดไม่สำเร็จ");
      takePlan(j.plan);
    } catch (e) { setErr((e as Error).message || "โหลดไม่สำเร็จ"); }
  }, [listingId, target, takePlan]);
  useEffect(() => { setPlan(null); void load(); }, [load]);

  const dirty = !!plan && plan.fields.some((f) => (choices[f.key] ?? f.choice) !== f.choice);
  const fills = useMemo(() => (plan ? priceFills(plan) : []), [plan]);

  const post = async (body: Record<string, unknown>, okMsg: (j: Resp) => string) => {
    setSaving(true);
    try {
      const j = await apiFetch("/api/platform-listing/copy", { method: "POST", body: JSON.stringify({ listing_id: listingId, target, ...body }) }).then((r) => r.json()) as Resp;
      if (j.error) throw new Error(j.error);
      if (j.plan) takePlan(j.plan);
      toast.success(okMsg(j));
      onApplied?.();
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const apply = () => post({ action: "apply", choices }, () => "ใช้ข้อมูลตามที่เลือกลงร่างแล้ว");
  const fillPrices = async () => { await post({ action: "fill_prices" }, (j) => `เติมราคาลงระบบแล้ว ${j.filled ?? 0} ช่อง`); setAskFill(false); };

  if (err) return <ErrorState title="โหลดข้อมูลร้านต้นทางไม่สำเร็จ" hint={err} onRetry={() => void load()} className="py-6" />;
  if (!plan) return <LoadingState label="กำลังดึงข้อมูลจากร้านต้นทาง..." className="py-6" />;
  const src = plan.source;
  const srcName = src.platform_name || src.platform_code;

  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <PlatformIcon code={src.platform_code} size={16} />
          <span className="font-medium">คัดลอกจาก {srcName}</span>
          {src.external_id && <span className="font-mono text-[11px] text-slate-400">#{src.external_id}</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {plan.applied ? <span className="text-emerald-700"><Icon name="done" /> ใช้ลงร่างแล้ว</span> : <span className="text-slate-500">ยังไม่ได้ใช้ลงร่าง</span>}
          <button type="button" onClick={() => void load()} disabled={saving} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50 disabled:opacity-50"><Icon name="refresh" />ดึงใหม่</button>
        </div>
      </div>
      {src.warning && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"><Icon name="warning" /> {src.warning}</p>}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
        <div className="hidden grid-cols-[7rem_minmax(0,1fr)_auto] gap-3 px-3 py-1.5 text-[11px] text-slate-400 sm:grid">
          <span>ช่องของร้านปลายทาง</span><span>ค่าที่จะใช้</span><span>มาจาก</span>
        </div>
        {plan.fields.map((f) => {
          const ch = choices[f.key] ?? f.choice;
          const val = ch === "source" ? f.source : ch === "keep" ? f.draft : f.system;
          const empty = !val;
          return (
            <div key={f.key} className="grid gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
              <span className="text-slate-600">{f.label}{f.required && <span className="text-rose-500"> *</span>}</span>
              <div className="min-w-0">
                <div className={`break-words ${empty ? (f.required ? "text-rose-600" : "text-slate-400") : "text-slate-800"}`}>{val || (f.required ? "ไม่มี — ต้องมีก่อนลง" : "ไม่มี (ไม่ส่ง)")}</div>
                {f.note && <div className="text-[11px] text-slate-400">{f.note}</div>}
              </div>
              <div className="flex flex-wrap items-start gap-1">
                {canEdit && f.choices.length > 1 ? f.choices.map((c) => (
                  <button key={c} type="button" disabled={saving} onClick={() => setChoices((s) => ({ ...s, [f.key]: c }))} aria-pressed={ch === c}
                    className={`h-7 rounded-md border px-2 text-[11px] ${ch === c ? CHOICE_CLS[c].on : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{COPY_CHOICE_LABEL[c]}</button>
                )) : <Badge cls={CHOICE_CLS[ch].badge}>{COPY_CHOICE_LABEL[ch]}</Badge>}
              </div>
            </div>
          );
        })}
        <div className="grid gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
          <span className="text-slate-600">หมวด<span className="text-rose-500"> *</span></span>
          <div className={plan.category.missing ? "text-rose-600" : "text-slate-800"}>{plan.category.label || "หมวดกลางของสินค้ายังไม่ได้ผูกหมวดของร้านนี้ — เลือกในช่อง \"หมวด\" ด้านล่าง"}</div>
          <Badge cls="border-slate-200 bg-slate-50 text-slate-600">หมวดกลาง → ร้านปลายทาง</Badge>
        </div>
        <div className="grid gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
          <span className="text-slate-600">ตัวเลือก</span>
          <div className="min-w-0 text-slate-800">
            สร้างจาก SKU ในระบบ {plan.variants.system.toLocaleString()} ตัว · ตรงกับ {srcName} {plan.variants.matched.toLocaleString()}/{plan.variants.source.toLocaleString()} (จับด้วยรหัส SKU)
            {plan.variants.sourceOnly.length > 0 && <div className="text-[11px] text-amber-700">มีบน {srcName} แต่ไม่มีในระบบ (จะไม่ลง): {list(plan.variants.sourceOnly)}</div>}
            {plan.variants.systemOnly.length > 0 && plan.variants.source > 0 && <div className="text-[11px] text-slate-400">มีในระบบแต่ไม่มีบน {srcName} (จะลงด้วย): {list(plan.variants.systemOnly)}</div>}
          </div>
          <Badge cls={CHOICE_CLS.system.badge}>SKU</Badge>
        </div>
        <div className="grid gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
          <span className="text-slate-600">ราคา</span>
          <div className="min-w-0 space-y-1 text-slate-800">
            <div>ใช้ราคาในระบบ (แก้ได้ในตารางราคาด้านล่าง)</div>
            {plan.priceFillCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-50 px-2 py-1.5 text-xs text-violet-900">
                <span>ในระบบยังไม่มีราคา {plan.priceFillCount.toLocaleString()} ตัว แต่ {srcName} มี</span>
                {canEditPrice && canEdit && <button type="button" disabled={saving} onClick={() => setAskFill(true)} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">เติมราคาจาก {srcName} ลงระบบ</button>}
              </div>
            )}
            {plan.priceConflictCount > 0 && (
              <div className="text-xs text-amber-800">
                <button type="button" onClick={() => setShowConflicts((v) => !v)} className="hover:underline"><Icon name="warning" /> ราคาไม่ตรงกับ {srcName} {plan.priceConflictCount.toLocaleString()} ตัว — ระบบใช้ราคาในระบบ ({showConflicts ? "ซ่อน" : "ดู"})</button>
                {showConflicts && (
                  <div className="mt-1 divide-y divide-amber-100 rounded border border-amber-200 bg-white">
                    {plan.prices.filter((p) => p.conflict).map((p) => (
                      <div key={p.sku_id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 px-2 py-1 text-[11px]">
                        <span className="truncate font-mono" title={p.label ?? ""}>{p.code}</span>
                        <span>ในระบบ {baht(p.sys_fake)} / {baht(p.sys_sale)}</span>
                        <span>{srcName} {baht(p.src_full)} / {baht(p.src_sale)}</span>
                      </div>
                    ))}
                    <div className="px-2 py-1 text-[10px] text-slate-400">เต็ม / ขาย</div>
                  </div>
                )}
              </div>
            )}
          </div>
          <Badge cls={CHOICE_CLS.system.badge}>SKU</Badge>
        </div>
        <div className="grid gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
          <span className="text-slate-600">สต๊อก</span>
          <div className="text-slate-500">ไม่คัดลอกจากร้านต้นทาง — ใช้ยอดพร้อมขายในระบบ</div>
          <Badge cls="border-slate-200 bg-slate-50 text-slate-500">ไม่คัดลอก</Badge>
        </div>
      </div>

      {plan.missing.length > 0 && <p className="text-xs text-rose-700"><Icon name="warning" /> ยังขาด: {plan.missing.join(" · ")}</p>}
      {canEdit && (dirty || !plan.applied) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && <button type="button" disabled={saving} onClick={() => takePlan(plan)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs hover:bg-slate-50">ยกเลิก</button>}
          <button type="button" disabled={saving} onClick={() => void apply()} className="h-8 rounded-lg bg-violet-600 px-3 text-xs text-white hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "ใช้ตามที่เลือก (ลงร่าง)"}</button>
        </div>
      )}

      <ConfirmDialog open={askFill} onClose={() => { if (!saving) setAskFill(false); }} onConfirm={() => void fillPrices()} loading={saving}
        title={`เติมราคาจาก ${srcName} ลงระบบ`} confirmText={`เติม ${fills.length.toLocaleString()} ช่อง`}
        message={(
          <div className="space-y-2 text-sm">
            <p>เติมเฉพาะช่องที่ในระบบยังว่าง (ไม่ทับราคาที่มีอยู่) · เป็นราคากลางของ SKU ใช้กับทุกช่องทาง · บันทึกประวัติ</p>
            <div className="max-h-48 divide-y divide-slate-100 overflow-auto rounded border border-slate-200 text-xs">
              {fills.map((f) => (
                <div key={`${f.sku_id}-${f.field}`} className="flex justify-between gap-2 px-2 py-1">
                  <span className="font-mono">{f.code}</span>
                  <span>{f.field === "fake_price" ? "ราคาเต็ม" : "ราคาขาย"} → {f.price.toLocaleString("th-TH")}</span>
                </div>
              ))}
            </div>
          </div>
        )} />
    </div>
  );
}
