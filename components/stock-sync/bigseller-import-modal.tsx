"use client";

/**
 * ⬆️ นำเข้าไฟล์สต๊อกจาก BigSeller — ห่อของกลาง ImportWizard (อ่านไฟล์ → จับคู่คอลัมน์ → ตรวจ → นำเข้า → ดาวน์โหลดแถวที่พลาด)
 * commit ไปที่ /api/stock-sync/bigseller-import (จับคู่ SKU + บันทึกยอดของ BigSeller · ไม่แตะสต๊อก ERP)
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput } from "@/components/form";
import { ImportWizard } from "@/components/import-wizard";
import { BIGSELLER_IMPORT_SCHEMA } from "@/lib/stock-sync/bigseller";

export function BigSellerImportModal({ channelId, open, actor, onClose, onDone }: {
  channelId: string;
  open: boolean;
  actor?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [warehouse, setWarehouse] = useState("");
  const [round, setRound] = useState(0);
  const commitUrl = `/api/stock-sync/bigseller-import?channel_id=${encodeURIComponent(channelId)}`
    + (warehouse.trim() ? `&warehouse=${encodeURIComponent(warehouse.trim())}` : "");

  const close = () => { setRound((n) => n + 1); onClose(); };

  return (
    <ERPModal open={open} onClose={close} size="xl" title="⬆️ นำเข้าไฟล์สต๊อกจาก BigSeller" storageKey="stock-sync-bigseller-import"
      description="ไฟล์จาก BigSeller: Inventory List → Import & Export → Export · ระบบจะจับคู่รหัสกับ SKU ใน ERP และเก็บยอดของ BigSeller ไว้เทียบ (ยังไม่เปลี่ยนสต๊อกใน ERP)">
      <div className="space-y-4">
        <ERPFormField label="ใช้เฉพาะคลังใน BigSeller ชื่อ (ไม่บังคับ)"
          hint="ไฟล์มีหลายคลัง: เว้นว่าง = รวมยอดทุกคลัง · พิมพ์ชื่อคลังให้ตรงกับในไฟล์ = เอาเฉพาะคลังนั้น (ต้องจับคู่คอลัมน์ 'คลัง' ด้วย)">
          <ERPInput value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="เช่น คลังออนไลน์" />
        </ERPFormField>
        <ImportWizard key={round} schema={BIGSELLER_IMPORT_SCHEMA} commitUrl={commitUrl} actor={actor}
          onClose={close} onDone={onDone} />
      </div>
    </ERPModal>
  );
}
