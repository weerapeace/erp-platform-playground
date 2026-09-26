"use client";

/**
 * GrDetailModal (ของกลาง) — ป๊อปรายละเอียดใบรับสินค้า GR 1 ใบ
 *   หัวใบ (เลข GR / PO / ร้าน / วันที่รับ / ผู้รับ) · รายการ (รูป รหัส ชื่อ สั่ง/รับ/เสีย หน่วย) · ไฟล์แนบ (ใบรับของ/บิล ชี้ดูรูป กดเปิดเต็ม)
 *   ปุ่ม 🖨 พิมพ์ใบรับ + ปุ่มเสริมที่หน้าเรียกส่งมา (เช่น ออกใบสำคัญจากใบนี้)
 * ใช้: <GrDetailModal grId onClose footer? />   (ข้อมูลจาก /api/purchasing/goods-receipt/<id>)
 */
import { useEffect, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { HoverPreview } from "@/components/hover-image";
import { CopyButton } from "@/components/copy-button";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { GrDetail } from "@/app/api/purchasing/goods-receipt/[id]/route";

const CASE_LABEL: Record<string, string> = { full: "รับครบ", full_defective: "รับครบ (มีเสีย)", partial_wait: "รับบางส่วน รอของ", partial_close: "ปิดยอด (ขาด)" };
const stripCode = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
const imgUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
const isPdf = (key: string) => /\.pdf$/i.test(key);

export function GrDetailModal({ grId, onClose, footer }: { grId: string; onClose: () => void; footer?: ReactNode }) {
  const [d, setD] = useState<GrDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    apiFetch(`/api/purchasing/goods-receipt/${encodeURIComponent(grId)}`).then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error || !j.data) setErr(j.error ?? "ไม่พบใบรับ"); else setD(j.data as GrDetail); })
      .catch((e) => { if (alive) setErr(String((e as Error).message ?? e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [grId]);

  const totalRecv = d?.lines.reduce((a, l) => a + l.qty_received, 0) ?? 0;
  const totalDef = d?.lines.reduce((a, l) => a + l.qty_defective, 0) ?? 0;
  const attachments = d ? [
    ...(d.receipt_doc_r2_key ? [{ key: d.receipt_doc_r2_key, label: "📄 ใบรับของ / ใบส่งของขนส่ง" }] : []),
    ...(d.bill_doc_r2_key ? [{ key: d.bill_doc_r2_key, label: "🧾 บิล / ใบเสร็จ" }] : []),
  ] : [];

  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="gr-detail"
      title={d ? `📦 ใบรับสินค้า ${d.gr_no}` : "รายละเอียดใบรับ"}
      description={d ? `🏪 ${d.seller_name || "—"} · อ้างอิง ${d.po_no || "—"}` : undefined}
      footer={<>
        {d && <a href={`/print/goods-receipt/${d.id}`} target="_blank" rel="noreferrer" className="mr-auto h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🖨 พิมพ์ใบรับ</a>}
        {footer}
        <button onClick={onClose} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ปิด</button>
      </>}>
      {loading ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
      : err || !d ? <div className="py-10 text-center text-sm text-red-500">⚠️ {err ?? "ไม่พบใบรับ"}</div>
      : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm bg-slate-50 rounded-lg px-3 py-2">
            <div><span className="text-slate-400">วันที่รับ </span>{d.receive_date ? formatDate(d.receive_date) : "—"}</div>
            <div><span className="text-slate-400">ผู้รับ </span>{d.receiver || "—"}</div>
            <div><span className="text-slate-400">รายการ </span>{d.lines.length}</div>
            <div><span className="text-slate-400">รับรวม </span><b className="tabular-nums">{totalRecv.toLocaleString()}</b>{totalDef > 0 && <span className="text-red-600"> · เสีย {totalDef.toLocaleString()}</span>}</div>
            <div><span className="text-slate-400">สกุลใบ PO </span>{["RMB", "YUAN", "CNY"].includes(d.currency) ? "¥ หยวน" : "฿ บาท"}</div>
            <div><span className="text-slate-400">ใบสำคัญรับ </span>{d.voucher_id ? <a href={`/purchasing/vouchers/${d.voucher_id}`} target="_blank" rel="noreferrer" className="text-purple-700 hover:underline">🧾 {d.pv_no ?? "ร่าง"}</a> : <span className="text-slate-400">ยังไม่ออก</span>}</div>
            {d.note && <div className="w-full text-xs text-slate-500">📝 {d.note}</div>}
          </div>

          {attachments.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-400">ไฟล์แนบ</span>
              {attachments.map((a) => (
                <a key={a.key} href={imgUrl(a.key)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                  {isPdf(a.key) ? <span>📎</span> : (
                    <HoverPreview url={imgUrl(a.key)} previewW={420}>
                      <span className="inline-block w-6 h-6 rounded overflow-hidden border border-slate-100 bg-slate-50 align-middle">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imgUrl(a.key)} alt="" className="w-full h-full object-cover" /></span>
                    </HoverPreview>
                  )}
                  {a.label} ↗
                </a>
              ))}
            </div>
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="px-2 py-2 w-12"></th>
                  <th className="text-left px-2 py-2 font-medium">สินค้า</th>
                  <th className="text-right px-2 py-2 font-medium">สั่ง</th>
                  <th className="text-right px-2 py-2 font-medium">รับ</th>
                  <th className="text-right px-2 py-2 font-medium">เสีย</th>
                  <th className="text-left px-2 py-2 font-medium">หน่วย</th>
                  <th className="text-left px-2 py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.lines.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-300 text-xs">— ไม่มีรายการ —</td></tr>
                : d.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-2 py-1.5">
                      <HoverPreview url={l.image_url} previewW={320}>
                        <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100">
                          {l.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={l.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
                        </div>
                      </HoverPreview>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="text-slate-800 flex items-center gap-1">{stripCode(l.item_name)}<CopyButton value={stripCode(l.item_name)} title="คัดลอกชื่อ" /></div>
                      {l.code && <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">{l.code}<CopyButton value={l.code} title="คัดลอกรหัส" /></div>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{l.qty_ordered.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-800">{l.qty_received.toLocaleString()}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${l.qty_defective > 0 ? "text-red-600" : "text-slate-300"}`}>{l.qty_defective > 0 ? l.qty_defective.toLocaleString() : "-"}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">{l.uom}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">{CASE_LABEL[l.case_type] ?? l.case_type}{l.note ? <span className="text-slate-400"> · {l.note}</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ERPModal>
  );
}
