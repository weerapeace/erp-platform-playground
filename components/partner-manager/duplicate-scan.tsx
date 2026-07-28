"use client";

// ============================================================
// DuplicateScanModal — สแกน "ร้าน/คู่ค้าที่น่าจะซ้ำกัน" ในทะเบียน
//   ใช้ของกลาง ERPModal + API /api/partner-duplicates (ซึ่งใช้ lib/partner-match)
//   อ่านอย่างเดียว: บอกว่าคู่ไหนน่าจะซ้ำ + ตัวไหนมีข้อมูลผูกอยู่เท่าไหร่
//   ไม่รวมร้านให้อัตโนมัติ (ย้ายข้อมูลข้ามร้านต้องคนตัดสินใจ)
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { ERPModal } from "@/components/modal";
import { Spinner } from "@/components/spinner";
import { apiFetch } from "@/lib/api";
import type { DupGroupOut, DupMember } from "@/app/api/partner-duplicates/route";

const nameOf = (m: DupMember) => String(m.display_name || m.name_th || m.name_en || m.code || "(ไม่มีชื่อ)");

function UsageChips({ u }: { u: DupMember["usage"] }) {
  const chips: [string, number][] = [
    ["วัตถุดิบ", u.supplier_items], ["ใบสั่งซื้อ", u.purchase_orders],
    ["สินค้า", u.skus], ["บิลจีน", u.china_bills],
  ];
  const shown = chips.filter(([, n]) => n > 0);
  if (!shown.length) return <span className="text-[11.5px] text-slate-400">ยังไม่มีข้อมูลผูกอยู่</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {shown.map(([label, n]) => (
        <span key={label} className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          {label} {n.toLocaleString("th-TH")}
        </span>
      ))}
    </div>
  );
}

export function DuplicateScanModal({ open, onClose, onOpenPartner }: {
  open: boolean;
  onClose: () => void;
  /** กดชื่อร้าน → เปิด drawer ร้านนั้นในหน้าเดิม */
  onOpenPartner?: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [groups, setGroups] = useState<DupGroupOut[]>([]);
  const [scanned, setScanned] = useState(0);

  const scan = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch("/api/partner-duplicates");
      const j = await res.json() as { groups?: DupGroupOut[]; scanned?: number; error?: string | null };
      if (j.error) throw new Error(j.error);
      setGroups(j.groups ?? []); setScanned(j.scanned ?? 0);
    } catch (e) { setErr(e instanceof Error ? e.message : "สแกนไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) void scan(); }, [open, scan]);

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="partner-dup-scan"
      title="🔍 สแกนร้านซ้ำ"
      description="หาคู่ค้า/ร้านที่ชื่อคล้ายกันมาก — มักเกิดจากพิมพ์ชื่อไม่เหมือนเดิมตอนสร้างใหม่"
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-[12px] text-slate-400 mr-auto">{loading ? "" : `ตรวจแล้ว ${scanned.toLocaleString("th-TH")} ราย`}</span>
          <button onClick={() => void scan()} disabled={loading}
            className="h-[36px] px-3.5 text-[13px] font-semibold rounded-[10px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            สแกนใหม่
          </button>
          <button onClick={onClose} className="h-[36px] px-4 text-[13px] font-semibold rounded-[10px] bg-indigo-600 text-white hover:bg-indigo-700">ปิด</button>
        </div>
      }>
      {loading ? (
        <div className="py-14 text-center text-slate-400 text-[13px]"><Spinner /> กำลังเทียบชื่อทั้งทะเบียน…</div>
      ) : err ? (
        <div className="py-10 text-center text-[13px] text-rose-600">เกิดข้อผิดพลาด: {err}</div>
      ) : groups.length === 0 ? (
        <div className="py-14 text-center">
          <div className="text-[15px] font-semibold text-emerald-600">✅ ไม่พบร้านที่น่าจะซ้ำ</div>
          <div className="mt-1.5 text-[12.5px] text-slate-400">ทะเบียนสะอาดดีครับ</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-[10px] px-3.5 py-2.5">
            พบ <b>{groups.length}</b> กลุ่มที่ชื่อคล้ายกัน — ระบบ<b>ไม่รวมให้อัตโนมัติ</b> เพราะการย้ายข้อมูลข้ามร้านย้อนกลับยาก
            <div className="mt-1 text-amber-700">ถ้ายืนยันว่าซ้ำจริง บอกผมได้ว่าจะเก็บตัวไหน แล้วผมจะย้ายข้อมูลให้ทีละคู่</div>
          </div>
          {groups.map((g, gi) => (
            <div key={gi} className="border border-slate-200 rounded-[12px] overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 text-[11.5px] font-semibold text-slate-500">
                คล้ายกัน {Math.round(g.score * 100)}%
              </div>
              <div className="divide-y divide-slate-100">
                {g.members.map((m, mi) => (
                  <div key={m.id} className="px-3.5 py-2.5 flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <button onClick={() => onOpenPartner?.(m.id)}
                        className="text-[13.5px] font-semibold text-left hover:text-indigo-700 hover:underline truncate max-w-full">
                        {nameOf(m)}
                      </button>
                      <div className="flex gap-1.5 flex-wrap items-center mt-1">
                        {m.code && <span className="text-[11px] font-mono text-slate-400">{m.code}</span>}
                        {mi === 0 && g.members.length > 1 && (
                          <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">มีข้อมูลมากสุด — น่าจะเก็บตัวนี้</span>
                        )}
                        {m.is_active === false && <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">ปิดใช้งาน</span>}
                        {m.is_supplier && <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">🏭 ผู้ขาย</span>}
                        {m.is_customer && <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">🛍️ ลูกค้า</span>}
                      </div>
                    </div>
                    <div className="pt-0.5"><UsageChips u={m.usage} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ERPModal>
  );
}
