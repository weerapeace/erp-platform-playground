"use client";

/**
 * ของกลาง — "ขอเพิ่ม/แก้สูตร (BOM)" จากหน้างาน โดยยังไม่แตะสูตรจริงจนกว่าจะอนุมัติ
 *
 *   <BomChangeRequestButton productSku="CTL110-02" productName="…" moNo="MO-2026-00091" />
 *
 * ตัวแก้: ดึงสูตรปัจจุบันมาให้ (ระบบ BOM ตัวจริง) → เพิ่ม/แก้/ลบบรรทัดง่าย ๆ → ส่งเป็น "คำขอ"
 * ตัวอนุมัติ: เทียบของเดิม↔ที่เสนอ → กดอนุมัติ = ยิง PATCH /api/bom/[id] (ตัวบันทึกสูตรเดิม) แล้วปิดคำขอ
 *   ⚠️ ไม่มีตัวเขียน BOM ซ้ำในไฟล์นี้ · PATCH เขียนทับ header ด้วย จึงต้องดึง header เดิมมาส่งคืนครบ
 * ของกลางที่ใช้: ERPModal · useToast · apiFetch · usePermission · ComponentPicker
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { ComponentPicker, type BomComponent } from "@/components/material-picker";
import type { BomChangeRequest, BomReqLine } from "@/app/api/bom/change-requests/route";

type Ver = { id: string; bom_code: string; version: string | null; status: string | null; is_default: boolean };
type EditRow = BomReqLine & { key: string; _base?: BomReqLine | null; _deleted?: boolean };

const n2 = (v: unknown) => Math.round((Number(v) || 0) * 10000) / 10000;
const fmt = (n: number) => n2(n).toLocaleString("th-TH");
const inCls = "w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
const thDT = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const sameLine = (a: BomReqLine, b: BomReqLine) =>
  a.component_sku === b.component_sku && n2(a.qty) === n2(b.qty) && (a.uom ?? "") === (b.uom ?? "");

/** ตัวแก้สูตร (ฉบับง่าย) — ดึงสูตรปัจจุบันมาให้แก้ แล้วส่งเป็นคำขอ */
export function BomChangeRequestEditor({ open, onClose, productSku, productName, moNo, onSent }: {
  open: boolean; onClose: () => void;
  productSku: string; productName?: string | null; moNo?: string | null;
  onSent?: () => void;
}) {
  const toast = useToast();
  const [vers, setVers] = useState<Ver[]>([]);
  const [ver, setVer] = useState<Ver | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [base, setBase] = useState<BomReqLine[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1) หาเวอร์ชันสูตรของสินค้านี้
  useEffect(() => {
    if (!open || !productSku) return;
    setLoading(true); setRows([]); setBase([]); setNote("");
    apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(productSku)}`).then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? []) as Ver[];
        setVers(list);
        setVer(list.find((x) => x.is_default) ?? list[0] ?? null);
        if (list.length === 0) setLoading(false);
      })
      .catch(() => { setVers([]); setVer(null); setLoading(false); });
  }, [open, productSku]);

  // 2) โหลดบรรทัดของเวอร์ชันที่เลือก
  useEffect(() => {
    if (!open || !ver) return;
    setLoading(true);
    apiFetch(`/api/bom/${encodeURIComponent(ver.id)}`).then((r) => r.json())
      .then((j) => {
        const lines = ((j?.data?.lines ?? []) as Record<string, unknown>[]).map((l) => ({
          id: l.id ? String(l.id) : null,           // ⚠️ ต้องเก็บไว้ — ตอนอนุมัติใช้จับคู่บรรทัดเดิม (กันข้อมูลบล็อกตัดหาย)
          component_sku: (l.component_sku as string) ?? null,
          component_name: (l.component_name as string) ?? null,
          qty: n2(l.qty), uom: (l.uom as string) ?? null,
          waste_percent: l.waste_percent != null ? Number(l.waste_percent) : null,
          note: (l.cut_block_code as string) ?? null,   // โชว์บล็อกตัดให้รู้ว่าบรรทัดไหนคือบล็อกไหน
        })) as BomReqLine[];
        setBase(lines);
        setRows(lines.map((l, i) => ({ ...l, key: `b${l.id ?? i}`, _base: l })));
      })
      .catch(() => toast.error("โหลดสูตรไม่สำเร็จ"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ver]);

  const upd = (key: string, p: Partial<EditRow>) => setRows((s) => s.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const addRow = () => setRows((s) => [...s, { key: `n${Date.now()}${s.length}`, component_sku: null, component_name: null, qty: 1, uom: null, waste_percent: null, _base: null }]);
  const pick = (key: string, c: BomComponent) => upd(key, { component_sku: c.code, component_name: c.name, uom: c.uom_name ?? null });

  const live = rows.filter((r) => !r._deleted);
  const added = live.filter((r) => !r._base).length;
  const edited = live.filter((r) => r._base && !sameLine(r, r._base)).length;
  const removed = rows.filter((r) => r._deleted && r._base).length;
  const changed = added + edited + removed;

  const submit = async () => {
    const lines: BomReqLine[] = live
      .filter((r) => r.component_sku)
      .map((r) => ({ id: r.id ?? null, component_sku: r.component_sku, component_name: r.component_name, qty: n2(r.qty), uom: r.uom ?? null, waste_percent: r.waste_percent ?? null, note: r.note ?? null }));
    if (lines.length === 0 && !note.trim()) { toast.error("ยังไม่มีวัตถุดิบในสูตร (หรือเขียนหมายเหตุบอกก็ได้)"); return; }
    if (changed === 0 && !note.trim()) { toast.error("ยังไม่ได้แก้อะไรเลย"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/bom/change-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_id: ver?.id ?? null, bom_code: ver?.bom_code ?? null, bom_version: ver?.version ?? null,
          product_sku: productSku, product_name: productName ?? null, mo_no: moNo ?? null,
          base_lines: base, lines, note: note.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "ส่งคำขอไม่สำเร็จ");
      toast.success("ส่งคำขอแก้สูตรแล้ว — รออนุมัติ (สูตรจริงยังไม่เปลี่ยน)");
      onSent?.(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งคำขอไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="xl" storageKey="bom-change-request"
      title={`📐 ขอเพิ่ม/แก้สูตร · ${productSku}`}
      footer={<>
        <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void submit()} disabled={saving || loading}
          className="h-9 px-5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "กำลังส่ง…" : `ส่งคำขอ${changed > 0 ? ` (${changed} จุด)` : ""}`}
        </button>
      </>}>
      <div className="space-y-2">
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          แก้ตรงนี้ <b>ยังไม่กระทบสูตรจริง</b> — ส่งเป็นคำขอให้คนดูแลสูตรตรวจก่อน อนุมัติแล้วถึงจะเขียนลง BOM
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-slate-600">สูตรที่แก้:</span>
          {vers.length === 0 ? (
            <span className="text-[12px] text-rose-600">สินค้านี้ยังไม่มีสูตร — เพิ่มวัตถุดิบด้านล่างแล้วส่งคำขอได้เลย</span>
          ) : (
            <select value={ver?.id ?? ""} onChange={(e) => setVer(vers.find((x) => x.id === e.target.value) ?? null)}
              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              {vers.map((x) => <option key={x.id} value={x.id}>{x.bom_code} · {x.version ?? "—"}{x.is_default ? " (หลัก)" : ""}</option>)}
            </select>
          )}
          <div className="flex-1" />
          {changed > 0 && (
            <span className="text-[11px] text-slate-500">
              {added > 0 && <span className="text-emerald-600">เพิ่ม {added}</span>}
              {edited > 0 && <span className="text-amber-600 ml-2">แก้ {edited}</span>}
              {removed > 0 && <span className="text-rose-600 ml-2">ลบ {removed}</span>}
            </span>
          )}
        </div>

        {loading ? <div className="py-8 text-center text-slate-400 text-sm">กำลังโหลดสูตร…</div> : (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium min-w-[240px]">วัตถุดิบ</th>
                  <th className="px-2 py-1.5 font-medium w-24 text-right">จำนวน/ชิ้น</th>
                  <th className="px-2 py-1.5 font-medium w-24">หน่วย</th>
                  <th className="px-2 py-1.5 font-medium w-20 text-right">เผื่อเสีย %</th>
                  <th className="px-2 py-1.5 font-medium w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const isNew = !r._base, isEdit = r._base && !r._deleted && !sameLine(r, r._base);
                  return (
                    <tr key={r.key} className={r._deleted ? "opacity-40 line-through bg-rose-50/40" : isNew ? "bg-emerald-50/40" : isEdit ? "bg-amber-50/40" : ""}>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {isNew && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">ใหม่</span>}
                          {isEdit && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">แก้</span>}
                          <div className="min-w-0 flex-1">
                            <ComponentPicker sku={r.component_sku ?? ""} name={r.component_name ?? ""} onPick={(c) => pick(r.key, c)} />
                            {r.note && <div className="text-[10px] text-slate-400 mt-0.5">บล็อก {r.note}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" min={0} value={r.qty} disabled={r._deleted}
                          onChange={(e) => upd(r.key, { qty: Number(e.target.value) })} className={`${inCls} text-right`} />
                      </td>
                      <td className="px-1 py-1">
                        <input value={r.uom ?? ""} disabled={r._deleted} onChange={(e) => upd(r.key, { uom: e.target.value })} className={inCls} />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="any" min={0} value={r.waste_percent ?? ""} disabled={r._deleted}
                          onChange={(e) => upd(r.key, { waste_percent: e.target.value === "" ? null : Number(e.target.value) })}
                          className={`${inCls} text-right`} />
                      </td>
                      <td className="px-1 py-1 text-center">
                        {r._deleted
                          ? <button onClick={() => upd(r.key, { _deleted: false })} className="text-[11px] text-slate-500 hover:text-emerald-600">คืน</button>
                          : <button onClick={() => (r._base ? upd(r.key, { _deleted: true }) : setRows((s) => s.filter((x) => x.key !== r.key)))}
                              className="text-slate-300 hover:text-rose-500">✕</button>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={5} className="px-2 py-6 text-center text-[12px] text-slate-400">ยังไม่มีวัตถุดิบในสูตรนี้</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={addRow} className="h-8 px-3 text-[12px] border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50">＋ เพิ่มวัตถุดิบ</button>

        <label className="block">
          <span className="text-[12px] text-slate-600">เหตุผล / หมายเหตุ</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="เช่น สูตรเดิมกุ้นไม่พอ ใช้จริง 350 หลา · เจอตอนทำ MO-2026-00091"
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </label>
      </div>
    </ERPModal>
  );
}

/** คิวอนุมัติคำขอแก้สูตร */
export function BomChangeRequestQueue({ open, onClose, onChanged }: {
  open: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const canReview = usePermission("products.edit");
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [rows, setRows] = useState<BomChangeRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<BomChangeRequest | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    apiFetch(`/api/bom/change-requests?status=${tab}`).then((r) => r.json())
      .then((j) => setRows((j.data ?? []) as BomChangeRequest[])).catch(() => setRows([]));
  }, [tab]);
  useEffect(() => { if (open) load(); }, [open, load]);

  /** อนุมัติ = เขียนลงสูตรจริงผ่าน PATCH /api/bom/[id] (ตัวเดิม) แล้วปิดคำขอ */
  const approve = async (r: BomChangeRequest) => {
    if (!r.bom_id) { toast.error("คำขอนี้ยังไม่ผูกกับสูตร — ต้องไปสร้างสูตรใหม่ที่หน้า BOM ก่อน"); return; }
    setBusy(r.id);
    try {
      // ⚠️ PATCH เขียนทับ header ด้วย → ต้องดึงของเดิมมาส่งคืนให้ครบ ไม่งั้นค่าหัวสูตรจะหาย
      const cur = await apiFetch(`/api/bom/${encodeURIComponent(r.bom_id)}`).then((x) => x.json());
      const h = cur?.data ?? null;   // GET คืน header กระจายอยู่ชั้นบน + lines/sizes
      if (!h) throw new Error("ไม่พบสูตรที่จะแก้ (อาจถูกลบไปแล้ว)");

      /**
       * ⚠️ PATCH แทนที่ lines ทั้งชุด — ถ้าส่งแค่ 5 ฟิลด์ที่คำขอเก็บไว้ ข้อมูลอื่นของบรรทัด
       *    (บล็อกตัด cut_block_id / calc_mode / slot_code / is_optional …) จะหายทันที
       *    จึงต้อง "รวมค่าใหม่เข้าบรรทัดเดิม" โดยจับคู่ด้วย bom_lines.id
       */
      const curLines = (h.lines ?? []) as Record<string, unknown>[];
      const byId = new Map(curLines.filter((l) => l.id).map((l) => [String(l.id), l]));
      const merged = r.lines.map((l, i) => {
        const orig = l.id ? byId.get(String(l.id)) : undefined;
        return orig
          ? { ...orig, qty: l.qty, uom: l.uom, waste_percent: l.waste_percent ?? null, sequence: i }
          : { component_sku: l.component_sku, component_name: l.component_name, qty: l.qty, uom: l.uom, waste_percent: l.waste_percent ?? null, is_optional: false, sequence: i };
      });

      const res = await apiFetch(`/api/bom/${encodeURIComponent(r.bom_id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_code: h.bom_code, product_sku: h.product_sku, product_name: h.product_name,
          version: h.version, bom_type: h.bom_type, status: h.status,
          effective_from: h.effective_from, note: h.note,
          lines: merged,
        }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกสูตรไม่สำเร็จ");

      const done = await apiFetch("/api/bom/change-requests", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action: "approve", applied_bom_id: r.bom_id, applied_bom_code: h.bom_code }),
      }).then((x) => x.json());
      if (done?.error) throw new Error(done.error);

      toast.success(`อนุมัติแล้ว — สูตร ${h.bom_code} อัปเดตเรียบร้อย`);
      load(); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "อนุมัติไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  const reject = async (r: BomChangeRequest) => {
    try {
      const res = await apiFetch("/api/bom/change-requests", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action: "reject", reason }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success("ไม่อนุมัติแล้ว"); load(); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  const STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: "รออนุมัติ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "ไม่อนุมัติ", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };

  // เทียบด้วย bom_lines.id (สูตรมีหลายบรรทัดของวัตถุดิบเดียวกันได้ = คนละบล็อกตัด) · บรรทัดใหม่ไม่มี id
  const diff = (r: BomChangeRequest) => {
    const b = r.base_lines ?? [], l = r.lines ?? [];
    const key = (x: BomReqLine, i: number) => x.id ?? `~${x.component_sku ?? ""}#${i}`;
    const bm = new Map(b.map((x, i) => [key(x, i), x]));
    const seen = new Set<string>();
    const out: { kind: "add" | "edit" | "del"; line: BomReqLine; from?: BomReqLine }[] = [];
    l.forEach((line, i) => {
      const k = key(line, i);
      const prev = line.id ? bm.get(k) : undefined;
      if (prev) { seen.add(k); if (!sameLine(line, prev)) out.push({ kind: "edit", line, from: prev }); }
      else out.push({ kind: "add", line });
    });
    for (const [k, line] of bm) if (!seen.has(k)) out.push({ kind: "del", line });
    return out;
  };

  return (
    <>
      <ERPModal open={open} onClose={onClose} size="xl" storageKey="bom-change-queue" title="📐 คำขอแก้สูตร (BOM)"
        footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>}>
        <div className="space-y-2">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setTab("pending")} className={`h-8 px-3 text-[12px] ${tab === "pending" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>รออนุมัติ</button>
            <button onClick={() => setTab("all")} className={`h-8 px-3 text-[12px] border-l border-slate-200 ${tab === "all" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ทั้งหมด</button>
          </div>

          {rows === null ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            : rows.length === 0 ? <div className="py-10 text-center text-slate-300 text-sm">{tab === "pending" ? "ไม่มีคำขอค้าง 🎉" : "ยังไม่มีคำขอ"}</div>
            : (
              <div className="space-y-1.5">
                {rows.map((r) => {
                  const st = STATUS[r.status] ?? STATUS.pending;
                  const d = diff(r);
                  return (
                    <div key={r.id} className="border border-slate-200 rounded-lg p-2.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-slate-800">{r.product_sku}</span>
                            <span className="text-[11px] text-slate-400">{r.product_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                            {r.bom_code && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{r.bom_code} · {r.bom_version ?? "—"}</span>}
                            {r.mo_no && <span className="text-[10px] font-mono text-slate-400">{r.mo_no}</span>}
                          </div>

                          <div className="mt-1 space-y-0.5">
                            {d.length === 0 ? <div className="text-[11px] text-slate-400">ไม่มีการเปลี่ยนรายการ (มีแต่หมายเหตุ)</div>
                              : d.slice(0, 12).map((x, i) => (
                                <div key={i} className="text-[11px] flex items-center gap-1.5">
                                  <span className={`px-1 py-0.5 rounded text-[9px] ${x.kind === "add" ? "bg-emerald-100 text-emerald-700" : x.kind === "del" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                                    {x.kind === "add" ? "เพิ่ม" : x.kind === "del" ? "ลบ" : "แก้"}
                                  </span>
                                  <span className="text-slate-700 truncate">{x.line.component_name ?? x.line.component_sku}</span>
                                  <span className="text-slate-500 tabular-nums">
                                    {x.kind === "edit" && x.from ? <>{fmt(x.from.qty)} → <b>{fmt(x.line.qty)}</b></> : fmt(x.line.qty)} {x.line.uom}
                                  </span>
                                </div>
                              ))}
                            {d.length > 12 && <div className="text-[10px] text-slate-400">…อีก {d.length - 12} รายการ</div>}
                          </div>

                          {r.note && <div className="text-[11px] text-slate-600 mt-1">📝 {r.note}</div>}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            ขอโดย {r.requested_by_name ?? "—"} · {thDT(r.created_at)}
                            {r.status === "rejected" && r.reject_reason && <span> · {r.reject_reason}</span>}
                            {r.status === "approved" && r.applied_bom_code && <span className="text-emerald-600"> → เขียนลง {r.applied_bom_code} แล้ว</span>}
                          </div>
                        </div>

                        {r.status === "pending" && canReview && (
                          <div className="shrink-0 flex flex-col gap-1">
                            <button onClick={() => void approve(r)} disabled={busy === r.id}
                              className="h-7 px-2.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">
                              {busy === r.id ? "กำลังบันทึก…" : "✓ อนุมัติ → เขียนลงสูตร"}
                            </button>
                            <button onClick={() => { setRejecting(r); setReason(""); }}
                              className="h-7 px-2.5 text-[11px] border border-slate-200 text-slate-500 rounded hover:bg-slate-50">ไม่อนุมัติ</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          {!canReview && <p className="text-[11px] text-slate-400">คุณดูได้อย่างเดียว — การอนุมัติต้องมีสิทธิ์แก้ข้อมูลสินค้า</p>}
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            ⚠️ อนุมัติแล้ว<b>เขียนทับสูตรเวอร์ชันนั้นทันที</b> · ใบสั่งผลิตที่กางสูตรไปแล้วไม่เปลี่ยนตาม — ต้องกด “🔄 อัพเดตวัตถุดิบตาม BOM” ในใบนั้นเอง
          </p>
        </div>
      </ERPModal>

      <ERPModal open={!!rejecting} onClose={() => setRejecting(null)} size="sm" title="ไม่อนุมัติคำขอแก้สูตร"
        footer={<>
          <button onClick={() => setRejecting(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={() => { const r = rejecting; setRejecting(null); if (r) void reject(r); }}
            className="h-9 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg">ไม่อนุมัติ</button>
        </>}>
        <label className="block">
          <span className="text-[12px] text-slate-600">เหตุผล (บอกผู้ขอด้วย)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
            placeholder="เช่น ต้องแก้ที่บล็อกตัดแทน" className={`${inCls} mt-0.5`} />
        </label>
      </ERPModal>
    </>
  );
}

/** ปุ่มคู่: ขอแก้สูตร + คิวคำขอ — เสียบในป๊อปเช็กลิสต์/หน้าไหนก็ได้ที่รู้รหัสสินค้า */
export function BomChangeRequestButton({ productSku, productName, moNo }: {
  productSku: string | null | undefined; productName?: string | null; moNo?: string | null;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => {
    apiFetch("/api/bom/change-requests?status=pending").then((r) => r.json())
      .then((j) => setPending(Number(j?.pending ?? 0))).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  if (!productSku) return null;
  return (
    <>
      <button onClick={() => setEditOpen(true)} title="เสนอแก้สูตรการผลิต — ยังไม่กระทบสูตรจริงจนกว่าจะอนุมัติ"
        className="h-8 px-2.5 text-[12px] rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 whitespace-nowrap">
        📐 ขอแก้สูตร
      </button>
      <button onClick={() => setQueueOpen(true)} title="คำขอแก้สูตรที่รออนุมัติ"
        className="h-8 px-2 text-[12px] rounded-lg border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 whitespace-nowrap">
        📋{pending > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700">{pending}</span>}
      </button>

      <BomChangeRequestEditor open={editOpen} onClose={() => setEditOpen(false)}
        productSku={productSku} productName={productName} moNo={moNo} onSent={refresh} />
      <BomChangeRequestQueue open={queueOpen} onClose={() => setQueueOpen(false)} onChanged={refresh} />
    </>
  );
}
