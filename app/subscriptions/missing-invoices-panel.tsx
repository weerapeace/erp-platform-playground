"use client";

/**
 * พาเนล "⚠️ บิลที่ยังขาด" — รายการ (subscription × เดือน) ที่ควรมีใบเสร็จแต่ยังไม่มี
 * แต่ละแถว: ปุ่มโหลด .bat (เปิด Chrome ไปเอาบิล) หรือเปิดหน้าบิล + ปุ่ม "ข้ามบิล"
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { canMakeBat, downloadSubBat, subInvoiceUrl } from "@/lib/subs-bat";
import type { MissingInvoice } from "@/app/api/subscriptions/missing-invoices/route";

function fmtMonth(ym: string): string {
  const [y, m] = (ym ?? "").split("-");
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const idx = parseInt(m, 10) - 1;
  return names[idx] ? `${names[idx]} ${Number(y) + 543}` : ym;
}

export function MissingInvoicesPanel({ canEdit, refreshKey }: { canEdit: boolean; refreshKey?: number }) {
  const toast = useToast();
  const [items, setItems] = useState<MissingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // key ที่กำลังข้าม
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/subscriptions/missing-invoices");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setItems((j.data ?? []) as MissingInvoice[]);
    } catch { /* เงียบ */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const skip = async (it: MissingInvoice) => {
    const key = `${it.subscription_id}|${it.month}`;
    setBusy(key);
    try {
      const res = await apiFetch("/api/subscriptions/missing-invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: it.subscription_id, month: it.month, action: "skip" }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(`ข้ามบิล ${it.name} (${fmtMonth(it.month)}) แล้ว`);
      setItems((prev) => prev.filter((x) => `${x.subscription_id}|${x.month}` !== key));
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  if (loading) return null;
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-2.5 text-sm text-emerald-700">
        ✅ ครบทุกเดือนแล้ว — ไม่มีบิลที่ขาด (ตรวจรายการ รายเดือน + งาน ย้อน 3 เดือน)
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
      <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-amber-50">
        <span className="text-sm font-semibold text-amber-800">⚠️ บิลที่ยังขาด <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs">{items.length}</span></span>
        <span className="text-amber-500 text-xs">{collapsed ? "▸ แสดง" : "▾ ซ่อน"}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-amber-600 px-1 mb-1.5">รายการ รายเดือน + เปิดใช้งาน + งาน ที่ยังไม่มีใบเสร็จ (ย้อน 3 เดือน) · กดโหลด .bat ไปเอาบิล แล้วอัปโหลดที่ปุ่ม 🧾 ของรายการนั้น หรือกด &ldquo;ข้ามบิล&rdquo; ถ้าเดือนนั้นไม่มีบิล</p>
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
          {items.map((it) => {
            const key = `${it.subscription_id}|${it.month}`;
            const link = subInvoiceUrl(it);
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2">
                <span className="text-[11px] font-medium text-amber-700 bg-amber-100 rounded px-2 py-0.5 flex-shrink-0">{fmtMonth(it.month)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{it.name}</div>
                  {(it.chrome_profile || it.account_email) && (
                    <div className="text-[11px] text-slate-400 truncate">{it.chrome_profile || it.account_email}</div>
                  )}
                </div>
                {canMakeBat(it) ? (
                  <button onClick={() => downloadSubBat(it)} title="โหลดไฟล์เปิด Chrome ไปเอาบิล"
                    className="h-8 px-3 text-xs font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-900 flex-shrink-0">⬇️ .bat</button>
                ) : link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" title="เปิดหน้าบิลของร้าน"
                    className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center flex-shrink-0">🔗 เปิดบิล</a>
                ) : (
                  <span className="text-[11px] text-slate-300 flex-shrink-0">ตั้งลิงก์/โปรไฟล์ก่อน</span>
                )}
                {canEdit && (
                  <button onClick={() => skip(it)} disabled={busy === key} title="เดือนนี้ไม่มีบิล — หยุดเตือน"
                    className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 flex-shrink-0">
                    {busy === key ? "…" : "ข้ามบิล"}
                  </button>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
