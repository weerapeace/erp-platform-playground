"use client";

/**
 * ⚙️ ตั้งค่าปลายทางซิงค์สต๊อก (ยอดกันไว้ · โหมด) — ใช้ในหน้า 🔄 ซิงค์สต๊อก
 * เฟส 1 เลือกโหมดได้แค่ ปิด / เทียบอย่างเดียว (ส่งจริงรอเฟส 2 — API กันไว้อีกชั้น)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput, ERPSelect } from "@/components/form";
import { apiFetch } from "@/lib/api";

export type ChannelSettingsTarget = {
  id: string; label: string; buffer_qty: number; mode: string;
  warehouse_code: string | null; warehouse_name: string | null;
};

const MODE_OPTIONS = [
  { value: "compare", label: "เทียบอย่างเดียว (ยังไม่ส่งอะไรออก)" },
  { value: "off", label: "ปิด" },
];

export function ChannelSettingsModal({ channel, open, onClose, onSaved }: {
  channel: ChannelSettingsTarget | null;
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [buffer, setBuffer] = useState("0");
  const [mode, setMode] = useState("compare");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !channel) return;
    setBuffer(String(channel.buffer_qty ?? 0));
    setMode(MODE_OPTIONS.some((o) => o.value === channel.mode) ? channel.mode : "compare");
    setError(null);
  }, [open, channel]);

  const bufferNum = Number(buffer);
  const bufferOk = buffer.trim() !== "" && isFinite(bufferNum) && bufferNum >= 0 && bufferNum <= 9999 && Number.isInteger(bufferNum);
  const dirty = !!channel && (String(channel.buffer_qty ?? 0) !== buffer.trim() || channel.mode !== mode);

  const save = async () => {
    if (!channel || !bufferOk) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch("/api/stock-sync/channels", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: channel.id, buffer_qty: bufferNum, mode }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      onSaved("บันทึกตั้งค่าแล้ว");
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="md" defaultExpanded={false}
      title={`⚙️ ตั้งค่า — ${channel?.label ?? ""}`} hasUnsavedChanges={dirty}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={save} disabled={saving || !bufferOk || !dirty}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </>
      }>
      {channel && (
        <div className="space-y-4">
          <ERPFormField label="คลังที่ใช้ขายออนไลน์" hint="ยอดพร้อมขายคิดจากคลังนี้คลังเดียว — งานผลิตที่เบิกของจากคลังอื่นจะไม่ทำให้ยอดหน้าร้านลด">
            <div className="h-9 px-3 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
              {channel.warehouse_code ?? "—"} {channel.warehouse_name ? `· ${channel.warehouse_name}` : ""}
            </div>
          </ERPFormField>
          <ERPFormField label="ยอดกันไว้ (ชิ้น)" required error={bufferOk ? undefined : "ใส่จำนวนเต็ม 0–9,999"}
            hint="เหลือเท่านี้ให้ถือว่าหมด — กันขายเกินตอนมีออเดอร์เข้าพร้อมกันหลายร้าน · ยอดพร้อมขาย = ในคลัง − จองแล้ว − กันไว้">
            <ERPInput type="number" min={0} step={1} value={buffer} onChange={(e) => setBuffer(e.target.value)} error={!bufferOk} disabled={saving} />
          </ERPFormField>
          <ERPFormField label="โหมด" hint="การส่งยอดขึ้นโปรแกรมเดิมจริงจะเปิดในเฟส 2">
            <ERPSelect options={MODE_OPTIONS} value={mode} onChange={(e) => setMode(e.target.value)} disabled={saving} />
          </ERPFormField>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
      )}
    </ERPModal>
  );
}
