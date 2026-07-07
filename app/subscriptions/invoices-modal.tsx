"use client";

/**
 * ป๊อปอัปใบเสร็จรายเดือนของ subscription 1 รายการ
 * - อัปโหลด PDF (แยกตามเดือน) → เก็บใน Supabase Storage
 * - เปิดดู / ลบ
 * ใช้ ERPModal กลาง + useToast กลาง
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { Subscription, SubInvoice } from "@/lib/subscriptions";

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const idx = parseInt(m, 10) - 1;
  return names[idx] ? `${names[idx]} ${Number(y) + 543}` : ym;
}

export function InvoicesModal({ sub, canEdit, onClose }: {
  sub: Subscription | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const open = !!sub;
  const [invoices, setInvoices] = useState<SubInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchInvoices = useCallback(async (subId: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/subscriptions/${subId}/invoices`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setInvoices((j.data ?? []) as SubInvoice[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "โหลดใบเสร็จไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => {
    if (sub) { setInvoices([]); fetchInvoices(sub.id); setMonth(new Date().toISOString().slice(0, 7)); }
  }, [sub, fetchInvoices]);

  const handleUpload = async () => {
    if (!sub) return;
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.warning("กรุณาเลือกไฟล์ PDF"); return; }
    if (!month) { toast.warning("กรุณาเลือกเดือน"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("month", month);
      const res = await apiFetch(`/api/subscriptions/${sub.id}/invoices`, { method: "POST", body: fd });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success("อัปโหลดใบเสร็จแล้ว");
      if (fileRef.current) fileRef.current.value = "";
      setInvoices((prev) => [j.data as SubInvoice, ...prev]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally { setUploading(false); }
  };

  const handleDelete = async (inv: SubInvoice) => {
    if (!sub) return;
    if (!confirm(`ลบใบเสร็จ "${inv.file_name}"?`)) return;
    try {
      const res = await apiFetch(`/api/subscriptions/${sub.id}/invoices/${inv.id}`, { method: "DELETE" });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success("ลบใบเสร็จแล้ว");
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  // จัดกลุ่มตามเดือน (ใหม่สุดก่อน)
  const grouped = invoices.reduce<Record<string, SubInvoice[]>>((acc, inv) => {
    (acc[inv.month] ??= []).push(inv);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="subs-invoices"
      title={sub ? `🧾 ใบเสร็จ · ${sub.name}` : "ใบเสร็จ"}
      description="เก็บไฟล์ PDF ใบเสร็จแยกตามเดือน (เก็บใน Supabase)"
      footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>}>
      <div className="space-y-4">
        {/* กล่องอัปโหลด */}
        {canEdit && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[120px]">
                <span className="block text-xs font-medium text-slate-600 mb-1">เดือนของใบเสร็จ</span>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                  className="h-9 w-full px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400" />
              </label>
              <label className="flex-[2] min-w-[160px]">
                <span className="block text-xs font-medium text-slate-600 mb-1">ไฟล์ PDF</span>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf"
                  className="h-9 w-full text-sm file:mr-2 file:h-7 file:rounded-md file:border-0 file:bg-indigo-100 file:px-2 file:text-indigo-700 file:text-xs" />
              </label>
              <button onClick={handleUpload} disabled={uploading}
                className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {uploading ? "กำลังอัปโหลด…" : "⬆ อัปโหลด"}
              </button>
            </div>
          </div>
        )}

        {/* รายการ */}
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
        ) : months.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-4xl mb-2">📄</div>
            <p className="text-sm text-slate-500">ยังไม่มีใบเสร็จ{canEdit && " — อัปโหลด PDF ด้านบนเพื่อเริ่ม"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {months.map((m) => (
              <div key={m}>
                <div className="text-xs font-semibold text-slate-500 mb-1.5">{fmtMonth(m)}</div>
                <div className="space-y-1.5">
                  {grouped[m].map((inv) => (
                    <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
                      <span className="text-lg flex-shrink-0">📄</span>
                      <span className="flex-1 min-w-0 truncate text-sm text-slate-700" title={inv.file_name}>{inv.file_name}</span>
                      {inv.url
                        ? <a href={inv.url} target="_blank" rel="noopener noreferrer"
                            className="h-7 px-2.5 inline-flex items-center rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">🔗 เปิด</a>
                        : <span className="text-xs text-slate-300">—</span>}
                      {canEdit && (
                        <button onClick={() => handleDelete(inv)} title="ลบ"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500">🗑</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ERPModal>
  );
}
