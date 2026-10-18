"use client";

/**
 * 🖼 โหมดรูปภาพของตารางลูก (เช่น SKU ลูกในหน้า Parent SKU) — ของกลาง ใช้ใน RelationOne2Many
 *
 * - การ์ดต่อแถวลูก: รหัส + สี + "รูปทั้งหมด" ในแกลเลอรีของตัวนั้น (ไม่ใช่แค่รูปปก) · กดรูป = ดูใหญ่ · กดรหัส = เปิดหน้าตัวนั้น
 * - ลากรูปจากเครื่องลงการ์ด = เพิ่มเข้าแกลเลอรีตัวนั้นทันที (ไม่ต้องกด "แก้ไข") — สิทธิ์ตามที่หน้าส่งมา (canDrop)
 * - โยนหลายรูปที่ช่องบนสุด → จับคู่ตามชื่อไฟล์ (lib/filename-code-match) → ป๊อปให้ตรวจ/แก้คู่ → ยืนยันค่อยอัป
 * - ลากรูปสลับตำแหน่งในการ์ดเดียวกัน (useDragReorder group = id) · รูปแรก = รูปหลัก (รูปปก SKU — trigger erp_sync_cover_from_primary)
 * - ✕ ลบรูป (สิทธิ์ attachments.delete + ยืนยันก่อน · DB เขียน audit · รูปสินค้าเก็บเป็นเวอร์ชัน ย้อนคืนได้ที่ 🕘)
 *   ลบรูปหลัก → รูปถัดไปเป็นรูปหลักแทน · ไม่เหลือรูป → ล้างรูปปกที่ยังชี้รูปที่ลบ
 * อัปผ่านเส้นทางกลางเดิม (/api/attachments → R2 + ทะเบียนรูป · ย่อ 1500px · สูงสุด 9 รูป/ตัว · ตั้งรูปปกถ้ายังว่าง)
 * แก้จากในงาน (โหมดใหม่) → apiFetch แนบเลขงานให้เอง → ขึ้นใน "สิ่งที่แก้ในงานนี้" · รูปที่ลบภายหลังมีเวอร์ชันให้ย้อน
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth } from "@/components/auth";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { useCanHover } from "@/lib/use-can-hover";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { useFileDrop } from "@/components/file-drop";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { downscaleImageWidth } from "@/lib/image-resize";
import { matchFilesToCodes } from "@/lib/filename-code-match";

const MAX_PER_RECORD = 9;
type Att = { id: string; file_path: string | null; public_url: string | null; is_primary?: boolean; file_name?: string | null };
type Row = Record<string, unknown>;

const keyFromPublicUrl = (u: string): string | null => { try { return new URLSearchParams((u.split("?")[1]) ?? "").get("key"); } catch { return null; } };
const thumb = (a: Att, w = 160) => (a.file_path ? `/api/r2-image?key=${encodeURIComponent(a.file_path)}&w=${w}` : a.public_url ?? "");

/** อัปรูปเข้าแกลเลอรีของระเบียนเดียว (ของกลาง — ตารางโหมดแถว + โหมดรูปภาพใช้ตัวเดียวกัน) */
export async function uploadImagesToRecord(opts: {
  entityType: string; moduleKey: string; imageField?: string; row: Row; files: File[]; actor?: string | null;
}): Promise<{ ok: number; firstKey: string | null; errors: string[] }> {
  const rowId = String(opts.row.id);
  let ok = 0; let firstKey: string | null = null; const errors: string[] = [];
  for (const orig of opts.files) {
    try {
      const file = await downscaleImageWidth(orig, 1500);   // ย่อด้านกว้าง ≤ 1500px
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entity_type", opts.entityType);
      fd.append("entity_id", rowId);
      fd.append("attachment_kind", "image_gallery");
      fd.append("image_only", "1");
      fd.append("max_items", String(MAX_PER_RECORD));
      if (opts.actor) fd.append("actor", opts.actor);
      const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "อัปไม่สำเร็จ");
      if (!firstKey) firstKey = keyFromPublicUrl(String(j.public_url ?? "")) ?? ((j.data as { file_path?: string } | null)?.file_path ?? null);
      ok++;
    } catch (e) { errors.push(`${orig.name}: ${e instanceof Error ? e.message : "อัปไม่สำเร็จ"}`); }
  }
  // ตั้งรูปปกให้ตัวนั้น ถ้ายังไม่มีรูปปก (การ์ด/ตารางโชว์รูปทันที)
  if (firstKey && opts.imageField && (opts.row[opts.imageField] == null || opts.row[opts.imageField] === "")) {
    try {
      await apiFetch(`/api/master-v2/${opts.moduleKey}/bulk-update`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: [{ id: rowId, changes: { [opts.imageField]: firstKey } }] }),
      });
    } catch { /* ตั้งรูปปกพลาดไม่เป็นไร รูปยังอยู่ในแกลเลอรี */ }
  }
  return { ok, firstKey, errors };
}

type Pending = { file: File; code: string | null; url: string };

/** แถวรูปของ SKU เดียว — กด = ดูใหญ่ · ลาก = สลับตำแหน่ง (เฉพาะในการ์ดนี้) · ✕ = ลบ · รูปแรก = รูปหลัก */
function ThumbStrip({ group, list, canEdit, canDelete, onView, onReorder, onDelete }: {
  group: string; list: Att[]; canEdit: boolean; canDelete: boolean;
  onView: (i: number) => void; onReorder: (from: number, to: number) => void; onDelete: (a: Att) => void;
}) {
  const { rowProps, handleProps, rowCls } = useDragReorder(onReorder, { group });
  const canHover = useCanHover();
  // ปุ่มลบ: จอที่มีเมาส์โชว์ตอนชี้ · จอสัมผัสโชว์ตลอด (ไม่มี hover)
  const btnVis = canHover ? "opacity-0 group-hover/thumb:opacity-100 focus:opacity-100" : "";
  return (
    <>
      {list.map((a, i) => (
        <div key={a.id} {...(canEdit ? rowProps(i) : {})} className={`group/thumb relative h-14 w-14 rounded ${canEdit ? rowCls(i) : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb(a)} alt="" draggable={false} {...(canEdit ? handleProps(i) : {})}
            onClick={() => onView(i)} title={canEdit ? "กด = ดูใหญ่ · ลาก = สลับตำแหน่ง (รูปแรก = รูปหลัก)" : "กดเพื่อดูใหญ่"}
            className={`h-14 w-14 rounded object-cover border ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"} ${a.is_primary ? "border-amber-300" : "border-slate-200"}`} />
          {a.is_primary && <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-amber-400/90 px-1 text-[8px] font-semibold leading-tight text-white">หลัก</span>}
          {canDelete && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(a); }} title="ลบรูปนี้"
              className={`absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[11px] leading-none text-rose-600 shadow hover:bg-rose-50 ${btnVis}`}>✕</button>
          )}
        </div>
      ))}
    </>
  );
}

export function ChildImageBoard({ rows, titleField, subtitle, entityType, moduleKey, imageField, canDrop, actor, onOpen, onChanged }: {
  rows: Row[]; titleField: string; subtitle?: (r: Row) => string | null;
  entityType: string; moduleKey: string; imageField?: string;
  /** ลากรูปเข้าได้ไหม (สิทธิ์แก้) */
  canDrop: boolean; actor?: string | null;
  onOpen: (id: string) => void;
  /** อัปเสร็จ → ให้ตารางโหลดแถวใหม่ (รูปปกเปลี่ยน) */
  onChanged: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const canDelete = canDrop && can("attachments.delete");   // ลบรูป = admin/manager (DB ตรวจซ้ำ)
  const [delAsk, setDelAsk] = useState<{ row: Row; att: Att } | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [imgs, setImgs] = useState<Record<string, Att[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lb, setLb] = useState<{ images: LightboxImage[]; index: number }>({ images: [], index: -1 });
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useMemo(() => rows.map((r) => String(r.id)), [rows]);
  const codeOf = (r: Row) => String(r[titleField] ?? r.code ?? r.id);
  const rowByCode = useMemo(() => new Map(rows.map((r) => [codeOf(r), r])), [rows]);   // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!ids.length) { setImgs({}); return; }
    setError(null);
    try {
      const out: Record<string, Att[]> = {};
      for (let i = 0; i < ids.length; i += 150) {
        const r = await apiFetch(`/api/attachments?entity_type=${encodeURIComponent(entityType)}&entity_ids=${ids.slice(i, i + 150).join(",")}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || "โหลดรูปไม่สำเร็จ");
        Object.assign(out, j.by_entity ?? {});
      }
      setImgs(out);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดรูปไม่สำเร็จ"); }
  }, [ids, entityType]);
  useEffect(() => { void load(); }, [load]);

  const uploadTo = async (row: Row, files: File[]) => {
    const id = String(row.id);
    const room = MAX_PER_RECORD - (imgs?.[id]?.length ?? 0);
    if (room <= 0) { toast.error(`${codeOf(row)} มีรูปครบ ${MAX_PER_RECORD} รูปแล้ว — ลบรูปที่ไม่ใช้ก่อน`); return; }
    const use = files.slice(0, room);
    if (files.length > room) toast.warning(`${codeOf(row)} ใส่ได้อีก ${room} รูป — ข้าม ${files.length - room} รูป`);
    setBusyId(id);
    const res = await uploadImagesToRecord({ entityType, moduleKey, imageField, row, files: use, actor });
    setBusyId(null);
    if (res.errors.length) toast.error(res.errors.slice(0, 3).join(" · "));
    if (res.ok) { toast.success(`เพิ่มรูปให้ ${codeOf(row)} ${res.ok} รูป`); await load(); onChanged(); }
  };

  // ตั้งรูปหลัก = รูปแรก (รูปปก SKU เปลี่ยนตาม — trigger ใน DB)
  const makePrimary = async (attId: string) => {
    const r = await apiFetch(`/api/attachments/${attId}`, { method: "PATCH" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "ตั้งรูปหลักไม่สำเร็จ");
  };

  // ลากสลับตำแหน่ง: โชว์ทันที → บันทึกลำดับ · รูปที่ย้ายไปช่องแรก = รูปหลักใหม่
  const reorder = async (row: Row, from: number, to: number) => {
    const id = String(row.id);
    const cur = imgs?.[id] ?? [];
    const next = moveItem(cur, from, to);
    if (next === cur) return;
    const newFirst = next[0];
    setImgs((m) => ({ ...(m ?? {}), [id]: next.map((a) => ({ ...a, is_primary: a.id === newFirst.id })) }));
    setBusyId(id);
    try {
      const r = await apiFetch("/api/attachments/reorder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, entity_id: id, ordered_ids: next.map((a) => a.id) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกลำดับรูปไม่สำเร็จ");
      if (!cur[0] || cur[0].id !== newFirst.id || !newFirst.is_primary) {
        await makePrimary(newFirst.id);
        toast.success(`${codeOf(row)}: ตั้งรูปหลักใหม่แล้ว (รูปแรก)`);
        onChanged();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกลำดับรูปไม่สำเร็จ");
      await load();
    } finally { setBusyId(null); }
  };

  const confirmDelete = async () => {
    if (!delAsk) return;
    const { row, att } = delAsk;
    const id = String(row.id);
    setDelBusy(true);
    try {
      const r = await apiFetch(`/api/attachments/${att.id}?actor=${encodeURIComponent(actor ?? "")}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "ลบรูปไม่สำเร็จ");
      const rest = (imgs?.[id] ?? []).filter((x) => x.id !== att.id);
      const wasCover = !!att.is_primary || (!!imageField && !!att.file_path && row[imageField] === att.file_path);
      if (wasCover && rest.length) {
        await makePrimary(rest[0].id).catch(() => {});   // รูปถัดไปเป็นรูปหลัก/รูปปกแทน
      } else if (wasCover && imageField) {
        // ไม่เหลือรูปแล้ว → ล้างรูปปกที่ยังชี้รูปที่ลบ
        await apiFetch(`/api/master-v2/${moduleKey}/bulk-update`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edits: [{ id, changes: { [imageField]: null } }] }),
        }).catch(() => {});
      }
      toast.success(`ลบรูปของ ${codeOf(row)} แล้ว${j.kept_as_version ? " — ย้อนคืนได้ที่ 🕘 ประวัติในหน้า SKU" : ""}`);
      setDelAsk(null);
      await load(); onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบรูปไม่สำเร็จ");
    } finally { setDelBusy(false); }
  };

  const openBulk = (files: File[]) => {
    const matched = matchFilesToCodes(files, rows.map(codeOf));
    setPending(matched.map((m) => ({ file: m.file, code: m.code, url: URL.createObjectURL(m.file) })));
  };
  const closeBulk = () => { pending?.forEach((p) => URL.revokeObjectURL(p.url)); setPending(null); };
  const confirmBulk = async () => {
    if (!pending) return;
    const groups = new Map<string, File[]>();
    for (const p of pending) if (p.code) groups.set(p.code, [...(groups.get(p.code) ?? []), p.file]);
    if (!groups.size) { toast.error("ยังไม่ได้เลือก SKU ให้รูปไหนเลย"); return; }
    setBulkBusy(true);
    let total = 0; const errs: string[] = [];
    for (const [code, files] of groups) {
      const row = rowByCode.get(code); if (!row) continue;
      const room = MAX_PER_RECORD - (imgs?.[String(row.id)]?.length ?? 0);
      if (room <= 0) { errs.push(`${code}: รูปครบ ${MAX_PER_RECORD} แล้ว`); continue; }
      if (files.length > room) errs.push(`${code}: ใส่ได้อีก ${room} รูป ข้าม ${files.length - room}`);
      setBusyId(String(row.id));
      const res = await uploadImagesToRecord({ entityType, moduleKey, imageField, row, files: files.slice(0, room), actor });
      total += res.ok; errs.push(...res.errors);
    }
    setBusyId(null); setBulkBusy(false);
    closeBulk();
    if (errs.length) toast.warning(errs.slice(0, 4).join(" · "));
    if (total) { toast.success(`เพิ่มรูปแล้ว ${total} รูป ใน ${groups.size} SKU`); await load(); onChanged(); }
  };

  const drop = useFileDrop((files, key) => {
    if (key === "__bulk") { openBulk(files); return; }
    const row = rows.find((r) => String(r.id) === key);
    if (row) void uploadTo(row, files);
  }, { accept: "image/", disabled: !canDrop || !!busyId || bulkBusy, onReject: () => toast.error("ลากได้เฉพาะไฟล์รูป"), onBusy: () => toast.info("กำลังอัปรูปอยู่ รอสักครู่") });

  const matchedCount = pending?.filter((p) => p.code).length ?? 0;
  return (
    <div {...drop.guard} className="space-y-2">
      {canDrop && (
        <div {...drop.zone("__bulk")} onClick={() => fileInput.current?.click()} role="button" tabIndex={0}
          className={`rounded-lg border-2 border-dashed px-3 py-2 text-xs cursor-pointer ${drop.over === "__bulk" ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          📥 โยนหลายรูปพร้อมกันตรงนี้ (หรือกดเลือกไฟล์) — ระบบจับคู่ตามชื่อไฟล์ เช่น <span className="font-mono">{rows[0] ? `${codeOf(rows[0])}_1.jpg` : "MGN194-01_1.jpg"}</span> → ให้ตรวจก่อนยืนยัน
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) openBulk(fs); }} />
        </div>
      )}
      {error ? (
        <div className="flex items-center justify-between gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
          <span>⚠ {error}</span>
          <button type="button" onClick={() => void load()} className="shrink-0 h-7 px-2 rounded border border-red-200 bg-white">ลองใหม่</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {rows.map((r) => {
            const id = String(r.id);
            const list = imgs?.[id] ?? [];
            const sub = subtitle?.(r);
            const over = drop.over === id;
            return (
              <div key={id} {...(canDrop ? drop.zone(id) : {})}
                className={`rounded-lg border p-2 ${over ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                  <button type="button" onClick={() => onOpen(id)} title="เปิดหน้า SKU นี้ (ตั้งรูปหลัก/ลบ/เรียงรูป)" className="font-mono text-xs font-medium text-slate-700 hover:text-violet-700 hover:underline truncate">{codeOf(r)}</button>
                  {sub && <span className="text-[11px] text-slate-400 truncate">· {sub}</span>}
                  <span className={`ml-auto shrink-0 text-[10px] ${list.length ? "text-slate-400" : "text-rose-500"}`}>
                    {busyId === id ? "กำลังอัป…" : imgs === null ? "…" : list.length ? `${list.length}/${MAX_PER_RECORD} รูป` : "ยังไม่มีรูป"}
                  </span>
                </div>
                {imgs === null ? (
                  <div className="h-14 rounded bg-slate-100 animate-pulse" />
                ) : (
                  <div className="flex flex-wrap gap-1">
                    <ThumbStrip group={id} list={list} canEdit={canDrop && busyId !== id} canDelete={canDelete && busyId !== id}
                      onView={(i) => setLb({ images: list.map((x) => ({ url: thumb(x, 1600), label: `${codeOf(r)}${x.is_primary ? " · รูปหลัก" : ""}` })), index: i })}
                      onReorder={(from, to) => void reorder(r, from, to)}
                      onDelete={(a) => setDelAsk({ row: r, att: a })} />
                    {canDrop && list.length < MAX_PER_RECORD && (
                      <label className={`h-14 w-14 rounded border border-dashed flex items-center justify-center text-[10px] text-center leading-tight cursor-pointer ${over ? "border-violet-400 text-violet-600" : "border-slate-300 text-slate-400 hover:bg-slate-50"}`}>
                        {busyId === id ? <span className="w-4 h-4 border-2 border-slate-300 border-t-violet-600 rounded-full animate-spin" /> : list.length ? "＋" : "ลากรูป\nมาวาง"}
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) void uploadTo(r, fs); }} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-slate-400">💡 กดรูป = ดูใหญ่{canDrop ? " · ลากรูป = สลับตำแหน่ง (รูปแรก = รูปหลัก/รูปปก)" : ""}{canDelete ? " · ✕ = ลบรูป" : ""} · กดรหัส = เปิดหน้า SKU · ย่อรูป 1500px อัตโนมัติ · สูงสุด {MAX_PER_RECORD} รูปต่อ SKU</p>

      <ConfirmDialog open={!!delAsk} onClose={() => { if (!delBusy) setDelAsk(null); }} onConfirm={() => void confirmDelete()} loading={delBusy}
        variant="danger" title="ลบรูปนี้?" confirmText="ลบรูป"
        message={delAsk ? (
          <span className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(delAsk.att, 160)} alt="" className="h-16 w-16 shrink-0 rounded object-cover border border-slate-200" />
            <span>ลบรูปนี้ออกจาก <b className="font-mono">{codeOf(delAsk.row)}</b>{delAsk.att.is_primary ? " (รูปหลัก — รูปถัดไปจะเป็นรูปหลักแทน)" : ""} · ย้อนคืนได้ที่ 🕘 ประวัติในหน้า SKU</span>
          </span>
        ) : ""} />

      <ImageLightbox images={lb.images} index={lb.index} onClose={() => setLb((s) => ({ ...s, index: -1 }))} onIndex={(i) => setLb((s) => ({ ...s, index: i }))} />

      {pending && (
        <ERPModal open onClose={() => { if (!bulkBusy) closeBulk(); }} title="จับคู่รูปกับ SKU" size="lg" defaultExpanded={false}
          footer={<>
            <button type="button" onClick={closeBulk} disabled={bulkBusy} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button type="button" onClick={() => void confirmBulk()} disabled={bulkBusy || matchedCount === 0} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{bulkBusy ? "กำลังอัป…" : `✅ อัป ${matchedCount} รูป`}</button>
          </>}>
          <div className="space-y-2">
            <p className="text-sm text-slate-600">จับคู่ได้ {matchedCount}/{pending.length} รูป — ตรวจ/เปลี่ยน SKU ได้ก่อนยืนยัน · รูปที่ "ข้าม" จะไม่ถูกอัป</p>
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {pending.map((p, i) => (
                <li key={p.url} className="flex items-center gap-2 px-2 py-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-10 w-10 rounded object-cover border border-slate-200" />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-600" title={p.file.name}>{p.file.name}</span>
                  <select value={p.code ?? ""} onChange={(e) => setPending((s) => s && s.map((x, j) => (j === i ? { ...x, code: e.target.value || null } : x)))}
                    className={`h-8 rounded-md border px-2 text-xs ${p.code ? "border-slate-200" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                    <option value="">— ข้าม (ไม่อัป) —</option>
                    {rows.map((r) => <option key={String(r.id)} value={codeOf(r)}>{codeOf(r)}{subtitle?.(r) ? ` · ${subtitle(r)}` : ""}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        </ERPModal>
      )}
    </div>
  );
}
