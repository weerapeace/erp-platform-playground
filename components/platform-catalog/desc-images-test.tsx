"use client";

/**
 * ปุ่มทดสอบ "ใส่รูปในรายละเอียด" บน LINE — อยู่ในลิ้นชักสินค้าบนร้าน แท็บข้อมูล (เจ้าของอนุมัติ 2026-11-10)
 * ช่วงทดสอบ: เฉพาะสินค้าที่ปิดขาย · เลือกรูปจากคลังรูปของสินค้าที่จับคู่ (≤15) → POST /api/line-shopping/desc-images
 * วิธี: ฝากรูปผ่านแกลเลอรีชั่วคราว → ได้ลิงก์ของ LINE → คืนแกลเลอรีเดิม → ต่อรูปท้ายรายละเอียด (lib/line-desc-images)
 * ของกลางที่ใช้: ConfirmDialog · Icon · r2ImageUrl
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";
import { MAX_LINE_DESC_IMAGES as LINE_DESC_IMAGES_MAX } from "@/lib/line-listing-edit";

type Result = { ok: boolean; hosted: string[]; restored: boolean; description: string; present: number; error: string | null };

export function DescImagesTest({ listingId, matchedParent, display, blocked, onDone }: {
  listingId: string;
  matchedParent: string | null;
  /** เปิดขายอยู่ไหม (LINE isDisplay) */
  display: boolean | null;
  /** เหตุผลที่ยังกดไม่ได้ (เช่น มีการแก้ที่ยังไม่ได้ส่ง) */
  blocked: string | null;
  /** ส่งเสร็จ → ลิ้นชักโหลดใหม่ */
  onDone: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState<{ key: string; source: string }[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const reason = !matchedParent ? "จับคู่สินค้าในระบบก่อน (ใช้รูปจากคลังรูปของสินค้านั้น)"
    : display !== false ? "ช่วงทดสอบใช้ได้เฉพาะสินค้าที่ปิดขาย — ปิดขายก่อน (สวิตช์ด้านบน)"
    : blocked;

  const openPicker = async () => {
    setOpen(true); setResult(null);
    if (pool || !matchedParent) return;
    try {
      const j = await apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(matchedParent)}`).then((r) => r.json()) as { images?: { key: string; source: string }[]; descImages?: { key: string; source: string }[] };
      const seen = new Set<string>(); const all: { key: string; source: string }[] = [];
      for (const im of [...(j.images ?? []), ...(j.descImages ?? [])]) if (im.key && !seen.has(im.key)) { seen.add(im.key); all.push({ key: im.key, source: im.source.replace(/^Description (\d+)$/, "รูปในรายละเอียด $1") }); }
      setPool(all);
    } catch { setPool([]); }
  };
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length < LINE_DESC_IMAGES_MAX ? [...s, k] : s));

  const send = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/line-shopping/desc-images", { method: "POST", body: JSON.stringify({ listing_id: listingId, image_keys: sel }) });
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as Result;
      setResult({ ok: !!j.ok, hosted: j.hosted ?? [], restored: j.restored !== false, description: j.description ?? "", present: j.present ?? 0, error: j.error ?? null });
      if (j.ok) { toast.success(`ใส่รูปในรายละเอียดแล้ว ${j.present} รูป`); setSel([]); }
      else toast.error(j.error || "ไม่สำเร็จ");
      setAsk(false);
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-amber-800"><Icon name="image" /> ทดสอบ: ใส่รูปจากระบบลงในรายละเอียด</div>
          <div className="text-[11px] text-slate-500">ฝากรูปผ่านรูปสินค้าชั่วคราว (ไม่กี่วินาที) แล้วคืนรูปสินค้าเดิม → รูปต่อท้ายรายละเอียด · ใช้ได้เฉพาะสินค้าที่ปิดขาย</div>
        </div>
        {!open && <button type="button" disabled={!!reason} title={reason ?? ""} onClick={() => void openPicker()} className="h-7 shrink-0 rounded-md border border-amber-300 bg-white px-2 text-xs text-amber-800 hover:bg-amber-50 disabled:opacity-40">เลือกรูปทดสอบ</button>}
      </div>
      {reason && !open && <p className="mt-1 text-[11px] text-amber-700">{reason}</p>}

      {result && (
        <div className={`mt-2 rounded-md px-2 py-1.5 text-xs ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {result.ok
            ? <>สำเร็จ: รูปอยู่ในรายละเอียดบน LINE แล้ว {result.present} รูป · คืนรูปสินค้าเดิมแล้ว — รอ 1–2 วัน แล้วเปิดดูว่ารูปยังอยู่ไหม</>
            : <>ไม่สำเร็จ: {result.error}{!result.restored && <> · <Icon name="warning" /> รูปสินค้าอาจยังไม่ถูกคืน — เข้าไปตรวจใน LINE</>}</>}
          {result.hosted.length > 0 && <div className="mt-1 text-[10px] text-slate-500">ลิงก์รูปบน LINE: {result.hosted.length} ลิงก์ (บันทึกในประวัติแล้ว)</div>}
        </div>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          {!pool ? <div className="text-xs text-slate-400">กำลังโหลดรูป...</div> : pool.length === 0 ? <div className="text-xs text-slate-500">สินค้าที่จับคู่ยังไม่มีรูปในระบบ</div> : (
            <>
              <div className="text-[11px] text-slate-500">กดเลือกตามลำดับที่อยากให้เรียง (สูงสุด {LINE_DESC_IMAGES_MAX} รูป) · เลือกแล้ว {sel.length}</div>
              <div className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5 overflow-y-auto">
                {pool.map((im) => {
                  const idx = sel.indexOf(im.key);
                  const full = idx < 0 && sel.length >= LINE_DESC_IMAGES_MAX;
                  return (
                    <button key={im.key} type="button" disabled={full} onClick={() => toggle(im.key)} title={im.source}
                      className={`min-w-0 rounded-md border p-0.5 text-left ${idx >= 0 ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-slate-200 bg-white hover:bg-slate-50"} disabled:opacity-40`}>
                      <div className="relative aspect-square overflow-hidden rounded bg-slate-50">
                        <img src={r2ImageUrl(im.key, 160) ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {idx >= 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] text-white">{idx + 1}</span>}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">{im.source}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => { setOpen(false); setSel([]); }} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs hover:bg-slate-50">ปิด</button>
            <button type="button" disabled={!sel.length || !!reason || busy} onClick={() => setAsk(true)} className="h-7 rounded-md bg-amber-600 px-2 text-xs text-white hover:bg-amber-700 disabled:opacity-40">ส่งทดสอบขึ้น LINE ({sel.length} รูป)</button>
          </div>
        </div>
      )}

      <ConfirmDialog open={ask} onClose={() => { if (!busy) setAsk(false); }} onConfirm={() => void send()} loading={busy}
        title="ทดสอบใส่รูปในรายละเอียดบน LINE (ร้านจริง)"
        message={`ระบบจะสลับรูปสินค้าบน LINE ชั่วคราวเพื่อฝากรูป ${sel.length} รูป แล้วคืนรูปสินค้าเดิม จากนั้นต่อรูปท้ายรายละเอียด · สินค้าปิดขายอยู่ ลูกค้าไม่เห็นระหว่างทำ · ใช้เวลาประมาณ 10–30 วินาที`}
        confirmText="ส่งทดสอบ" />
    </div>
  );
}
