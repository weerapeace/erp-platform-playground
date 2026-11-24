"use client";
/**
 * 🧱 บล็อกพิมพ์ — หน้าคลังสัญลักษณ์ (/master/block-print/symbols) · เจ้าของเลือกใน widget 2026-11-24 (ข้อเสนอ 2-4)
 *   ตารางรูปตัวอย่าง (วาดจากเส้น) · ค้นหา/หมวด · เลือกหลายตัว → ดาวน์โหลด SVG (หลายตัว = zip) / แก้ชื่อ-หมวด-ขนาด / ย้ายเข้าถังขยะ
 *   เพิ่มเข้าคลัง: ปุ่ม "เพิ่ม SVG / .ai" หรือลากไฟล์มาวาง → หน้าเลือกชิ้น (รวม/แยก) → ตั้งชื่อ + หมวด → บันทึก
 *   ถังขยะ: กู้คืน · ลบถาวร (พิมพ์รหัสยืนยัน) · ย้ายเข้าถังขยะแล้วกด "ย้อนกลับ" ในแจ้งผลได้
 */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { downloadBlob } from "@/lib/pdf-merge-engine";
import { buildZip } from "@/lib/zip";
import { ART_ACCEPT, isArtFile, readArtFile } from "@/lib/block-print-ai";
import { GROUP_DEFAULT, appendOffset, applyGrouping, autoGroup, shiftPiece, type BlockPiece } from "@/lib/block-print";
import { svgFileName } from "@/lib/block-print-layout";
import { symbolFromPiece, symbolSvg, type BlockSymbol, type SymbolInput } from "@/lib/block-print-symbols";
import { uid } from "@/lib/block-print-layout";
import { BlockPieceGrouper } from "./grouper";
import { SaveSymbolsModal, SymbolCard, SymbolFilters, SYMBOLS_API, categoriesOf, filterSymbols, useSymbols } from "./symbols-ui";
import { LIST_HREF, api, skippedNote } from "./shared";

export function BlockSymbolsPage() {
  const toast = useToast();
  const canEdit = usePermission("block_print.edit");
  const [trash, setTrash] = useState(false);
  const { rows, setRows, err, load } = useSymbols(trash);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState<BlockSymbol | null>(null);
  const [hardDel, setHardDel] = useState<BlockSymbol | null>(null);
  const [importing, setImporting] = useState<{ pieces: BlockPiece[]; file: string } | null>(null);
  const [saveItems, setSaveItems] = useState<SymbolInput[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => filterSymbols(rows ?? [], q, cat), [rows, q, cat]);
  const picked = (rows ?? []).filter((r) => sel.includes(r.id));
  const toggle = (id: string) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // ───── เพิ่มไฟล์เข้าคลัง ─────
  const addFiles = async (files: File[]) => {
    if (!canEdit || reading) return;
    const ok = files.filter(isArtFile);
    if (!ok.length) { toast.error("เพิ่มได้เฉพาะไฟล์ .ai / .pdf / .svg"); return; }
    let pieces: BlockPiece[] = [];
    const msgs: string[] = [];
    for (const f of ok) {
      setReading(`กำลังอ่านไฟล์ ${f.name}…`);
      try {
        const res = await readArtFile(f);
        msgs.push(...skippedNote(res.skipped).map((n) => `${f.name}: ${n}`));
        if (!res.pieces.length) { msgs.push(`${f.name}: ไม่พบชิ้นเวกเตอร์ที่เติมสี`); continue; }
        const grouped = applyGrouping(res.pieces, autoGroup(res.pieces, GROUP_DEFAULT));
        const o = appendOffset(pieces, grouped);
        const prefix = `${uid("f")}-`;
        pieces = [...pieces, ...grouped.map((p) => shiftPiece(p, o.dx, o.dy, prefix))];
      } catch (e) { msgs.push(`${f.name}: ${e instanceof Error ? e.message : "เปิดไฟล์ไม่ได้"}`); }
    }
    setReading(null);
    setNotes(msgs);
    if (!pieces.length) { toast.error("ไม่พบชิ้นที่จะเพิ่ม — ดูรายละเอียดในกล่องสีเหลือง"); return; }
    setImporting({ pieces, file: ok.map((f) => f.name).join(", ") });
  };
  const afterGroup = (ps: BlockPiece[]) => {
    const file = importing?.file ?? null;
    setImporting(null);
    const items = ps.filter((p) => p.on && !p.kind).map((p) => ({ ...symbolFromPiece(p), source_file_name: file }));
    if (!items.length) { toast.error("ไม่ได้ติ๊กชิ้นที่จะเก็บ"); return; }
    setSaveItems(items);
  };

  // ───── แก้ / ลบ / กู้คืน ─────
  const patch = async (s: BlockSymbol, body: Record<string, unknown>) => {
    const r = await api<BlockSymbol>(`${SYMBOLS_API}/${s.id}`, { method: "PATCH", json: body });
    setRows((cur) => cur?.map((x) => (x.id === r.id ? r : x)) ?? cur);
    return r;
  };
  const archive = async () => {
    const list0 = picked;
    if (!list0.length) return;
    try {
      for (const s of list0) await api(`${SYMBOLS_API}/${s.id}`, { method: "DELETE" });
      setRows((cur) => cur?.filter((x) => !sel.includes(x.id)) ?? cur); setSel([]);
      toast.undo(`ย้าย ${list0.length} ตัวเข้าถังขยะแล้ว`, async () => {
        try { for (const s of list0) await api(`${SYMBOLS_API}/${s.id}`, { method: "PATCH", json: { is_active: true } }); await load(); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const restore = async () => {
    try {
      for (const s of picked) await api(`${SYMBOLS_API}/${s.id}`, { method: "PATCH", json: { is_active: true } });
      setRows((cur) => cur?.filter((x) => !sel.includes(x.id)) ?? cur);
      toast.success(`กู้คืน ${picked.length} ตัวแล้ว`); setSel([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };
  const destroy = async () => {
    const s = hardDel; if (!s) return;
    try {
      await api(`${SYMBOLS_API}/${s.id}?hard=1`, { method: "DELETE" });
      setRows((cur) => cur?.filter((x) => x.id !== s.id) ?? cur); setSel((cur) => cur.filter((x) => x !== s.id));
      toast.success(`ลบ ${s.code} ถาวรแล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    setHardDel(null);
  };
  const download = () => {
    if (!picked.length) return;
    const norm = (s: BlockSymbol) => ({ ...s, ow: Number(s.ow), oh: Number(s.oh), w: Number(s.w), h: Number(s.h) });
    if (picked.length === 1) { const s = norm(picked[0]); downloadBlob(new Blob([symbolSvg(s)], { type: "image/svg+xml" }), svgFileName(s.code, s.name)); return; }
    const enc = new TextEncoder();
    const zip = buildZip(picked.map((s0) => { const s = norm(s0); return { name: svgFileName(s.code, s.name), data: enc.encode(symbolSvg(s)) }; }));
    downloadBlob(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), `คลังสัญลักษณ์ ${picked.length} ตัว.zip`);
  };

  if (importing) {
    return <BlockPieceGrouper pieces={importing.pieces} onDone={afterGroup} onCancel={() => setImporting(null)}
      doneLabel="ต่อไป: ตั้งชื่อ + บันทึกเข้าคลัง" backLabel="กลับหน้าคลัง" nextStep="ตั้งชื่อ + บันทึก" />;
  }

  return (
    <div className="relative mx-auto max-w-[1400px] space-y-3 p-3 md:p-5"
      onDragOver={(e) => { if (!canEdit || trash || !e.dataTransfer.types.includes("Files")) return; e.preventDefault(); if (!dropping) setDropping(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false); }}
      onDrop={(e) => { if (!canEdit || trash) return; e.preventDefault(); setDropping(false); void addFiles(Array.from(e.dataTransfer.files)); }}>
      {(dropping || reading) && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-indigo-600/10">
          <div className="rounded-2xl border-2 border-dashed border-indigo-400 bg-white px-8 py-6 text-center shadow-lg">
            <div className="text-base font-medium text-indigo-700">{reading ?? "วางไฟล์เพื่อเพิ่มเข้าคลัง"}</div>
            {!reading && <div className="mt-1 text-sm text-slate-500">.ai · .pdf · .svg — ตรวจรวม/แยกชิ้นก่อนบันทึก</div>}
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept={ART_ACCEPT} multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(fs); }} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={LIST_HREF} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"><Icon name="back" /> งานบล็อก</Link>
        <h1 className="text-lg font-semibold text-slate-900">{trash ? "ถังขยะ · คลังสัญลักษณ์" : "คลังสัญลักษณ์"}</h1>
        <span className="text-sm text-slate-500">{rows ? `${rows.length} ตัว` : ""}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => { setTrash((t) => !t); setSel([]); }} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name={trash ? "back" : "delete"} /> {trash ? "กลับคลัง" : "ถังขยะ"}</button>
          {canEdit && !trash && <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="upload" /> เพิ่ม SVG / .ai</button>}
        </div>
      </div>
      {!trash && <p className="text-sm text-slate-500">เก็บสัญลักษณ์ไว้ใช้ซ้ำทุกงาน · ลากไฟล์ .ai / .svg มาวางตรงไหนก็ได้ · ในงานบล็อกกด &quot;บันทึกเข้าคลัง&quot; ที่ชิ้น หรือ &quot;เพิ่มจากคลัง&quot;</p>}

      {notes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <ul className="list-disc space-y-0.5 pl-5">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <button type="button" onClick={() => setNotes([])} className="mt-1 text-xs text-amber-700 underline">รับทราบ</button>
        </div>
      )}

      <SymbolFilters q={q} setQ={setQ} cat={cat} setCat={setCat} cats={categoriesOf(rows ?? [])} />

      {err ? <ErrorState title="โหลดคลังไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !rows ? <LoadingState label="กำลังโหลดคลัง…" />
        : !rows.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-base font-medium text-slate-800">{trash ? "ถังขยะว่าง" : "เริ่มเก็บสัญลักษณ์แรก"}</div>
            {!trash && <p className="mt-1 text-sm text-slate-500">ลากไฟล์ .ai / .svg มาวาง หรือกดปุ่ม &quot;เพิ่ม SVG / .ai&quot;</p>}
          </div>
        ) : !list.length ? <div className="py-10 text-center text-sm text-slate-500">ไม่พบ ลองเปลี่ยนคำค้นหาหรือหมวด</div>
        : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {list.map((s) => <SymbolCard key={s.id} s={s} unit="cm" selected={sel.includes(s.id)} onClick={() => toggle(s.id)} />)}
          </div>
        )}

      {picked.length > 0 && (
        <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <span className="px-1 text-sm text-slate-600">เลือก {picked.length} ตัว</span>
          <button type="button" onClick={() => setSel([])} className="h-8 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100">ล้าง</button>
          <span className="flex-1" />
          {!trash && <button type="button" onClick={download} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">ดาวน์โหลด SVG{picked.length > 1 ? " (zip)" : ""}</button>}
          {!trash && canEdit && picked.length === 1 && <button type="button" onClick={() => setEdit(picked[0])} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">แก้ชื่อ / หมวด / ขนาด</button>}
          {!trash && canEdit && <button type="button" onClick={() => void archive()} className="h-9 rounded-lg border border-red-200 px-3 text-sm text-red-600 hover:bg-red-50">ย้ายเข้าถังขยะ</button>}
          {trash && canEdit && <button type="button" onClick={() => void restore()} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">กู้คืน</button>}
          {trash && canEdit && picked.length === 1 && <button type="button" onClick={() => setHardDel(picked[0])} className="h-9 rounded-lg border border-red-200 px-3 text-sm text-red-600 hover:bg-red-50">ลบถาวร</button>}
        </div>
      )}

      <SaveSymbolsModal open={!!saveItems} onClose={() => setSaveItems(null)} items={saveItems ?? []} onSaved={(r) => setRows((cur) => [...(cur ?? []), ...r])} />
      {edit && <EditSymbolModal s={edit} onClose={() => setEdit(null)} cats={categoriesOf(rows ?? [])}
        onSave={async (body) => { try { await patch(edit, body); toast.success("บันทึกแล้ว"); setEdit(null); } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } }} />}
      <ConfirmDialog open={!!hardDel} onClose={() => setHardDel(null)} onConfirm={() => void destroy()} variant="danger"
        title="ลบสัญลักษณ์นี้ถาวร?" message={<>ลบ <b>{hardDel?.code} {hardDel?.name}</b> ออกจากระบบถาวร กู้คืนไม่ได้ (งานบล็อกที่วางไว้แล้วไม่หาย) — พิมพ์รหัสเพื่อยืนยัน</>}
        confirmText="ลบถาวร" requireTyped={hardDel?.code} />
    </div>
  );
}

function EditSymbolModal({ s, onClose, onSave, cats }: { s: BlockSymbol; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void>; cats: string[] }) {
  const [name, setName] = useState(s.name);
  const [cat, setCat] = useState(s.category ?? "");
  const [w, setW] = useState(String(+Number(s.w).toFixed(3)));
  const [h, setH] = useState(String(+Number(s.h).toFixed(3)));
  const [lock, setLock] = useState(true);
  const [saving, setSaving] = useState(false);
  const ratio = Number(s.oh) / Number(s.ow);
  const dirty = name !== s.name || cat !== (s.category ?? "") || Number(w) !== Number(s.w) || Number(h) !== Number(s.h);
  const submit = async () => {
    const nw = Number(w.replace(",", ".")), nh = Number(h.replace(",", "."));
    if (!name.trim() || !(nw > 0) || !(nh > 0)) return;
    setSaving(true);
    await onSave({ name: name.trim(), category: cat.trim() || null, w: nw, h: nh });
    setSaving(false);
  };
  return (
    <ERPModal open onClose={onClose} title={`แก้ ${s.code}`} size="sm" hasUnsavedChanges={dirty}
      footer={<div className="flex w-full justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">ยกเลิก</button>
        <button type="button" disabled={saving || !name.trim()} onClick={() => void submit()} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>}>
      <div className="space-y-2 text-sm">
        <label className="block"><span className="text-xs text-slate-500">ชื่อ</span><input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2" /></label>
        <label className="block"><span className="text-xs text-slate-500">หมวด</span>
          <input list="block-symbol-cats-edit" value={cat} onChange={(e) => setCat(e.target.value.slice(0, 40))} className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2" />
          <datalist id="block-symbol-cats-edit">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="text-xs text-slate-500">กว้างที่ใช้บ่อย (มม.)</span><input inputMode="decimal" value={w} onChange={(e) => { setW(e.target.value); const n = Number(e.target.value); if (lock && n > 0) setH(String(+(n * ratio).toFixed(3))); }} className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2" /></label>
          <label className="block"><span className="text-xs text-slate-500">สูงที่ใช้บ่อย (มม.)</span><input inputMode="decimal" value={h} onChange={(e) => { setH(e.target.value); const n = Number(e.target.value); if (lock && n > 0) setW(String(+(n / ratio).toFixed(3))); }} className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2" /></label>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> ล็อกสัดส่วน</label>
        <p className="text-xs text-slate-400">ขนาดเดิมในไฟล์ {+Number(s.ow).toFixed(2)} × {+Number(s.oh).toFixed(2)} มม.{s.source_file_name ? ` · จากไฟล์ ${s.source_file_name}` : ""}</p>
      </div>
    </ERPModal>
  );
}
