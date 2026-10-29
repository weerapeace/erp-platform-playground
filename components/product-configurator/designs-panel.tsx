"use client";

/** แท็บ "แบบของลูกค้า" — แบบที่ลูกค้าบันทึก/ใส่ตะกร้า/สั่ง ของทรงนี้ (อ่านอย่างเดียว · เว็บร้านต่อในก้อนถัดไป) */
import { useEffect, useState } from "react";
import { normalizeSelection, optionByCode, slotByCode, type ConfigData } from "@/lib/product-configurator";
import { DESIGN_STATUS_TH, fetchDesigns, money, type CfgDesign } from "./data";

export function DesignsPanel({ data }: { data: ConfigData }) {
  const [rows, setRows] = useState<CfgDesign[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetchDesigns(data.model.shop_id, data.model.id).then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, [data.model.id, data.model.shop_id]);

  const summary = (d: CfgDesign) => {
    const sel = normalizeSelection(data, d.selections as Record<string, string | string[]>).selection;
    return Object.entries(sel).flatMap(([slot, v]) => {
      const s = slotByCode(data, slot);
      if (!s) return [];
      if (s.kind === "text") return v ? [`${s.name_th} “${v}”`] : [];
      const codes = Array.isArray(v) ? v : v ? [v] : [];
      return codes.map((c) => optionByCode(data, slot, c)?.name_th ?? c);
    }).join(" · ");
  };

  if (err) return <p className="text-sm text-amber-700">{err}</p>;
  if (!rows) return <p className="text-sm text-slate-500">กำลังโหลด…</p>;
  if (rows.length === 0) return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">ยังไม่มีแบบจากลูกค้า — จะเริ่มเข้ามาเมื่อเปิดหน้าออกแบบบนเว็บร้าน (ก้อนถัดไป)</div>;
  return (
    <div className="overflow-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2">รหัสแบบ</th><th className="px-3 py-2">ตัวเลือก</th><th className="px-3 py-2 text-right">ราคา</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2">วันที่</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="px-3 py-2 font-mono">{d.code}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{summary(d)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(d.total_price)}</td>
              <td className="px-3 py-2">{DESIGN_STATUS_TH[d.status] ?? d.status}{d.order_ref ? ` · ${d.order_ref}` : ""}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{new Date(d.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
