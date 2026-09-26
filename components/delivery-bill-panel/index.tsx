"use client";

/**
 * DeliveryBillPanel (ของกลาง) — แนบ "ใบส่งของจากร้านขนส่ง" กับใบสำคัญรับ แล้วให้ AI อ่าน
 *   อัปโหลดรูป (หรือหยิบไฟล์แนบตอนรับของ GR) → 🔍 อ่านด้วย AI → ได้ รหัสขนส่ง EK-… + รายการ (P/o.No, Description, Pack, Qty, Weight, M3)
 *   → แก้ค่าที่อ่านผิดได้ → จับคู่แต่ละบรรทัดกับสินค้าในใบสำคัญ (เลือกได้หลายตัว) → ✓ ใช้น้ำหนัก/คิวจากใบนี้
 * ใช้: <DeliveryBillPanel voucherId lines readonly onApplied />  (lines = รายการในใบสำคัญ ไว้ให้เลือกจับคู่)
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { FileInput } from "@/components/file-input";
import { HoverPreview } from "@/components/hover-image";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { DeliveryBillLine } from "@/lib/delivery-bill";

export type BillRow = {
  id: string; gr_id: string | null; r2_key: string; tracking_no: string | null; bill_date: string | null; marking: string | null; delivery_area: string | null;
  total_weight_kg: number | null; total_m3: number | null; total_packages: number | null; lines: DeliveryBillLine[]; status: string; applied_at: string | null; created_at: string;
};
type Candidate = { gr_id: string; gr_no: string; kind: "receipt" | "bill"; r2_key: string };
export type VoucherLineLite = { id: string; code: string; item_name: string; qty: number; uom: string | null; gr_no: string | null };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const stripCode = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
const imgUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
const inp = "h-8 px-1.5 text-xs border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500";

export function DeliveryBillPanel({ voucherId, lines, readonly, onApplied }: { voucherId: string; lines: VoucherLineLite[]; readonly: boolean; onApplied: () => void | Promise<void> }) {
  const toast = useToast();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [uploadKey, setUploadKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);   // "parse" | bill id
  const [draft, setDraft] = useState<Record<string, { tracking_no: string; bill_date: string; lines: DeliveryBillLine[] }>>({});
  const [mapFor, setMapFor] = useState<{ billId: string; idx: number } | null>(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills`).then((r) => r.json());
      const rows = (j.data ?? []) as BillRow[];
      setBills(rows); setCands((j.candidates ?? []) as Candidate[]);
      setDraft((p) => { const n = { ...p }; for (const b of rows) if (!n[b.id]) n[b.id] = { tracking_no: b.tracking_no ?? "", bill_date: b.bill_date ?? "", lines: b.lines ?? [] }; return n; });
    } catch { /* เงียบ — แผงนี้เป็นส่วนเสริม */ }
  }, [voucherId]);
  useEffect(() => { void load(); }, [load]);

  const parse = async (r2_key: string, gr_id?: string) => {
    setBusy("parse");
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ r2_key, gr_id: gr_id ?? null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const b = j.data as BillRow;
      toast.success(`อ่านใบส่งของแล้ว: ${b.tracking_no ?? "ไม่พบรหัสขนส่ง"} · ${(b.lines ?? []).length} รายการ — ตรวจตัวเลขแล้วจับคู่สินค้า`);
      setUploadKey(null);
      await load();
    } catch (e) { toast.error("อ่านไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };
  const patchBill = async (billId: string, apply: boolean) => {
    const d = draft[billId]; if (!d) return;
    setBusy(billId);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bill_id: billId, tracking_no: d.tracking_no, bill_date: d.bill_date || null, lines: d.lines, apply }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(apply ? `ใส่น้ำหนัก/คิวจากใบส่งของให้ ${j.applied} รายการแล้ว` : "บันทึกใบส่งของแล้ว");
      await load();
      if (apply) await onApplied();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };
  const removeBill = async (billId: string) => {
    setBusy(billId);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${voucherId}/bills?bill_id=${billId}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) { toast.error("ลบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };
  const setLine = (billId: string, idx: number, patch: Partial<DeliveryBillLine>) =>
    setDraft((p) => { const d = p[billId]; if (!d) return p; const ls = d.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)); return { ...p, [billId]: { ...d, lines: ls } }; });
  const addLine = (billId: string) => setDraft((p) => { const d = p[billId]; if (!d) return p; return { ...p, [billId]: { ...d, lines: [...d.lines, { stock: null, po_no: null, description: null, pack: null, package: null, qty: null, weight_kg: null, m3: null, method: null, voucher_line_ids: [] }] } }; });
  const delLine = (billId: string, idx: number) => setDraft((p) => { const d = p[billId]; if (!d) return p; return { ...p, [billId]: { ...d, lines: d.lines.filter((_, i) => i !== idx) } }; });

  const mapLine = mapFor ? draft[mapFor.billId]?.lines[mapFor.idx] : null;
  const usedElsewhere = (billId: string, idx: number, lineId: string) => (draft[billId]?.lines ?? []).some((l, i) => i !== idx && l.voucher_line_ids.includes(lineId));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-slate-700">{open ? "▾" : "▸"} 📄 ใบส่งของจากขนส่ง (Delivery Bill) {bills.length > 0 && <span className="font-normal text-slate-400">· {bills.length} ใบ</span>}</button>
        <span className="text-[11px] text-slate-400">อัปโหลดรูป → AI อ่านรหัสขนส่ง + น้ำหนัก/คิวรายกล่อง → เลือกคิดจากคิว/กก. ตามกฎ Description → จับคู่สินค้า → ใช้ค่าจริงแทนค่าประเมิน</span>
        <a href="/m/freight-description-rules" target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-blue-600">⚙ กฎ Description</a>
      </div>
      {open && (
        <div className="mt-3 space-y-4">
          {!readonly && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-64"><FileInput label="📷 รูปใบส่งของ (jpg/png)" value={uploadKey} onChange={setUploadKey} folder="delivery-bills" /></div>
              <button onClick={() => uploadKey && void parse(uploadKey)} disabled={!uploadKey || busy === "parse"} className="h-9 px-4 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">{busy === "parse" ? "🔍 กำลังอ่าน…" : "🔍 อ่านด้วย AI"}</button>
              {cands.filter((c) => !bills.some((b) => b.r2_key === c.r2_key)).map((c) => (
                <button key={`${c.gr_id}-${c.kind}`} onClick={() => void parse(c.r2_key, c.gr_id)} disabled={busy === "parse"} title="ไฟล์ที่แนบไว้ตอนรับของ — ให้ AI อ่านได้เลย ไม่ต้องอัปโหลดซ้ำ"
                  className="h-9 px-3 text-xs rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 inline-flex items-center gap-1.5">
                  <HoverPreview url={imgUrl(c.r2_key)} previewW={360}><span className="inline-block w-6 h-6 rounded overflow-hidden bg-white border border-indigo-100 align-middle">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imgUrl(c.r2_key)} alt="" className="w-full h-full object-cover" /></span></HoverPreview>
                  🔍 อ่านจาก{c.kind === "receipt" ? "ใบรับของ" : "บิล"} {c.gr_no}
                </button>
              ))}
            </div>
          )}
          {bills.length === 0 && <div className="text-xs text-slate-300 text-center py-3 border border-dashed border-slate-200 rounded-lg">— ยังไม่มีใบส่งของ —</div>}
          {bills.map((b) => {
            const d = draft[b.id] ?? { tracking_no: b.tracking_no ?? "", bill_date: b.bill_date ?? "", lines: b.lines ?? [] };
            const mapped = d.lines.filter((l) => l.voucher_line_ids.length > 0).length;
            return (
              <div key={b.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 flex-wrap">
                  <HoverPreview url={imgUrl(b.r2_key)} previewW={520}>
                    <a href={imgUrl(b.r2_key)} target="_blank" rel="noreferrer" className="block w-12 h-12 rounded overflow-hidden border border-slate-200 bg-white">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imgUrl(b.r2_key)} alt="" className="w-full h-full object-cover" /></a>
                  </HoverPreview>
                  <label className="text-[11px] text-slate-500">รหัสขนส่ง<br /><input value={d.tracking_no} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, [b.id]: { ...d, tracking_no: e.target.value } }))} className={`${inp} w-32 font-mono`} placeholder="EK-########" /></label>
                  <label className="text-[11px] text-slate-500">วันที่ใบ<br /><input type="date" value={d.bill_date} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, [b.id]: { ...d, bill_date: e.target.value } }))} className={`${inp} w-36`} /></label>
                  <div className="text-[11px] text-slate-500">{b.marking ? `Marking ${b.marking} · ` : ""}{b.delivery_area ? `${b.delivery_area} · ` : ""}รวม {d.lines.length} กล่อง · {num(b.total_weight_kg).toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก. · {num(b.total_m3).toLocaleString("th-TH", { maximumFractionDigits: 4 })} คิว</div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${b.status === "applied" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{b.status === "applied" ? `✓ ใช้แล้ว ${b.applied_at ? formatDate(b.applied_at) : ""}` : "ยังไม่ได้ใช้"}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {!readonly && <button onClick={() => void patchBill(b.id, false)} disabled={busy === b.id} className="h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">💾 บันทึก</button>}
                    {!readonly && <button onClick={() => void patchBill(b.id, true)} disabled={busy === b.id || mapped === 0} title={mapped === 0 ? "จับคู่สินค้าก่อน" : "เขียนน้ำหนัก/คิวต่อชิ้นลงสินค้าที่จับคู่ + รหัสขนส่งลงหัวใบ"} className="h-8 px-3 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">✓ ใช้น้ำหนัก/คิวจากใบนี้ ({mapped}/{d.lines.length})</button>}
                    {!readonly && <button onClick={() => void removeBill(b.id)} disabled={busy === b.id} className="h-8 w-8 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50">✕</button>}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 bg-white border-b border-slate-100">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Stock</th>
                        <th className="text-left px-2 py-1.5 font-medium">P/o.No</th>
                        <th className="text-left px-2 py-1.5 font-medium">Description</th>
                        <th className="text-right px-2 py-1.5 font-medium">Pack</th>
                        <th className="text-left px-2 py-1.5 font-medium">Package</th>
                        <th className="text-right px-2 py-1.5 font-medium">Qty</th>
                        <th className="text-right px-2 py-1.5 font-medium">Weight (กก.)</th>
                        <th className="text-right px-2 py-1.5 font-medium">M3 (คิว)</th>
                        <th className="text-left px-2 py-1.5 font-medium" title="เลือกอัตโนมัติจากกฎ Description (BOX = คิว, CLOTH BLOCK = น้ำหนัก) แก้ได้">คิดค่าส่งจาก</th>
                        <th className="text-left px-2 py-1.5 font-medium">สินค้าที่จับคู่</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {d.lines.map((l, i) => {
                        const names = l.voucher_line_ids.map((id) => lines.find((x) => x.id === id)).filter(Boolean) as VoucherLineLite[];
                        return (
                          <tr key={i} className={l.voucher_line_ids.length === 0 ? "bg-amber-50/30" : ""}>
                            <td className="px-2 py-1"><input value={l.stock ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { stock: e.target.value })} className={`${inp} w-24 font-mono`} /></td>
                            <td className="px-2 py-1"><input value={l.po_no ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { po_no: e.target.value })} className={`${inp} w-28 font-mono`} /></td>
                            <td className="px-2 py-1"><input value={l.description ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { description: e.target.value })} className={`${inp} w-28`} /></td>
                            <td className="px-2 py-1"><input type="number" step="any" value={l.pack ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { pack: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-14 text-right`} /></td>
                            <td className="px-2 py-1"><input value={l.package ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { package: e.target.value })} className={`${inp} w-16`} /></td>
                            <td className="px-2 py-1"><input type="number" step="any" value={l.qty ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { qty: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-16 text-right`} /></td>
                            <td className="px-2 py-1"><input type="number" step="any" value={l.weight_kg ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { weight_kg: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-20 text-right`} /></td>
                            <td className="px-2 py-1"><input type="number" step="any" value={l.m3 ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { m3: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-20 text-right`} /></td>
                            <td className="px-2 py-1">
                              <select value={l.method ?? ""} disabled={readonly} onChange={(e) => setLine(b.id, i, { method: (e.target.value || null) as "cube" | "weight" | null })}
                                className={`${inp} w-28 ${l.method === "cube" ? "bg-sky-50 border-sky-200" : l.method === "weight" ? "bg-violet-50 border-violet-200" : "border-amber-300"}`}>
                                <option value="">ตามใบ</option>
                                <option value="cube">📦 คิว (M3)</option>
                                <option value="weight">⚖️ น้ำหนัก (kg)</option>
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <button disabled={readonly} onClick={() => setMapFor({ billId: b.id, idx: i })} className={`h-8 px-2 rounded-md border text-left max-w-[16rem] truncate ${names.length ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-300 bg-amber-50 text-amber-700"} disabled:opacity-70`} title={names.map((n) => `${n.code || ""} ${stripCode(n.item_name)}`).join("\n") || "ยังไม่ได้จับคู่"}>
                                {names.length === 0 ? "＋ เลือกสินค้าในกล่องนี้" : `${names.length} ตัว: ${names.map((n) => n.code || stripCode(n.item_name)).join(", ")}`}
                              </button>
                            </td>
                            <td className="px-1 py-1 text-center">{!readonly && <button onClick={() => delLine(b.id, i)} className="text-slate-300 hover:text-red-600">✕</button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!readonly && <button onClick={() => addLine(b.id)} className="w-full h-7 text-[11px] text-blue-600 hover:bg-blue-50 border-t border-slate-100">+ เพิ่มแถว (AI อ่านตกหล่น)</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ป๊อปจับคู่: บรรทัดในใบส่งของ ↔ สินค้าในใบสำคัญ (เลือกได้หลายตัว) */}
      {mapFor && mapLine && (
        <ERPModal open onClose={() => setMapFor(null)} size="md" storageKey="pv-bill-map"
          title="จับคู่สินค้ากับกล่องนี้" description={`${mapLine.description ?? "—"} · P/o.No ${mapLine.po_no ?? "—"} · Qty ${mapLine.qty ?? "—"} · ${mapLine.weight_kg ?? "—"} กก. · ${mapLine.m3 ?? "—"} คิว`}
          footer={<>
            <button onClick={() => setLine(mapFor.billId, mapFor.idx, { voucher_line_ids: lines.map((l) => l.id) })} className="mr-auto h-9 px-3 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">เลือกทั้งหมด</button>
            <button onClick={() => setMapFor(null)} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">เสร็จ</button>
          </>}>
          <p className="text-[11px] text-slate-400 mb-2">น้ำหนัก/คิวของกล่องจะถูกหารด้วยจำนวนชิ้นรวมของสินค้าที่เลือก (ถือว่าทุกชิ้นในกล่องหนัก/ใหญ่เท่ากัน)</p>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
            {lines.map((vl) => {
              const on = mapLine.voucher_line_ids.includes(vl.id);
              const elsewhere = usedElsewhere(mapFor.billId, mapFor.idx, vl.id);
              return (
                <label key={vl.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${on ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={on} onChange={(e) => setLine(mapFor.billId, mapFor.idx, { voucher_line_ids: e.target.checked ? [...mapLine.voucher_line_ids, vl.id] : mapLine.voucher_line_ids.filter((x) => x !== vl.id) })} className="rounded border-slate-300" />
                  <span className="font-mono text-xs text-slate-500 w-24 shrink-0 truncate">{vl.code || "—"}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-800" title={vl.item_name}>{stripCode(vl.item_name)}</span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">{vl.qty.toLocaleString()} {vl.uom ?? ""}</span>
                  {elsewhere && <span className="text-[10px] text-indigo-500 shrink-0" title="สินค้านี้อยู่ในกล่องอื่นด้วย (น้ำหนัก/คิวจะรวมกัน)">อยู่กล่องอื่นด้วย</span>}
                </label>
              );
            })}
          </div>
        </ERPModal>
      )}
    </div>
  );
}
