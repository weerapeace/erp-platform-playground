"use client";

/**
 * GrDetailModal (ของกลาง) — ป๊อปรายละเอียดใบรับสินค้า GR 1 ใบ + โหมดแก้ไข
 *   ดู: หัวใบ (เลข GR / PO / ร้าน / วันที่รับ / ผู้รับ) · รายการ (รูป รหัส ชื่อ สั่ง/รับ/เสีย หน่วย) · ไฟล์แนบ · ปุ่มพิมพ์
 *   แก้ (สิทธิ์ products.edit): วันที่/ผู้รับ/หมายเหตุ · จำนวนรับ/เสีย · ลบบรรทัด (ตั้ง 0) · เพิ่มรายการที่ลืมลงจาก PO เดียวกัน
 *     → PATCH /api/purchasing/goods-receipt/<id> ปรับ PO/สต๊อก/ใบสำคัญร่าง ให้ตามส่วนต่าง · ใบสำคัญยืนยันแล้ว = แก้ไม่ได้
 * ใช้: <GrDetailModal grId onClose footer? onSaved? />
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { HoverPreview } from "@/components/hover-image";
import { CopyButton } from "@/components/copy-button";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { GrDetail } from "@/app/api/purchasing/goods-receipt/[id]/route";

const CASE_LABEL: Record<string, string> = { full: "รับครบ", full_defective: "รับครบ (มีเสีย)", partial_wait: "รับบางส่วน รอของ", partial_close: "ปิดยอด (ขาด)" };
const stripCode = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
const imgUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
const isPdf = (key: string) => /\.pdf$/i.test(key);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const inp = "h-8 px-2 text-sm border border-slate-200 rounded-md bg-white tabular-nums";

type LineEdit = { recv: string; def: string };
type AddRow = { po_line_id: string; recv: string; def: string };

export function GrDetailModal({ grId, onClose, footer, onSaved }: { grId: string; onClose: () => void; footer?: ReactNode; onSaved?: () => void | Promise<void> }) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [d, setD] = useState<GrDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hdr, setHdr] = useState({ receive_date: "", receiver: "", note: "" });
  const [le, setLe] = useState<Record<string, LineEdit>>({});
  const [adds, setAdds] = useState<AddRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ลบทั้งใบ — คืนใบ PO/สต๊อกให้เหมือนไม่เคยรับ (soft delete เก็บประวัติ)
  const remove = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/purchasing/goods-receipt/${encodeURIComponent(grId)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const warn = (j.stock_warnings ?? []) as string[];
      toast.success(`ลบใบรับแล้ว — คืนใบสั่งซื้อ/สต๊อกให้แล้ว${warn.length ? ` · ⚠ สต๊อก: ${warn.join("; ")}` : ""}`);
      setDelOpen(false);
      await onSaved?.();
      onClose();
    } catch (e) { toast.error("ลบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setDeleting(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/purchasing/goods-receipt/${encodeURIComponent(grId)}`).then((r) => r.json());
      if (j.error || !j.data) setErr(j.error ?? "ไม่พบใบรับ"); else setD(j.data as GrDetail);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); }
  }, [grId]);
  useEffect(() => { void load(); }, [load]);

  const startEdit = () => {
    if (!d) return;
    setHdr({ receive_date: d.receive_date ?? "", receiver: d.receiver ?? "", note: d.note ?? "" });
    const m: Record<string, LineEdit> = {};
    for (const l of d.lines) m[l.id] = { recv: String(l.qty_received), def: String(l.qty_defective) };
    setLe(m); setAdds([]); setAddOpen(false); setEditing(true);
  };
  const setLine = (id: string, patch: Partial<LineEdit>) => setLe((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  // บรรทัด PO ที่ยังไม่อยู่ในใบรับนี้ (ไว้เพิ่มที่ลืมลง)
  const addable = useMemo(() => {
    if (!d) return [];
    const inGr = new Set(d.lines.map((l) => l.po_line_id ?? ""));
    return d.po_lines.filter((p) => !inGr.has(p.id) && !adds.some((a) => a.po_line_id === p.id));
  }, [d, adds]);

  const dirty = useMemo(() => {
    if (!d || !editing) return false;
    if (hdr.receive_date !== (d.receive_date ?? "") || hdr.receiver !== (d.receiver ?? "") || hdr.note !== (d.note ?? "")) return true;
    if (d.lines.some((l) => num(le[l.id]?.recv) !== l.qty_received || num(le[l.id]?.def) !== l.qty_defective)) return true;
    return adds.some((a) => num(a.recv) > 0 || num(a.def) > 0);
  }, [d, editing, hdr, le, adds]);

  const save = async () => {
    if (!d) return;
    setSaving(true);
    try {
      const body = {
        receive_date: hdr.receive_date || null, receiver: hdr.receiver, note: hdr.note || null,
        lines: d.lines.filter((l) => num(le[l.id]?.recv) !== l.qty_received || num(le[l.id]?.def) !== l.qty_defective).map((l) => ({ id: l.id, qty_received: num(le[l.id]?.recv), qty_defective: num(le[l.id]?.def) })),
        add_lines: adds.filter((a) => num(a.recv) > 0 || num(a.def) > 0).map((a) => ({ po_line_id: a.po_line_id, qty_received: num(a.recv), qty_defective: num(a.def) })),
      };
      const res = await apiFetch(`/api/purchasing/goods-receipt/${encodeURIComponent(grId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const warn = (j.stock_warnings ?? []) as string[];
      toast.success(`แก้ใบรับแล้ว (${j.changes} รายการ) — ปรับใบสั่งซื้อ/สต๊อกตามส่วนต่างให้แล้ว${warn.length ? ` · ⚠ สต๊อก: ${warn.join("; ")}` : ""}`);
      setEditing(false);
      await load();
      await onSaved?.();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  const totalRecv = d?.lines.reduce((a, l) => a + l.qty_received, 0) ?? 0;
  const totalDef = d?.lines.reduce((a, l) => a + l.qty_defective, 0) ?? 0;
  const attachments = d ? [
    ...(d.receipt_doc_r2_key ? [{ key: d.receipt_doc_r2_key, label: "📄 ใบรับของ / ใบส่งของขนส่ง" }] : []),
    ...(d.bill_doc_r2_key ? [{ key: d.bill_doc_r2_key, label: "🧾 บิล / ใบเสร็จ" }] : []),
  ] : [];
  const locked = d?.voucher_status === "confirmed";

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="lg" storageKey="gr-detail" hasUnsavedChanges={dirty}
      title={d ? `📦 ใบรับสินค้า ${d.gr_no}${editing ? " — แก้ไข" : ""}` : "รายละเอียดใบรับ"}
      description={d ? `🏪 ${d.seller_name || "—"} · อ้างอิง ${d.po_no || "—"}` : undefined}
      footer={editing ? (<>
        <span className="mr-auto text-[11px] text-slate-400">บันทึกแล้ว ระบบปรับใบสั่งซื้อ / สต๊อก / ใบสำคัญร่าง ตามส่วนต่างให้อัตโนมัติ</span>
        <button onClick={() => setEditing(false)} disabled={saving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void save()} disabled={saving || !dirty} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "✓ บันทึกการแก้ไข"}</button>
      </>) : (<>
        {d && <a href={`/print/goods-receipt/${d.id}`} target="_blank" rel="noreferrer" className="mr-auto h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🖨 พิมพ์ใบรับ</a>}
        {d && canEdit && (
          <button onClick={() => setDelOpen(true)} disabled={locked} title={locked ? `ออกใบสำคัญ ${d.pv_no} และยืนยันแล้ว ลบไม่ได้` : "ลบใบรับทั้งใบ (คืนใบสั่งซื้อ/สต๊อก)"}
            className="h-9 px-3 text-sm border border-red-200 rounded-lg text-red-600 bg-white hover:bg-red-50 disabled:opacity-40">🗑 ลบใบรับ</button>
        )}
        {d && canEdit && (
          <button onClick={startEdit} disabled={locked} title={locked ? `ออกใบสำคัญ ${d.pv_no} และยืนยันแล้ว แก้ไม่ได้` : "แก้จำนวน/วันที่/ผู้รับ หรือเพิ่มรายการที่ลืมลง"}
            className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">✎ แก้ไข</button>
        )}
        {footer}
        <button onClick={onClose} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ปิด</button>
      </>)}>
      {loading ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
      : err || !d ? <div className="py-10 text-center text-sm text-red-500">⚠️ {err ?? "ไม่พบใบรับ"}</div>
      : (
        <div className="space-y-3">
          {editing ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <label className="text-[11px] text-slate-500">วันที่รับ<input type="date" value={hdr.receive_date} onChange={(e) => setHdr((p) => ({ ...p, receive_date: e.target.value }))} className={`${inp} w-full mt-0.5`} /></label>
              <label className="text-[11px] text-slate-500">ผู้รับ<input value={hdr.receiver} onChange={(e) => setHdr((p) => ({ ...p, receiver: e.target.value }))} className={`${inp} w-full mt-0.5`} /></label>
              <label className="text-[11px] text-slate-500 col-span-2">หมายเหตุ<input value={hdr.note} onChange={(e) => setHdr((p) => ({ ...p, note: e.target.value }))} className={`${inp} w-full mt-0.5`} placeholder="เช่น ลงจำนวนผิด แก้จาก 2,000 เป็น 1,800" /></label>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm bg-slate-50 rounded-lg px-3 py-2">
              <div><span className="text-slate-400">วันที่รับ </span>{d.receive_date ? formatDate(d.receive_date) : "—"}</div>
              <div><span className="text-slate-400">ผู้รับ </span>{d.receiver || "—"}</div>
              <div><span className="text-slate-400">รายการ </span>{d.lines.length}</div>
              <div><span className="text-slate-400">รับรวม </span><b className="tabular-nums">{totalRecv.toLocaleString()}</b>{totalDef > 0 && <span className="text-red-600"> · เสีย {totalDef.toLocaleString()}</span>}</div>
              <div><span className="text-slate-400">สกุลใบ PO </span>{["RMB", "YUAN", "CNY"].includes(d.currency) ? "¥ หยวน" : "฿ บาท"}</div>
              <div><span className="text-slate-400">ใบสำคัญรับ </span>{d.voucher_id ? <a href={`/purchasing/vouchers/${d.voucher_id}`} target="_blank" rel="noreferrer" className="text-purple-700 hover:underline">🧾 {d.pv_no ?? "ร่าง"}{locked ? " (ยืนยันแล้ว)" : ""}</a> : <span className="text-slate-400">ยังไม่ออก</span>}</div>
              {d.note && <div className="w-full text-xs text-slate-500">📝 {d.note}</div>}
            </div>
          )}

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
                  <th className="text-left px-2 py-2 font-medium">{editing ? "" : "สถานะ"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.lines.length === 0 && adds.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-300 text-xs">— ไม่มีรายการ —</td></tr>
                : d.lines.map((l) => {
                  const e = le[l.id];
                  const removed = editing && e && num(e.recv) <= 0 && num(e.def) <= 0;
                  const changed = editing && e && (num(e.recv) !== l.qty_received || num(e.def) !== l.qty_defective);
                  return (
                    <tr key={l.id} className={removed ? "bg-red-50/50 opacity-70" : changed ? "bg-amber-50/40" : ""}>
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
                        {changed && !removed && <div className="text-[10px] text-amber-700">เดิม รับ {l.qty_received.toLocaleString()} / เสีย {l.qty_defective.toLocaleString()}</div>}
                        {removed && <div className="text-[10px] text-red-600">จะลบรายการนี้ออกจากใบรับ (ตัดสต๊อกกลับ {l.qty_received.toLocaleString()})</div>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{l.qty_ordered.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right">{editing ? <input type="number" inputMode="decimal" step="any" min={0} value={e?.recv ?? ""} onChange={(ev) => setLine(l.id, { recv: ev.target.value })} onFocus={(ev) => ev.target.select()} className={`${inp} w-24 text-right`} /> : <span className="tabular-nums font-medium text-slate-800">{l.qty_received.toLocaleString()}</span>}</td>
                      <td className="px-2 py-1.5 text-right">{editing ? <input type="number" inputMode="decimal" step="any" min={0} value={e?.def ?? ""} onChange={(ev) => setLine(l.id, { def: ev.target.value })} onFocus={(ev) => ev.target.select()} className={`${inp} w-20 text-right`} /> : <span className={`tabular-nums ${l.qty_defective > 0 ? "text-red-600" : "text-slate-300"}`}>{l.qty_defective > 0 ? l.qty_defective.toLocaleString() : "-"}</span>}</td>
                      <td className="px-2 py-1.5 text-xs text-slate-500">{l.uom}</td>
                      <td className="px-2 py-1.5 text-xs text-slate-500">
                        {editing
                          ? <button onClick={() => setLine(l.id, removed ? { recv: String(l.qty_received), def: String(l.qty_defective) } : { recv: "0", def: "0" })} className={`text-xs ${removed ? "text-blue-600 hover:underline" : "text-slate-400 hover:text-red-600"}`}>{removed ? "↩ คืน" : "🗑 ลบ"}</button>
                          : <>{CASE_LABEL[l.case_type] ?? l.case_type}{l.note ? <span className="text-slate-400"> · {l.note}</span> : ""}</>}
                      </td>
                    </tr>
                  );
                })}
                {editing && adds.map((a) => {
                  const p = d.po_lines.find((x) => x.id === a.po_line_id); if (!p) return null;
                  return (
                    <tr key={`add-${a.po_line_id}`} className="bg-emerald-50/40">
                      <td className="px-2 py-1.5"><div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100">{p.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}</div></td>
                      <td className="px-2 py-1.5"><div className="text-slate-800">{stripCode(p.item_name)}</div><div className="text-[10px] text-emerald-700">＋ เพิ่มรายการที่ลืมลง · รับไปแล้ว {p.qty_received.toLocaleString()} / สั่ง {p.qty.toLocaleString()}</div></td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.qty.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right"><input type="number" inputMode="decimal" step="any" min={0} value={a.recv} onChange={(ev) => setAdds((rows) => rows.map((r) => r.po_line_id === a.po_line_id ? { ...r, recv: ev.target.value } : r))} onFocus={(ev) => ev.target.select()} className={`${inp} w-24 text-right`} /></td>
                      <td className="px-2 py-1.5 text-right"><input type="number" inputMode="decimal" step="any" min={0} value={a.def} onChange={(ev) => setAdds((rows) => rows.map((r) => r.po_line_id === a.po_line_id ? { ...r, def: ev.target.value } : r))} className={`${inp} w-20 text-right`} /></td>
                      <td className="px-2 py-1.5 text-xs text-slate-500">{p.uom}</td>
                      <td className="px-2 py-1.5"><button onClick={() => setAdds((rows) => rows.filter((r) => r.po_line_id !== a.po_line_id))} className="text-xs text-slate-400 hover:text-red-600">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editing && addable.length > 0 && (
              <div className="border-t border-slate-100">
                <button onClick={() => setAddOpen((v) => !v)} className="w-full h-8 text-xs text-blue-600 hover:bg-blue-50">{addOpen ? "▾" : "＋"} เพิ่มรายการที่ลืมลง (จากใบสั่งซื้อเดียวกัน {addable.length} รายการ)</button>
                {addOpen && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50/60">
                    {addable.map((p) => (
                      <button key={p.id} onClick={() => { setAdds((rows) => [...rows, { po_line_id: p.id, recv: String(Math.max(0, p.qty - p.qty_received)), def: "0" }]); setAddOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-blue-50">
                        <span className="font-mono text-slate-400 w-24 truncate shrink-0">{p.code || "—"}</span>
                        <span className="flex-1 min-w-0 truncate text-slate-700">{stripCode(p.item_name)}</span>
                        <span className="text-slate-400 shrink-0">คงเหลือ {Math.max(0, p.qty - p.qty_received).toLocaleString()} {p.uom}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {editing && <p className="text-[11px] text-slate-400">ลดจำนวนรับ = ตัดสต๊อกกลับตามส่วนต่าง · เพิ่มจำนวน = บวกสต๊อกเพิ่ม · ทุกครั้งเก็บประวัติเดิม/ใหม่ไว้ในระบบ</p>}
        </div>
      )}

      {/* ยืนยันลบทั้งใบ — dangerous action ต้องกดยืนยันชัดเจน */}
      {delOpen && d && (
        <ERPModal open onClose={() => !deleting && setDelOpen(false)} size="sm" storageKey="gr-delete"
          title="🗑 ลบใบรับสินค้า" description={`${d.gr_no} · ${d.seller_name || "—"}`}
          footer={<>
            <button onClick={() => setDelOpen(false)} disabled={deleting} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ไม่ลบ</button>
            <button onClick={() => void remove()} disabled={deleting} className="px-5 h-9 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? "กำลังลบ…" : "ยืนยันลบใบรับ"}</button>
          </>}>
          <div className="text-sm text-slate-700">ลบใบรับนี้ทั้งใบ ({d.lines.length} รายการ รับรวม {totalRecv.toLocaleString()})</div>
          <ul className="mt-2 text-xs text-slate-500 list-disc pl-5 space-y-0.5">
            <li>ใบสั่งซื้อ {d.po_no || "—"} จะกลับไป &quot;รอรับของ&quot; ตามจำนวนที่คืน</li>
            <li>สต๊อกที่บวกเข้าไปตอนรับจะถูกตัดกลับ</li>
            {d.voucher_id && !locked && <li>ใบสำคัญร่าง {d.pv_no ?? ""} จะไม่มีรายการของใบนี้แล้ว</li>}
            <li>ใบไม่หายจากประวัติ (เก็บเป็นยกเลิก + บันทึกว่าใครลบ)</li>
          </ul>
        </ERPModal>
      )}
    </ERPModal>
  );
}
