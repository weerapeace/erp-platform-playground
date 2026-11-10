"use client";

/**
 * ส่งเป็นของขวัญ — กล่องในลิ้นชักสินค้าบนร้าน (แท็บข้อมูล) · บันทึกแยกจากฟอร์มหลัก
 * POST /api/line-shopping/listing-gift → ลองตั้งบน LINE แล้วดึงกลับตรวจ (ช่วงทดลอง: คู่มือ API ไม่มีช่องนี้)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { LineGiftPicker } from "@/components/platform-listing/line-gift-picker";
import { GIFT_STATUS_LABEL, sameGift, type GiftSetting } from "@/lib/line-gift";

export function LineGiftSection({ listingId, current, canEdit, onDone }: {
  listingId: string;
  /** ค่าบน LINE ตอนนี้ */
  current: GiftSetting;
  canEdit: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const [val, setVal] = useState<GiftSetting>(current);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setVal(current); }, [current]);
  const dirty = !sameGift(val, current);

  const save = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/line-shopping/listing-gift", { method: "POST", body: JSON.stringify({ listing_id: listingId, status: val.status, categories: val.categories }) });
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as { ok: boolean; error: string | null; shape?: string | null };
      if (j.ok) { toast.success("ตั้งของขวัญบน LINE แล้ว"); setMsg({ ok: true, text: "LINE รับค่าแล้ว (ดึงกลับมาตรวจตรงกัน)" }); }
      else { toast.error(j.error || "ไม่สำเร็จ"); setMsg({ ok: false, text: j.error || "ไม่สำเร็จ" }); }
      setAsk(false);
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500">ส่งเป็นของขวัญ <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">ทดลอง</span></span>
        {canEdit && dirty && (
          <div className="flex gap-1">
            <button type="button" disabled={busy} onClick={() => setAsk(true)} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">ส่งขึ้น LINE</button>
            <button type="button" disabled={busy} onClick={() => setVal(current)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
          </div>
        )}
      </div>
      <LineGiftPicker value={val} onChange={setVal} disabled={!canEdit || busy} />
      {msg && <p className={`mt-1.5 text-[11px] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      <ConfirmDialog open={ask} onClose={() => { if (!busy) setAsk(false); }} onConfirm={() => void save()} loading={busy}
        title="ตั้งของขวัญบน LINE (ร้านจริง)"
        message={`${GIFT_STATUS_LABEL[val.status]}${val.status !== "off" && val.categories.length ? ` · หมวด ${val.categories.join(", ")}` : ""} — ช่วงทดลอง: ระบบจะลองส่งแล้วดึงกลับมาตรวจ ถ้า LINE ไม่รับจะบอกให้ไปตั้งใน LINE Seller Center`}
        confirmText="ส่งขึ้น LINE" />
    </div>
  );
}
