"use client";

// ============================================================
// MissingImagesModal — ตรวจหา "รูปที่หายจากที่เก็บ" (ของกลาง)
//   กดสแกน → เทียบทะเบียนรูปใน DB กับไฟล์จริง → บอกว่าสินค้าตัวไหนรูปหาย
//   ล้าง "รายการผี" ได้ (ลบเฉพาะทะเบียนของรูปที่ไฟล์หายแล้ว → อัปใหม่ได้สะอาด)
// ============================================================

import { useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/spinner";

type Hit = {
  id: string; kind: string; code: string; active: boolean;
  missing_attachments: number; total_attachments: number; cover_missing: boolean; attachment_ids: string[];
};
type ScanResult = { checked: { files_in_storage: number; attachments: number; skus: number; parents: number }; missing: Hit[] };

export function MissingImagesModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [res, setRes] = useState<ScanResult | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [confirmClean, setConfirmClean] = useState(false);

  const scan = async () => {
    setScanning(true); setRes(null);
    try {
      const r = await apiFetch("/api/admin/missing-images");
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "สแกนไม่สำเร็จ");
      setRes(j as ScanResult);
      toast.success(`สแกนเสร็จ — พบรูปหาย ${(j.missing as Hit[]).length} รายการ`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สแกนไม่สำเร็จ"); }
    finally { setScanning(false); }
  };

  const ghostIds = (res?.missing ?? []).flatMap((h) => h.attachment_ids);
  const cleanGhosts = async () => {
    setConfirmClean(false); setCleaning(true);
    try {
      const r = await apiFetch("/api/admin/missing-images", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ghostIds }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "ล้างไม่สำเร็จ");
      toast.success(`ล้างรายการผีแล้ว ${j.removed} รายการ — อัปรูปใหม่ได้เลย`);
      void scan();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ล้างไม่สำเร็จ"); }
    finally { setCleaning(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="🔎 ตรวจรูปที่หายจากที่เก็บ" size="lg"
      description="เทียบ “รายการรูปในระบบ” กับ “ไฟล์จริงที่เก็บไว้” — บอกว่าสินค้าตัวไหนมีรูปเสีย (ขึ้นเป็นไอคอนรูปแตก)"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <span className="text-[11.5px] text-slate-400">
            {res ? `ตรวจไฟล์จริง ${res.checked.files_in_storage.toLocaleString("th-TH")} ไฟล์ · รูปแนบ ${res.checked.attachments.toLocaleString("th-TH")} รายการ` : "ยังไม่ได้สแกน"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
            <button onClick={scan} disabled={scanning}
              className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">
              {scanning && <Spinner />}{scanning ? "กำลังสแกน…" : res ? "สแกนใหม่" : "🔍 เริ่มสแกน"}
            </button>
          </div>
        </div>
      }>
      {!res && !scanning && (
        <p className="py-10 text-center text-sm text-slate-400">กด “เริ่มสแกน” เพื่อตรวจทั้งระบบ (ใช้เวลาไม่กี่วินาที)</p>
      )}
      {scanning && <p className="py-10 text-center text-sm text-slate-400"><Spinner /> กำลังอ่านรายชื่อไฟล์จริงและเทียบกับระบบ…</p>}

      {res && (
        res.missing.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-sm text-emerald-600 font-medium">รูปครบทุกรายการ ไม่มีไฟล์หาย</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200 flex-wrap">
              <p className="text-[13px] text-amber-800">
                พบ <b>{res.missing.length}</b> รายการที่รูปหาย
                {ghostIds.length > 0 && <> · มีรายการผี <b>{ghostIds.length}</b> รูป (ทะเบียนค้างแต่ไฟล์ไม่มี)</>}
              </p>
              {ghostIds.length > 0 && (
                <button onClick={() => setConfirmClean(true)} disabled={cleaning}
                  className="h-8 px-3 text-[12.5px] font-medium rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                  {cleaning ? "กำลังล้าง…" : `🧹 ล้างรายการผี (${ghostIds.length})`}
                </button>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-[90px_1fr_auto] gap-2 px-3 py-2 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <span>ชนิด</span><span>รหัส</span><span>ที่หาย</span>
              </div>
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-slate-100">
                {res.missing.map((h) => (
                  <div key={h.id} className="grid grid-cols-[90px_1fr_auto] gap-2 px-3 py-2 items-center text-[13px]">
                    <span className="text-slate-500 text-[12px]">{h.kind}</span>
                    <span className="font-mono truncate">{h.code || "—"}{!h.active && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">ถังขยะ</span>}</span>
                    <span className="text-right text-[12px] text-rose-600 whitespace-nowrap">
                      {h.missing_attachments > 0 && <>รูปแนบ {h.missing_attachments}/{h.total_attachments}</>}
                      {h.missing_attachments > 0 && h.cover_missing && " · "}
                      {h.cover_missing && "รูปปก"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11.5px] text-slate-400">
              วิธีแก้: เปิดสินค้าแต่ละตัว → ลบรูปที่เสียออก → อัปรูปใหม่ · หรือกด “ล้างรายการผี” ให้ระบบลบทะเบียนที่ค้างให้ก่อน แล้วค่อยอัปใหม่
            </p>
          </div>
        )
      )}

      <ConfirmDialog open={confirmClean} onClose={() => setConfirmClean(false)} onConfirm={cleanGhosts}
        title="ล้างรายการผี?" message={`ลบทะเบียนรูป ${ghostIds.length} รายการที่ไฟล์หายไปแล้ว (ไม่กระทบรูปที่ยังใช้ได้ และไม่ลบไฟล์จริง)`}
        confirmText="ล้างเลย" variant="danger" />
    </ERPModal>
  );
}
