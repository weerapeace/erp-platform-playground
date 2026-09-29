"use client";

/**
 * DeleteDraftButton (ของกลาง) — ปุ่ม "🗑 ลบใบร่าง" + หน้าต่างยืนยัน สำหรับเอกสารขาย
 * ใช้กับ: ใบเสนอราคา · ใบขาย · ใบวางบิล (ตรรกะลบอยู่ที่เซิร์ฟเวอร์ lib/sales-doc-delete)
 *
 * ใช้:  {detail.status === "draft" && (
 *         <DeleteDraftButton apiPath="/api/quotations" id={detail.id} docLabel="ใบเสนอราคา"
 *           number={detail.quote_number} onDeleted={(msg) => { flash(msg); setDetailOpen(false); fetchList(); }} />
 *       )}
 *
 * - ปุ่มโผล่เฉพาะคนมีสิทธิ์ so.delete (เจ้าของกำหนด: แอดมิน + ผู้จัดการ · ปรับได้ที่ /admin/role-board)
 * - ลบได้เฉพาะใบร่าง — ใบที่ยืนยัน/ส่งแล้วต้องใช้ "ยกเลิก" (หน้าที่เรียกเป็นคนเช็กสถานะก่อนแสดงปุ่ม · เซิร์ฟเวอร์เช็กซ้ำ)
 * - ลบไม่ได้ (เช่น มีเอกสารอื่นอ้างถึง) → โชว์เหตุผลในหน้าต่างยืนยัน ไม่ปิดเอง
 */
import { useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";

export function DeleteDraftButton({ apiPath, id, docLabel, number, disabled, onDeleted, className }: {
  apiPath: string;                 // เช่น "/api/quotations"
  id: string;
  docLabel: string;                // เช่น "ใบเสนอราคา"
  number?: string | null;          // เลขที่เอกสาร (โชว์ในข้อความยืนยัน)
  disabled?: boolean;
  onDeleted: (message: string) => void;
  className?: string;
}) {
  const canDelete = usePermission("so.delete");
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!canDelete) return null;
  const name = `${docLabel}${number ? ` ${number}` : ""}`;

  const remove = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`${apiPath}/${encodeURIComponent(id)}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error ?? `ลบไม่สำเร็จ (HTTP ${res.status})`); return; }
      setOpen(false);
      onDeleted(`ลบ${name} แล้ว`);
    } catch { setErr("ลบไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" onClick={() => { setErr(null); setOpen(true); }} disabled={disabled || busy}
        title="ลบใบร่างนี้ออกจากระบบ (ใบที่ยืนยันแล้วให้ใช้ ยกเลิก)"
        className={className ?? "h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"}>
        🗑 ลบใบร่าง
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => { if (!busy) setOpen(false); }}
        onConfirm={remove}
        loading={busy}
        variant="danger"
        title={`ลบ${docLabel}ฉบับร่าง?`}
        confirmText="ลบใบร่าง"
        cancelText="ไม่ลบ"
        message={
          <div className="space-y-2">
            <p>{name} จะถูกลบออกจากระบบพร้อมรายการสินค้าในใบ — ลบแล้วเรียกคืนเองไม่ได้</p>
            <p className="text-xs text-slate-500">ระบบเก็บสำเนาใบนี้ไว้ในประวัติ (ใครลบ เมื่อไหร่ มีอะไรอยู่ในใบ){number ? ` · เลข ${number} จะว่างให้ใบถัดไปใช้` : ""}</p>
            {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</p>}
          </div>
        }
      />
    </>
  );
}
