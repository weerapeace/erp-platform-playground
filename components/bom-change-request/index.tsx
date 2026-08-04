"use client";

/**
 * ของกลาง — "ขอเพิ่ม/แก้สูตร (BOM)" จากหน้างาน โดยยังไม่แตะสูตรจริงจนกว่าจะอนุมัติ
 *
 *   <BomChangeRequestButton productSku="CTL110-02" productName="…" moNo="MO-2026-00091" />
 *
 * ตัวแก้: ดึงสูตรปัจจุบันมา แล้วใช้ ⭐ `<BomLineEditor>` — **ตัวแก้สูตรตัวเดียวกับหน้า /master/bom**
 *   (บล็อกตัด · โหมดคำนวณ · ไซส์ · สลับมุมมองย่อ/เต็ม ครบ) → ส่งเป็น "คำขอ" แทนการเซฟจริง
 * ตัวอนุมัติ: เทียบของเดิม↔ที่เสนอ → กดอนุมัติ = ยิง PATCH /api/bom/[id] (ตัวบันทึกสูตรเดิม) แล้วปิดคำขอ
 *   ⚠️ ไม่มีตัวเขียน BOM ซ้ำในไฟล์นี้ · PATCH เขียนทับ header ด้วย จึงต้องดึง header เดิมมาส่งคืนครบ
 *   ⚠️ คำขอเก็บบรรทัด "ทั้งก้อน" (รูปเดียวกับที่หน้า BOM ส่งตอนเซฟ) → อนุมัติแล้วส่งต่อตรง ๆ ข้อมูลไม่หาย
 * ของกลางที่ใช้: ERPModal · useToast · apiFetch · usePermission · BomLineEditor
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { BomLineEditor, type EditorLine } from "@/app/master/bom/line-editor";
import { ComponentPicker } from "@/components/material-picker";
import type { BomChangeRequest, BomReqLine } from "@/app/api/bom/change-requests/route";

type Ver = { id: string; bom_code: string; version: string | null; status: string | null; is_default: boolean };

/** bom_lines (จาก API) → EditorLine — ชุดเดียวกับที่หน้า /master/bom ใช้ */
const toEditorLine = (l: Record<string, unknown>): EditorLine => ({
  key: String(l.id ?? Math.random()), component_id: (l.sku_id as string) ?? null, slot_code: (l.slot_code as string) ?? null,
  image_key: (l.image_key as string) ?? null,
  component_sku: (l.component_sku as string) ?? "", component_name: (l.component_name as string) ?? "",
  material_group_id: null, material_type: (l.material_type as string) ?? "",
  qty: Number(l.qty) || 0, uom: (l.uom as string) ?? "", uom_id: (l.uom_id as string) ?? null,
  waste_percent: Number(l.waste_percent) || 0, is_optional: !!l.is_optional,
  cut_block_id: (l.cut_block_id as number) ?? null, cut_block_code: (l.cut_block_code as string) ?? "",
  pieces: Number(l.pieces) || 1, cut_width: Number(l.cut_width) || 0, cut_length: Number(l.cut_length) || 0,
  face_width_cm: Number(l.face_width_cm) || 0,
  source: (l.source as string) ?? undefined, odoo_bom_line_id: (l.odoo_bom_line_id as number) ?? undefined,
  free_text: !!l.free_text,
  size_variant: !!l.size_variant, size_dim: (l.size_dim as EditorLine["size_dim"]) ?? "cut_length",
  size_values: (l.size_values ?? {}) as Record<string, number>,
});

/** EditorLine → รูปที่ PATCH /api/bom/[id] รับ (ชุดเดียวกับที่หน้า /master/bom ส่งตอนเซฟ)
 *  → เก็บ "ทั้งก้อน" ไว้ในคำขอ ตอนอนุมัติจึงส่งต่อได้ตรง ๆ ไม่ต้อง merge อะไรอีก */
const toSaveLine = (l: EditorLine, i: number) => ({
  slot_code: l.slot_code, component_sku: l.component_sku || null, component_name: l.component_name || null,
  qty: l.qty, uom: l.uom || null, waste_percent: l.waste_percent, is_optional: l.is_optional,
  sequence: i + 1, source: l.source ?? "manual", odoo_bom_line_id: l.odoo_bom_line_id ?? null,
  calc_mode: l.cut_block_id ? "block" : "manual", cut_block_id: l.cut_block_id, cut_block_code: l.cut_block_code || null,
  pieces: l.pieces, cut_width: l.cut_width, cut_length: l.cut_length,
  face_width_cm: l.face_width_cm, material_type: l.material_type || null,
  size_variant: l.size_variant, size_dim: l.size_dim, size_values: l.size_values,
  // บรรทัดพิมพ์ชื่อเอง (ยังไม่รู้รหัส) — lineToRow ของ /api/bom/[id] คัดเฉพาะคอลัมน์จริง คีย์นี้จึงไม่ไปโผล่ในสูตร
  free_text: !!l.free_text,
});

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
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [baseSnap, setBaseSnap] = useState<string>("[]");   // สำเนา lines ตอนโหลด (ไว้เทียบว่าแก้อะไร)
  const [sizes, setSizes] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1) หาเวอร์ชันสูตรของสินค้านี้
  useEffect(() => {
    if (!open || !productSku) return;
    setLoading(true); setLines([]); setBaseSnap("[]"); setNote("");
    apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(productSku)}`).then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? []) as Ver[];
        setVers(list);
        setVer(list.find((x) => x.is_default) ?? list[0] ?? null);
        if (list.length === 0) setLoading(false);
      })
      .catch(() => { setVers([]); setVer(null); setLoading(false); });
  }, [open, productSku]);

  // 2) โหลดสูตรของเวอร์ชันที่เลือก → แปลงเป็น EditorLine (ตัวเดียวกับหน้า /master/bom ใช้)
  useEffect(() => {
    if (!open || !ver) return;
    setLoading(true);
    apiFetch(`/api/bom/${encodeURIComponent(ver.id)}`).then((r) => r.json())
      .then((j) => {
        const raw = (j?.data?.lines ?? []) as Record<string, unknown>[];
        const eds = raw.map(toEditorLine);
        setLines(eds);
        setBaseSnap(JSON.stringify(eds.map(toSaveLine)));
        setSizes(((j?.data?.sizes ?? []) as { label?: unknown }[]).map((s) => String(s.label ?? "")).filter(Boolean));
      })
      .catch(() => toast.error("โหลดสูตรไม่สำเร็จ"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ver]);

  const proposed = lines.map(toSaveLine);
  const dirty = JSON.stringify(proposed) !== baseSnap;
  const freeCount = lines.filter((l) => l.free_text && l.component_name.trim()).length;

  const submit = async () => {
    // เก็บทั้งบรรทัดที่เลือกของจริง และบรรทัด "พิมพ์ชื่อเอง" ที่พิมพ์ชื่อไว้แล้ว (ทิ้งเฉพาะแถวว่างเปล่า)
    const clean = lines.filter((l) => l.component_sku || (l.free_text && l.component_name.trim())).map(toSaveLine);
    if (clean.length === 0 && !note.trim()) { toast.error("ยังไม่มีวัตถุดิบในสูตร (หรือเขียนหมายเหตุบอกก็ได้)"); return; }
    if (!dirty && !note.trim()) { toast.error("ยังไม่ได้แก้อะไรเลย"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/bom/change-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_id: ver?.id ?? null, bom_code: ver?.bom_code ?? null, bom_version: ver?.version ?? null,
          product_sku: productSku, product_name: productName ?? null, mo_no: moNo ?? null,
          base_lines: JSON.parse(baseSnap), lines: clean, note: note.trim() || null,
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
          {saving ? "กำลังส่ง…" : "ส่งคำขอ"}
        </button>
      </>}>
      <div className="space-y-2">
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          นี่คือ<b>ตัวแก้สูตรตัวเดียวกับหน้า BOM</b> (มีบล็อกตัด/คำนวณครบ · สลับ ย่อ/เต็ม ได้) —
          แต่แก้ตรงนี้ <b>ยังไม่กระทบสูตรจริง</b> ส่งเป็นคำขอให้อนุมัติก่อน
          <br />ไม่รู้รหัสวัตถุดิบ? กด <b>“✏️ พิมพ์ชื่อเอง”</b> พิมพ์เท่าที่รู้ เช่น “ผ้าแคนวาสรีไซเคิล” แล้วส่งได้เลย — คนอนุมัติจะเป็นคนใส่ของจริงให้
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-slate-600">สูตรที่แก้:</span>
          {vers.length === 0 ? (
            <span className="text-[12px] text-rose-600">สินค้านี้ยังไม่มีสูตร — เพิ่มวัตถุดิบด้านล่าง (หรือพิมพ์ชื่อเอง) แล้วส่งคำขอได้เลย</span>
          ) : (
            <select value={ver?.id ?? ""} onChange={(e) => setVer(vers.find((x) => x.id === e.target.value) ?? null)}
              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              {vers.map((x) => <option key={x.id} value={x.id}>{x.bom_code} · {x.version ?? "—"}{x.is_default ? " (หลัก)" : ""}</option>)}
            </select>
          )}
          <div className="flex-1" />
          {dirty && <span className="text-[11px] text-amber-600 font-medium">มีการแก้ไข (ยังไม่ส่ง)</span>}
        </div>

        {loading ? <div className="py-8 text-center text-slate-400 text-sm">กำลังโหลดสูตร…</div> : (
          <BomLineEditor lines={lines} onChange={setLines} sizes={sizes} allowFreeText />
        )}

        {/* ปุ่มเพิ่มรายการอยู่ในแถบล่างของตารางแล้ว (＋ เพิ่มวัตถุดิบ · เพิ่มจากที่มีใน BOM · ✏️ พิมพ์ชื่อเอง) — ไม่ทำซ้ำที่นี่ */}
        {freeCount > 0 && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            ✏️ มี {freeCount} รายการที่พิมพ์ชื่อไว้ — ส่งได้เลย คนอนุมัติจะเป็นคนระบุของจริงให้
          </div>
        )}

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
  /**
   * บรรทัด "พิมพ์ชื่อเอง" ที่ผู้อนุมัติจับคู่กับวัตถุดิบจริงแล้ว — เก็บชั่วคราวในหน้าจอนี้ (คีย์ `reqId:index`)
   * ไม่ได้บันทึกลงคำขอ เพราะจับคู่เสร็จก็กดอนุมัติต่อเลย · ปิดป๊อปก่อนกดอนุมัติ = ต้องจับคู่ใหม่
   */
  const [mapped, setMapped] = useState<Record<string, { sku: string; name: string }>>({});
  const mapKey = (reqId: string, idx: number) => `${reqId}:${idx}`;

  const load = useCallback(() => {
    apiFetch(`/api/bom/change-requests?status=${tab}`).then((r) => r.json())
      .then((j) => setRows((j.data ?? []) as BomChangeRequest[])).catch(() => setRows([]));
  }, [tab]);
  useEffect(() => { if (open) load(); }, [open, load]);

  /** บรรทัดที่ยังไม่มีวัตถุดิบจริง (พิมพ์ชื่อมา) + ที่ผู้อนุมัติจับคู่ให้แล้ว */
  const freeLines = (r: BomChangeRequest) =>
    (r.lines ?? []).map((l, i) => ({ l, i })).filter(({ l }) => !l.component_sku);
  const unresolvedCount = (r: BomChangeRequest) =>
    freeLines(r).filter(({ i }) => !mapped[mapKey(r.id, i)]).length;

  /** อนุมัติ = เขียนลงสูตรจริงผ่าน PATCH /api/bom/[id] (ตัวเดิม) แล้วปิดคำขอ */
  const approve = async (r: BomChangeRequest) => {
    if (!r.bom_id) { toast.error("คำขอนี้ยังไม่ผูกกับสูตร — ต้องไปสร้างสูตรใหม่ที่หน้า BOM ก่อน"); return; }
    // 🔒 ห้ามเขียนบรรทัดที่ไม่มีวัตถุดิบจริงลงสูตร — คิดต้นทุน/เตรียมของ/ตัดผ้าต่อไม่ได้ (และจะเงียบ ไม่ error)
    if (unresolvedCount(r) > 0) {
      toast.error(`ยังมี ${unresolvedCount(r)} รายการที่ยังไม่ได้ระบุของจริง — เลือกวัตถุดิบให้ครบก่อน`);
      return;
    }
    setBusy(r.id);
    try {
      // ⚠️ PATCH เขียนทับ header ด้วย → ต้องดึงของเดิมมาส่งคืนให้ครบ ไม่งั้นค่าหัวสูตรจะหาย
      const cur = await apiFetch(`/api/bom/${encodeURIComponent(r.bom_id)}`).then((x) => x.json());
      const h = cur?.data ?? null;   // GET คืน header กระจายอยู่ชั้นบน + lines/sizes
      if (!h) throw new Error("ไม่พบสูตรที่จะแก้ (อาจถูกลบไปแล้ว)");

      /**
       * คำขอเก็บบรรทัด "ทั้งก้อน" ไว้แล้ว (รูปเดียวกับที่หน้า /master/bom ส่งตอนเซฟ —
       * มี cut_block/calc_mode/slot_code/size_values ครบ) → ส่งต่อได้ตรง ๆ ไม่ต้อง merge
       * ⚠️ ส่ง header เดิมคืนให้ครบด้วย เพราะ PATCH เขียนทับ header (ฟิลด์ที่ไม่ส่ง = null)
       */
      const res = await apiFetch(`/api/bom/${encodeURIComponent(r.bom_id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_code: h.bom_code, product_sku: h.product_sku, product_name: h.product_name,
          version: h.version, bom_type: h.bom_type, status: h.status,
          effective_from: h.effective_from, note: h.note,
          // เติมวัตถุดิบจริงที่ผู้อนุมัติจับคู่ให้กับบรรทัด "พิมพ์ชื่อเอง" ก่อนเขียนลงสูตร
          lines: r.lines.map((l, i) => {
            const m = mapped[mapKey(r.id, i)];
            return m
              ? { ...l, component_sku: m.sku, component_name: m.name, free_text: false, sequence: i + 1 }
              : { ...l, sequence: i + 1 };
          }),
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

  /**
   * เทียบ "ของเดิม ↔ ที่เสนอ" — จับคู่ด้วย วัตถุดิบ+บล็อกตัด+ช่อง
   * (สูตรหนึ่งมีหลายบรรทัดของวัตถุดิบตัวเดียวกันได้ = คนละบล็อกตัด จับด้วยรหัสอย่างเดียวไม่พอ)
   */
  const diff = (r: BomChangeRequest) => {
    const b = r.base_lines ?? [], l = r.lines ?? [];
    const key = (x: BomReqLine) => `${x.component_sku ?? ""}|${x.cut_block_code ?? ""}|${x.slot_code ?? ""}`;
    const bm = new Map(b.map((x) => [key(x), x]));
    const seen = new Set<string>();
    const out: { kind: "add" | "edit" | "del"; line: BomReqLine; from?: BomReqLine }[] = [];
    l.forEach((line) => {
      const k = key(line);
      const prev = bm.get(k);
      if (prev && !seen.has(k)) { seen.add(k); if (!sameLine(line, prev)) out.push({ kind: "edit", line, from: prev }); }
      else if (!prev) out.push({ kind: "add", line });
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
                                  {!x.line.component_sku && <span className="px-1 py-0.5 rounded text-[9px] bg-amber-100 text-amber-700 shrink-0">พิมพ์เอง</span>}
                                  <span className="text-slate-700 truncate">{x.line.component_name ?? x.line.component_sku}</span>
                                  <span className="text-slate-500 tabular-nums">
                                    {x.kind === "edit" && x.from ? <>{fmt(x.from.qty)} → <b>{fmt(x.line.qty)}</b></> : fmt(x.line.qty)} {x.line.uom}
                                  </span>
                                </div>
                              ))}
                            {d.length > 12 && <div className="text-[10px] text-slate-400">…อีก {d.length - 12} รายการ</div>}
                          </div>

                          {/* บรรทัดที่ผู้ขอ "พิมพ์ชื่อเอง" — ต้องระบุของจริงก่อนถึงจะอนุมัติได้ */}
                          {r.status === "pending" && canReview && freeLines(r).length > 0 && (
                            <div className="mt-1.5 border border-amber-200 bg-amber-50/60 rounded-lg p-2 space-y-1.5">
                              <div className="text-[11px] font-medium text-amber-800">
                                ✏️ ผู้ขอไม่รู้รหัส — พิมพ์ชื่อมา {freeLines(r).length} รายการ · เลือกของจริงให้ก่อนอนุมัติ
                                <span className="font-normal text-amber-700"> (ไม่มีในคลัง → กด 🔍 แล้วใช้ปุ่ม “🙋 ขอเพิ่ม” ในหน้าค้นหา)</span>
                              </div>
                              {freeLines(r).map(({ l, i }) => {
                                const m = mapped[mapKey(r.id, i)];
                                return (
                                  <div key={i} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] text-slate-700 shrink-0">
                                      “{String(l.component_name ?? "—")}”
                                      <span className="text-slate-400"> · {fmt(Number(l.qty) || 0)} {String(l.uom ?? "")}</span>
                                    </span>
                                    <span className="text-slate-300 text-[11px]">→</span>
                                    <div className="min-w-[220px] flex-1">
                                      <ComponentPicker sku={m?.sku ?? ""} name={m?.name ?? ""} placeholder="— เลือกวัตถุดิบจริง —"
                                        onPick={(c) => setMapped((s) => ({ ...s, [mapKey(r.id, i)]: { sku: c.code, name: c.name } }))} />
                                    </div>
                                    {m && <button onClick={() => setMapped((s) => { const n = { ...s }; delete n[mapKey(r.id, i)]; return n; })}
                                      title="ยกเลิกการจับคู่" className="text-slate-300 hover:text-rose-500 text-sm shrink-0">✕</button>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {r.status === "pending" && !canReview && freeLines(r).length > 0 && (
                            <div className="mt-1 text-[11px] text-amber-700">✏️ มี {freeLines(r).length} รายการที่พิมพ์ชื่อมา (รอคนอนุมัติระบุของจริง)</div>
                          )}

                          {r.note && <div className="text-[11px] text-slate-600 mt-1">📝 {r.note}</div>}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            ขอโดย {r.requested_by_name ?? "—"} · {thDT(r.created_at)}
                            {r.status === "rejected" && r.reject_reason && <span> · {r.reject_reason}</span>}
                            {r.status === "approved" && r.applied_bom_code && <span className="text-emerald-600"> → เขียนลง {r.applied_bom_code} แล้ว</span>}
                          </div>
                        </div>

                        {r.status === "pending" && canReview && (
                          <div className="shrink-0 flex flex-col gap-1">
                            <button onClick={() => void approve(r)} disabled={busy === r.id || unresolvedCount(r) > 0}
                              title={unresolvedCount(r) > 0 ? `ยังมี ${unresolvedCount(r)} รายการที่ยังไม่ได้ระบุวัตถุดิบจริง` : "เขียนลงสูตรจริงทันที"}
                              className="h-7 px-2.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap">
                              {busy === r.id ? "กำลังบันทึก…" : unresolvedCount(r) > 0 ? `ระบุของจริงอีก ${unresolvedCount(r)}` : "✓ อนุมัติ → เขียนลงสูตร"}
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
