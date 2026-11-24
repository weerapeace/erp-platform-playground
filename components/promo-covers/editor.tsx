"use client";
/**
 * 🖼 ตัวแก้ชุดโปร 1 ชุด — 1 เลือกรุ่น · 2 ปกโปร (อัปเอง / คลังรูป / กรอบโปรอัตโนมัติ) · 3 เลือกร้าน · 4 ตั้งเวลา
 *   ร่าง/รอเริ่ม = แก้ได้ทุกอย่าง · กำลังใช้ = แก้ได้แค่ชื่อ/เวลาจบ (จะเปลี่ยนรูป ต้องย้อนปกเดิมก่อน)
 *   ลากไฟล์มาวางได้ (ของกลาง useFileDrop): ทั้งกล่องปกโปร = จับคู่รุ่นจากชื่อไฟล์ · ช่องปกของแต่ละรุ่น = ลงรุ่นนั้นเลย · Ctrl+V วางรูปที่คัดลอกได้
 *   ปกโปรทุกรูปถูกเก็บลงอัลบั้มในคลังรูป ชื่อตามชื่อชุด (lib/promo-cover-album) — แก้ชื่อ/เปิดในคลังรูปได้จากกล่องอัลบั้ม
 *   รอบ 3: บันทึกแล้วเป็น "อ่านอย่างเดียว" (สรุป) · กด "แก้ไข" = เปิดตัวแก้เต็ม (บันทึก/ยกเลิก) · ชุดใหม่ที่ยังว่าง/เพิ่งกดใช้ซ้ำ = เปิดตัวแก้ให้เลย
 *     โชว์ "ปกจะเปลี่ยนภายในกี่โมง" (ตัวตั้งเวลาเช็กทุก TICK_MIN นาที) + เตือนช่วงโปรสั้นกว่ารอบเช็ก
 *   ปุ่ม "ตรวจก่อน/หลัง แล้วยืนยัน" → ป๊อปยืนยัน (confirm-modal) — การส่งขึ้นร้านจริงเกิดตอนถึงเวลา หรือกด "ทำเดี๋ยวนี้" ในผลรายร้าน
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { ERPDateTime24 } from "@/components/form";
import { useToast } from "@/components/toast";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import type { SkuPickerCatalog } from "@/components/marketing-sku-picker-modal";
// ป๊อปเลือกรุ่น / คลังรูป เปิดเมื่อกดเท่านั้น → โหลดตอนใช้ (หน้าเบาขึ้น)
const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });
const MarketingSkuPickerModal = dynamic(() => import("@/components/marketing-sku-picker-modal").then((m) => m.MarketingSkuPickerModal), { ssr: false });
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/modal";
import { META_NOTE, PLATFORM_LABEL, PLATFORM_NOTE, PROMO_PLATFORMS, REVIEW_PLATFORMS, TICK_MIN, changeBy, thTime, windowTooShort, type PromoPlatform } from "@/lib/promo-cover";
import { frameBatch, imgUrl, patchCampaign, previewCampaign, uploadPromoImage, type Full, type Item, type Preview } from "./api";
import { Pill, Thumb, isoToLocal, localToIso } from "./parts";

type Mode = "upload" | "library" | "frame";
type Draft = { name: string; note: string; starts: string; ends: string; auto_revert: boolean; early_hours: number; platforms: string[] };
const draftOf = (f: Full): Draft => ({
  name: f.campaign.name, note: f.campaign.note ?? "", starts: isoToLocal(f.campaign.starts_at), ends: isoToLocal(f.campaign.ends_at),
  auto_revert: f.campaign.auto_revert, early_hours: f.campaign.early_hours, platforms: f.campaign.platforms,
});
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
const section = "rounded-xl border border-slate-200 bg-white p-3 sm:p-4";
const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const btnSm = "inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function PromoEditor({ full, canEdit, onChanged, onAskConfirm, startEditing = false }: {
  full: Full;
  canEdit: boolean;
  onChanged: (f: Full) => void;
  /** บันทึกแล้วเปิดป๊อปยืนยัน */
  onAskConfirm: (preview: Preview | null) => void;
  /** เปิดมาในโหมดแก้ไขเลย (เช่น เพิ่งกดใช้ซ้ำ) */
  startEditing?: boolean;
}) {
  const toast = useToast();
  const c = full.campaign;
  const editable = canEdit && (c.status === "draft" || c.status === "scheduled") && !c.deleted_at;
  const timeEditable = canEdit && c.status !== "ended" && c.status !== "cancelled" && !c.deleted_at;
  // ชุดใหม่ที่ยังไม่ได้ทำอะไรเลย (ร่าง ไม่มีรุ่น ไม่เคยแก้หัวชุด) → เปิดตัวแก้ให้เลย
  const fresh = c.status === "draft" && full.items.length === 0 && Math.abs(Date.parse(c.updated_at) - Date.parse(c.created_at)) < 5_000;
  const [editing, setEditing] = useState(() => timeEditable && (startEditing || fresh));
  // เปลี่ยนชุด → เริ่มใหม่ · ยืนยันแล้ว/เริ่มใช้/จบ → กลับเป็นอ่านอย่างเดียว (กลับเป็นร่างระหว่างแก้ = แก้ต่อได้)
  useEffect(() => { setEditing(timeEditable && (startEditing || fresh)); }, [c.id, startEditing]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (c.status !== "draft") setEditing(false); }, [c.status]);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(full));
  const saved = useMemo(() => draftOf(full), [full]);
  useEffect(() => { setDraft(draftOf(full)); }, [full.campaign.id, full.campaign.updated_at]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !same(draft, saved);
  const [mode, setMode] = useState<Mode>(() => (c.frame_key ? "frame" : "upload"));
  const [busy, setBusy] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [libFor, setLibFor] = useState<Item | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pvLoading, setPvLoading] = useState(false);
  const fileFor = useRef<string | null>(null);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [albumEdit, setAlbumEdit] = useState<string | null>(null);
  const oneFile = useRef<HTMLInputElement>(null);
  const manyFiles = useRef<HTMLInputElement>(null);
  const frameFile = useRef<HTMLInputElement>(null);

  const apply = (f: Full & { back_to_draft?: boolean }) => {
    onChanged(f);
    if (f.back_to_draft) toast.warning("แก้ชุดที่ยืนยันแล้ว → กลับเป็นร่าง ต้องกดตรวจก่อน/หลัง แล้วยืนยันใหม่");
  };
  const patch = useCallback(async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try { const f = await patchCampaign(c.id, body); apply(f); return f; }
    catch (e) { toast.error((e as Error).message); return null; }
    finally { setBusy(null); }
  }, [c.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // สรุปร้าน (อ่านอย่างเดียว) — โหลดใหม่เมื่อรุ่น/ร้านเปลี่ยน
  const pvKey = `${full.items.map((i) => i.parent_sku_id).join(",")}|${c.platforms.join(",")}`;
  useEffect(() => {
    if (!full.items.length || !c.platforms.length) { setPreview(null); return; }
    let alive = true;
    setPvLoading(true);
    previewCampaign(c.id).then((p) => { if (alive) setPreview(p); }).catch(() => { if (alive) setPreview(null); }).finally(() => { if (alive) setPvLoading(false); });
    return () => { alive = false; };
  }, [pvKey, c.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const saveDraft = async () => {
    const body: Record<string, unknown> = { name: draft.name, note: draft.note, ends_at: localToIso(draft.ends), auto_revert: draft.auto_revert };
    if (editable) Object.assign(body, { starts_at: localToIso(draft.starts), early_hours: draft.early_hours, platforms: draft.platforms });
    const f = await patch(body, "save");
    if (f) toast.success("บันทึกแล้ว");
    return f;
  };
  /** บันทึกแล้วกลับเป็นอ่านอย่างเดียว (ไม่มีอะไรเปลี่ยน = ปิดตัวแก้เลย) */
  const saveAndClose = async () => {
    if (!dirty) { setEditing(false); return; }
    const f = await saveDraft();
    if (f) setEditing(false);
  };
  const cancelEdit = () => { if (dirty) setDiscardAsk(true); else setEditing(false); };
  const startsIso = localToIso(draft.starts);
  const endsIso = localToIso(draft.ends);
  const tooShort = windowTooShort(startsIso, endsIso);

  // ── รูป ──
  const setImage = (item: Item, key: string | null, source: Item["source"]) => patch({ set_items: [{ id: item.id, promo_key: key, source }] }, `img:${item.id}`);
  const onOneFile = async (file: File | undefined, itemId = fileFor.current) => {
    const item = full.items.find((i) => i.id === itemId);
    if (!file || !item) return;
    setBusy(`img:${item.id}`);
    setUp({ name: `${item.code} · ${file.name}`, size: file.size, pct: null });
    try { const key = await uploadPromoImage(file); setUp(null); await setImage(item, key, "upload"); }
    catch (e) { toast.error((e as Error).message); setBusy(null); }
    finally { setUp(null); }
  };
  /** วางหลายไฟล์ — จับคู่รุ่นจากชื่อไฟล์ (ชื่อไฟล์มีรหัสรุ่น เช่น LM-2201.jpg) */
  const onManyFiles = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const byLen = [...full.items].sort((a, b) => b.code.length - a.code.length);
    const pairs: { item: Item; file: File }[] = []; const miss: string[] = [];
    for (const f of [...files]) {
      const nm = f.name.toUpperCase().replace(/\.[A-Z0-9]+$/, "");
      const it = byLen.find((i) => i.code && nm.includes(i.code.toUpperCase()));
      if (it && !pairs.some((p) => p.item.id === it.id)) pairs.push({ item: it, file: f }); else miss.push(f.name);
    }
    if (!pairs.length) { toast.warning("ไม่มีไฟล์ไหนตรงรหัสรุ่นในชุดนี้ — ตั้งชื่อไฟล์ให้มีรหัสรุ่น เช่น LM-2201.jpg"); return; }
    setBusy("many");
    const sets: { id: string; promo_key: string; source: "upload" }[] = []; const errs: string[] = [];
    for (const [n, p] of pairs.entries()) {
      setUp({ name: p.file.name, size: p.file.size, count: { current: n + 1, total: pairs.length }, pct: pairs.length > 1 ? Math.round((n / pairs.length) * 100) : null });
      try { sets.push({ id: p.item.id, promo_key: await uploadPromoImage(p.file), source: "upload" }); } catch (e) { errs.push((e as Error).message); }
    }
    setUp(null);
    setBusy(null);
    if (sets.length) await patch({ set_items: sets }, "many");
    toast[errs.length || miss.length ? "warning" : "success"](`ใส่ปกโปรแล้ว ${sets.length} รุ่น${miss.length ? ` · ไม่ตรงรหัสรุ่น ${miss.length} ไฟล์ (${miss.slice(0, 3).join(", ")})` : ""}${errs.length ? ` · อัปไม่ผ่าน ${errs.length}` : ""}`);
  };
  const onFrameFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "image/png") { toast.warning("กรอบโปรต้องเป็นไฟล์ PNG พื้นใส (ตรงกลางโปร่ง ให้เห็นสินค้า)"); return; }
    setBusy("frame-up");
    try {
      const key = await uploadPromoImage(file);
      const f = await patchCampaign(c.id, { frame_key: key, set_items: full.items.filter((i) => i.source === "frame").map((i) => ({ id: i.id, promo_key: null, source: "frame" })) });
      apply(f);
      toast.success("อัปกรอบแล้ว — กด \"แปะกรอบให้ทุกรุ่น\" เพื่อสร้างปกโปร");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  /** แปะกรอบ (ทีละ 8 รุ่น เรียกซ้ำจนครบ) · all = ทำใหม่ทุกรุ่น */
  const runFrame = async (all: boolean) => {
    if (!c.frame_key) { toast.warning("อัปรูปกรอบโปรก่อน"); return; }
    setBusy("frame");
    try {
      let f = full;
      if (all) f = await patchCampaign(c.id, { set_items: full.items.map((i) => ({ id: i.id, promo_key: null, source: "frame" })) });
      else {
        const noImg = full.items.filter((i) => !i.promo_key && i.source !== "frame");
        if (noImg.length) f = await patchCampaign(c.id, { set_items: noImg.map((i) => ({ id: i.id, promo_key: null, source: "frame" })) });
      }
      onChanged(f);
      let done = 0; const failed: string[] = [];
      for (let i = 0; i < 80; i++) {
        const r = await frameBatch(c.id);
        done += r.done; failed.push(...r.failed.map((x) => x.error));
        if (!r.left || (!r.done && r.failed.length)) break;
      }
      onChanged(await patchCampaign(c.id, {}));
      if (failed.length) toast.warning(`แปะกรอบแล้ว ${done} รุ่น · ไม่ผ่าน ${failed.length}: ${failed[0]}`);
      else toast.success(`แปะกรอบแล้ว ${done} รุ่น`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const reframeOne = async (item: Item) => {
    setBusy(`img:${item.id}`);
    try { await patchCampaign(c.id, { set_items: [{ id: item.id, promo_key: null, source: "frame" }] }); await frameBatch(c.id, [item.id]); onChanged(await patchCampaign(c.id, {})); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  // ลากไฟล์วาง: "many" = ทั้งกล่องปกโปร (จับคู่จากชื่อไฟล์) · "item:<id>" = ช่องปกของรุ่นนั้น (หลายไฟล์ = ใช้ไฟล์แรก)
  const drop = useFileDrop((files, key) => {
    if (key === "many") void onManyFiles(files);
    else if (key.startsWith("item:")) void onOneFile(files[0], key.slice(5));
  }, {
    accept: "image/",
    disabled: !editable || !!busy,
    onBusy: () => toast.warning(editable ? "รอให้อัปรูปก่อนหน้าเสร็จก่อน" : "ชุดนี้แก้รูปไม่ได้แล้ว"),
    onReject: () => toast.warning("ลากได้เฉพาะรูป JPG / PNG / WEBP"),
    folders: false,
  });

  // อัลบั้มปกโปร: แก้ชื่อ
  const saveAlbumName = async () => {
    const nm = (albumEdit ?? "").trim();
    if (!nm) { toast.warning("ใส่ชื่ออัลบั้มก่อน"); return; }
    const f = await patch({ album_name: nm }, "album");
    if (f) { setAlbumEdit(null); toast.success("เปลี่ยนชื่ออัลบั้มแล้ว"); }
  };
  const album = full.album ?? null;

  // ── รุ่น ──
  const loadCatalog = useCallback(async (): Promise<SkuPickerCatalog> => {
    const j = await (await apiFetch("/api/parent-skus/spec-export?catalog=1")).json() as { data?: SkuPickerCatalog; error?: string };
    if (j.error || !j.data) throw new Error(j.error || "โหลดรายการสินค้าไม่สำเร็จ");
    return { ...j.data, takenIds: full.items.map((i) => i.parent_sku_id) };
  }, [full.items]);

  const pv = preview?.summary ?? [];
  const pvOf = (p: PromoPlatform) => pv.find((s) => s.platform === p) ?? null;
  const missing = full.items.filter((i) => !i.promo_key).length;
  const hasReview = draft.platforms.some((p) => REVIEW_PLATFORMS.has(p as PromoPlatform));

  // อัลบั้มปกโปรในคลังรูป (ใช้ทั้งโหมดอ่านอย่างเดียวและโหมดแก้)
  const albumBox = (album || full.items.some((i) => i.promo_key)) ? (
      <div className={section}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {albumEdit === null ? (
            <p className="min-w-0 text-sm text-slate-800">
              <Icon name="image" size={14} className="mr-1 inline text-slate-500" />
              <span className="font-medium">อัลบั้มปกโปร:</span> {album ? album.name : "ยังไม่ได้สร้าง (สร้างให้ตอนบันทึกปกครั้งถัดไป)"}
              {album && <span className="text-[12px] text-slate-500"> · {album.count.toLocaleString()} รูป</span>}
            </p>
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <input autoFocus value={albumEdit} maxLength={120} onChange={(e) => setAlbumEdit(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveAlbumName(); if (e.key === "Escape") setAlbumEdit(null); }}
                className="h-8 min-w-[12rem] flex-1 rounded-md border border-slate-300 px-2 text-sm" aria-label="ชื่ออัลบั้ม" />
              <button type="button" className={btnSm} disabled={busy === "album"} onClick={() => void saveAlbumName()}><Icon name="save" /> {busy === "album" ? "กำลังบันทึก…" : "บันทึก"}</button>
              <button type="button" className={btnSm} onClick={() => setAlbumEdit(null)}>ยกเลิก</button>
            </div>
          )}
          {albumEdit === null && (
            <div className="flex flex-wrap gap-1.5">
              {canEdit && !c.deleted_at && <button type="button" className={btnSm} disabled={!!busy} onClick={() => setAlbumEdit(album?.name ?? c.name)}><Icon name="edit" /> {album ? "แก้ชื่อ" : "สร้างอัลบั้ม"}</button>}
              {album && <a href={`/master/assets?collection=${album.id}`} target="_blank" rel="noopener" className={btnSm}><Icon name="open" /> เปิดในคลังรูป</a>}
            </div>
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">ปกโปรทุกรูปของชุดนี้ (อัปเอง · จากคลัง · แปะกรอบ) ถูกเก็บในอัลบั้มนี้ให้เอง · ตั้งชื่อตามชื่อชุดโปร (มีอัลบั้มชื่อนี้อยู่แล้ว = ใช้อันเดิม) · เอาปกออก/ลบชุด รูปยังอยู่ในอัลบั้ม</p>
      </div>
    ) : null;

  // ── 🔒 อ่านอย่างเดียว (บันทึกแล้ว) — กด "แก้ไข" เพื่อเปิดตัวแก้เต็ม ──
  const roRow = "grid grid-cols-1 gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3";
  const roKey = "text-[12px] text-slate-500";
  const startShow = c.starts_at ? thTime(c.starts_at) : c.status === "draft" ? "ทันทีที่กดยืนยัน" : thTime(c.confirmed_at);
  const changeAt = changeBy(c.starts_at ?? (c.status === "scheduled" ? c.confirmed_at : null));
  const roTooShort = (c.status === "draft" || c.status === "scheduled") && windowTooShort(c.starts_at, c.ends_at);
  if (!editing) {
    return (
      <div className="space-y-3">
        <div className={section}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[12px] text-slate-500"><Icon name="lock" size={13} /> อ่านอย่างเดียว{timeEditable ? " — กด \"แก้ไข\" เพื่อเปลี่ยน" : ""}</p>
            <div className="flex flex-wrap gap-2">
              {timeEditable && <button type="button" className={btn} onClick={() => setEditing(true)}><Icon name="edit" /> แก้ไข</button>}
              {editable && c.status === "draft" && (
                <button type="button" className={`${btn} border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100`} disabled={!!busy || !full.items.length} onClick={() => onAskConfirm(preview)}>
                  <Icon name="view" /> ตรวจก่อน/หลัง แล้วยืนยัน
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2.5 text-[13px] text-slate-800">
            <div className={roRow}>
              <span className={roKey}>รุ่น ({full.items.length})</span>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {full.items.length === 0 ? <span className="text-slate-400">ยังไม่ได้เลือกรุ่น</span> : full.items.map((i) => (
                  <span key={i.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-100 py-0.5 pl-0.5 pr-2 text-[12px] text-slate-700" title={i.name}>
                    <Thumb src={imgUrl(i.promo_key ?? i.cover_key, 80)} size={22} accent={!!i.promo_key} />
                    <span className="truncate">{i.code}</span>
                    {!i.promo_key && <span className="text-amber-700">ยังไม่มีปก</span>}
                  </span>
                ))}
              </div>
            </div>
            <div className={roRow}>
              <span className={roKey}>ร้าน</span>
              <span>{c.platforms.length ? c.platforms.map((p) => { const s2 = pvOf(p as PromoPlatform); return `${PLATFORM_LABEL[p as PromoPlatform] ?? p}${s2 ? ` (ส่งได้ ${s2.ready.toLocaleString()})` : ""}`; }).join(" · ") : <span className="text-rose-600">ยังไม่ได้เลือกร้าน</span>}</span>
            </div>
            <div className={roRow}>
              <span className={roKey}>เริ่ม</span>
              <span>{startShow}{changeAt && (c.status === "draft" || c.status === "scheduled") ? <span className="text-[12px] text-slate-500"> · ปกจะเปลี่ยนภายใน {thTime(changeAt)}</span> : ""}</span>
            </div>
            <div className={roRow}>
              <span className={roKey}>จบ</span>
              <span>{c.ends_at ? `${thTime(c.ends_at)}${c.auto_revert ? " · ย้อนเป็นปกเดิมอัตโนมัติ" : " · ไม่ย้อนเอง"}` : "ไม่ได้ตั้ง (ย้อนเองด้วยปุ่ม \"ย้อนปกเดิมเดี๋ยวนี้\")"}</span>
            </div>
            {c.platforms.some((p) => REVIEW_PLATFORMS.has(p as PromoPlatform)) && (
              <div className={roRow}><span className={roKey}>TikTok / Lazada</span><span>ส่งล่วงหน้า {c.early_hours} ชั่วโมง (รอร้านตรวจ)</span></div>
            )}
          </div>
          {roTooShort && <p className="mt-3 text-[12px] text-amber-700">ช่วงโปรสั้นกว่ารอบเช็กเวลา ({TICK_MIN} นาที) — ปกอาจไม่ได้เปลี่ยน · แก้ให้ยาวขึ้น หรือกด &quot;เริ่มเดี๋ยวนี้&quot;</p>}
          <p className="mt-3 text-[11px] text-slate-400">ระบบเช็กเวลาทุก {TICK_MIN} นาที — ปกเปลี่ยน/ย้อนช้าสุด {TICK_MIN} นาทีหลังเวลาที่ตั้ง</p>
        </div>
        {albumBox}
      </div>
    );
  }

  return (
    <div className="space-y-3" {...drop.guard}>
      {/* หัว: ชื่อชุด */}
      <div className={section}>
        <label className="text-[12px] text-slate-500">ชื่อชุดโปร</label>
        <input value={draft.name} disabled={!timeEditable} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น 12.12 ลดใหญ่"
          className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50" />
        {c.status === "live" && <p className="mt-2 text-[12px] text-amber-700">กำลังใช้อยู่ — แก้ได้แค่ชื่อและเวลาจบ · จะเปลี่ยนรูป/รุ่น/ร้าน ให้กด &quot;ย้อนปกเดิมเดี๋ยวนี้&quot; ก่อน</p>}
      </div>

      {/* 1 เลือกรุ่น */}
      <div className={section}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">1 · เลือกรุ่น <span className="font-normal text-slate-500">({full.items.length} รุ่น)</span></p>
          {editable && <button type="button" className={btnSm} onClick={() => setPickOpen(true)}><Icon name="add" /> เลือกรุ่น</button>}
        </div>
        {full.items.length === 0 ? <p className="text-[13px] text-slate-500">ยังไม่ได้เลือกรุ่น — กด &quot;เลือกรุ่น&quot; แล้วติ๊กได้หลายรุ่นพร้อมกัน</p> : (
          <div className="flex flex-wrap gap-1.5">
            {full.items.map((i) => (
              <span key={i.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-100 py-0.5 pl-0.5 pr-2 text-[12px] text-slate-700">
                <Thumb src={imgUrl(i.cover_key, 80)} size={22} />
                <span className="truncate">{i.code}</span>
                {editable && <button type="button" aria-label={`เอา ${i.code} ออก`} className="text-slate-400 hover:text-rose-600" onClick={() => void patch({ remove_item_ids: [i.id] }, "rm")}><Icon name="cancel" size={12} /></button>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2 ปกโปร — ทั้งกล่องลากหลายไฟล์มาวางได้ (จับคู่จากชื่อไฟล์) */}
      <div className={`${section} relative`} {...(editable && full.items.length ? drop.zone("many") : {})}>
        <FileDropHint show={drop.over === "many"} label="วางเลย — ระบบจับคู่รุ่นจากชื่อไฟล์" />
        <p className="mb-2 text-sm font-medium text-slate-800">2 · ปกโปร {missing > 0 && full.items.length > 0 && <Pill tone="warn" className="ml-1">ยังไม่มีปก {missing} รุ่น</Pill>}</p>
        {editable && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([["upload", "อัปรูปเองรายรุ่น"], ["library", "เลือกจากคลังรูป"], ["frame", "กรอบโปรอัตโนมัติ"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`h-8 rounded-md border px-3 text-[12px] ${mode === k ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
        )}
        {editable && mode === "upload" && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
            <button type="button" className={btnSm} disabled={!!busy || !full.items.length} onClick={() => manyFiles.current?.click()}><Icon name="upload" /> วางหลายไฟล์พร้อมกัน</button>
            <span>ลากหลายไฟล์มาวางในกล่องนี้ หรือกดปุ่ม · ชื่อไฟล์ต้องมีรหัสรุ่น เช่น LM-2201.jpg ระบบจับคู่ให้ · หรือลากรูปลงช่องของรุ่นนั้นตรง ๆ</span>
          </div>
        )}
        {editable && mode === "library" && <p className="mb-3 text-[12px] text-slate-500">กด &quot;คลังรูป&quot; ที่รุ่นนั้น แล้วเลือกรูปจากคลังรูปกลาง{album ? ` — เปิดมาที่อัลบั้ม "${album.name}" ให้ก่อน (เปลี่ยนอัลบั้มได้)` : ""}</p>}
        {up && <UploadProgress {...up} className="mb-3" />}
        {editable && mode === "frame" && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2.5">
            <Thumb src={imgUrl(c.frame_key, 160)} label="ยังไม่มีกรอบ" size={64} />
            <div className="min-w-0 flex-1 text-[12px] text-slate-600">
              <p>อัปกรอบ/ป้ายโปรเป็น PNG พื้นใส (จัตุรัส ตรงกลางโปร่ง) 1 ไฟล์ ระบบจะแปะทับปกในระบบของทุกรุ่นให้</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={btnSm} disabled={!!busy} onClick={() => frameFile.current?.click()}><Icon name="upload" /> {c.frame_key ? "เปลี่ยนกรอบ" : "อัปกรอบ PNG"}</button>
                <button type="button" className={btnSm} disabled={!!busy || !c.frame_key || !full.items.length} onClick={() => void runFrame(false)}><Icon name="image" /> {busy === "frame" ? "กำลังแปะ…" : "แปะกรอบให้รุ่นที่ยังไม่มีปก"}</button>
                <button type="button" className={btnSm} disabled={!!busy || !c.frame_key || !full.items.length} onClick={() => void runFrame(true)}><Icon name="refresh" /> แปะใหม่ทุกรุ่น</button>
              </div>
            </div>
          </div>
        )}
        {full.items.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {full.items.map((i) => {
              const b = busy === `img:${i.id}`;
              return (
                <div key={i.id} {...(editable ? drop.zone(`item:${i.id}`) : {})} title={editable ? "ลากรูปมาวางที่ช่องนี้ = ปกโปรของรุ่นนี้" : undefined}
                  className={`relative flex items-center gap-2 rounded-lg border p-2 ${drop.over === `item:${i.id}` ? "border-sky-400 bg-sky-50" : "border-slate-200"}`}>
                  <FileDropHint show={drop.over === `item:${i.id}`} label={`ปกโปรของ ${i.code}`} />
                  <Thumb src={imgUrl(i.cover_key, 160)} label="ไม่มีปกในระบบ" />
                  <Icon name="open" size={14} className="shrink-0 text-slate-400" />
                  <Thumb src={imgUrl(i.promo_key, 160)} label={b ? "กำลังทำ…" : "ยังไม่มีปกโปร"} accent={!!i.promo_key} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-800">{i.code}</p>
                    <p className="truncate text-[11px] text-slate-500">{i.name || "—"}{i.promo_key ? ` · ${i.source === "frame" ? "จากกรอบ" : i.source === "library" ? "จากคลัง" : "อัปเอง"}` : ""}</p>
                    {editable && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button type="button" className={btnSm} disabled={!!busy} onClick={() => { fileFor.current = i.id; oneFile.current?.click(); }}>อัป</button>
                        <button type="button" className={btnSm} disabled={!!busy} onClick={() => setLibFor(i)}>คลังรูป</button>
                        {c.frame_key && <button type="button" className={btnSm} disabled={!!busy || !i.cover_key} onClick={() => void reframeOne(i)}>กรอบ</button>}
                        {i.promo_key && <button type="button" aria-label="เอาปกโปรออก" className={`${btnSm} text-rose-600`} disabled={!!busy} onClick={() => void setImage(i, null, i.source)}><Icon name="delete" /></button>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {albumBox}

      {/* 3 เลือกร้าน */}
      <div className={section}>
        <p className="mb-2 text-sm font-medium text-slate-800">3 · เลือกร้าน {pvLoading && <span className="text-[12px] font-normal text-slate-400">กำลังเช็กร้าน…</span>}</p>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {PROMO_PLATFORMS.map((p) => {
            const s = pvOf(p);
            const on = draft.platforms.includes(p);
            return (
              <label key={p} className={`flex items-start gap-2 rounded-lg border p-2 ${on ? "border-sky-300 bg-sky-50/40" : "border-slate-200"}`}>
                <input type="checkbox" className="mt-1" checked={on} disabled={!editable} onChange={(e) => setDraft({ ...draft, platforms: e.target.checked ? [...draft.platforms, p] : draft.platforms.filter((x) => x !== p) })} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-800">{PLATFORM_LABEL[p]}
                    {on && s && <Pill tone={s.ready ? (s.blocked.length ? "warn" : "ok") : "bad"}>ส่งได้ {s.ready.toLocaleString()} รายการ</Pill>}
                    {REVIEW_PLATFORMS.has(p) && <Pill tone="warn">ต้องรอร้านตรวจ</Pill>}
                  </span>
                  <span className="block text-[11px] text-slate-500">{PLATFORM_NOTE[p]}</span>
                  {on && s && (s.unmatched > 0 || s.closed > 0) && <span className="block text-[11px] text-slate-500">{s.unmatched ? `ยังไม่จับคู่/ไม่อยู่บนร้าน ${s.unmatched} รุ่น` : ""}{s.unmatched && s.closed ? " · " : ""}{s.closed ? `ปิดขายอยู่ ${s.closed} รายการ (ไม่เปลี่ยน)` : ""}</span>}
                  {on && s?.blocked.map((x) => <span key={x} className="block text-[11px] text-rose-600">{x} — ไปที่ ร้าน/บัญชีแพลตฟอร์ม แล้วเชื่อมต่อ</span>)}
                </span>
              </label>
            );
          })}
          <div className="flex items-start gap-2 rounded-lg border border-dashed border-slate-200 p-2 opacity-80">
            <input type="checkbox" className="mt-1" disabled />
            <span className="text-[12px] text-slate-500"><span className="text-[13px] text-slate-700">FB/IG Shop</span> <Pill tone="muted">ตามเว็บ</Pill><br />{META_NOTE}</span>
          </div>
        </div>
      </div>

      {/* 4 ตั้งเวลา */}
      <div className={section}>
        <p className="mb-2 text-sm font-medium text-slate-800">4 · ตั้งเวลา</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] text-slate-500">เริ่มโปร (ว่าง = เริ่มทันทีที่ยืนยัน)</p>
            <ERPDateTime24 value={draft.starts} onChange={(v) => setDraft({ ...draft, starts: v })} defaultTime="00:00" disabled={!editable} />
          </div>
          <div>
            <p className="mb-1 text-[12px] text-slate-500">จบโปร</p>
            <ERPDateTime24 value={draft.ends} onChange={(v) => setDraft({ ...draft, ends: v })} defaultTime="00:00" disabled={!timeEditable} />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={draft.auto_revert} disabled={!timeEditable} onChange={(e) => setDraft({ ...draft, auto_revert: e.target.checked })} />
          จบโปรแล้ว ย้อนกลับเป็นปกเดิมอัตโนมัติ
        </label>
        {hasReview && (
          <label className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
            TikTok / Lazada ส่งล่วงหน้า
            <input type="number" min={0} max={168} step={1} value={draft.early_hours} disabled={!editable} onChange={(e) => setDraft({ ...draft, early_hours: Math.max(0, Math.min(168, Math.round(Number(e.target.value) || 0))) })} className="h-8 w-20 rounded-md border border-slate-300 px-2 text-sm" />
            ชั่วโมง <span className="text-[11px] text-slate-500">(ร้านตรวจเสร็จเร็ว ปกโปรอาจขึ้นก่อนเวลาเริ่ม)</span>
          </label>
        )}
        <p className="mt-3 text-[12px] text-slate-500">ระบบเช็กเวลาทุก {TICK_MIN} นาที{editable ? ` — ปกจะเปลี่ยนภายใน ${startsIso ? thTime(changeBy(startsIso)) : `${TICK_MIN} นาทีหลังกดยืนยัน`}` : ""}{endsIso ? ` · ย้อนปกเดิมภายใน ${thTime(changeBy(endsIso))}` : ""}</p>
        {tooShort && <p className="mt-1 text-[12px] text-amber-700">ช่วงโปรสั้นกว่ารอบเช็กเวลา ({TICK_MIN} นาที) — ปกอาจไม่ได้เปลี่ยน · ตั้งให้ยาวกว่านี้ หรือกด &quot;เริ่มเดี๋ยวนี้&quot; หลังยืนยัน</p>}
        {c.status === "scheduled" && editable && <p className="mt-1 text-[12px] text-amber-700">ชุดนี้ยืนยันแล้ว — ถ้าแก้รุ่น/ปก/ร้าน/เวลาเริ่ม ต้องกดตรวจก่อน/หลัง แล้วยืนยันใหม่</p>}
        {timeEditable && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={!!busy} onClick={() => void saveAndClose()}><Icon name="save" /> {busy === "save" ? "กำลังบันทึก…" : "บันทึก"}</button>
            <button type="button" className={btn} disabled={!!busy} onClick={cancelEdit}>ยกเลิก</button>
            {editable && c.status === "draft" && (
              <button type="button" className={`${btn} border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100`} disabled={!!busy || !full.items.length}
                onClick={async () => { const f = dirty ? await saveDraft() : full; if (f) onAskConfirm(preview); }}>
                <Icon name="view" /> ตรวจก่อน/หลัง แล้วยืนยัน
              </button>
            )}
            {dirty && <span className="self-center text-[12px] text-amber-700">มีที่แก้ยังไม่บันทึก</span>}
          </div>
        )}
        {timeEditable && <p className="mt-2 text-[11px] text-slate-400">รุ่นและปกโปรบันทึกทันทีที่เพิ่ม/เปลี่ยน · ปุ่มบันทึก = ชื่อ ร้าน และเวลา</p>}
      </div>

      <input ref={oneFile} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void onOneFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={manyFiles} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void onManyFiles(e.target.files); e.target.value = ""; }} />
      <input ref={frameFile} type="file" accept="image/png" className="hidden" onChange={(e) => { void onFrameFile(e.target.files?.[0]); e.target.value = ""; }} />

      {pickOpen && <MarketingSkuPickerModal open onClose={() => setPickOpen(false)} title="เลือกรุ่นที่จะเปลี่ยนปกโปร"
        load={loadCatalog} takenIds={full.items.map((i) => i.parent_sku_id)}
        taken={{ badge: "อยู่ในชุดแล้ว", short: "อยู่แล้ว", hide: "ซ่อนที่อยู่ในชุดแล้ว", row: "✓ อยู่ในชุดแล้ว" }}
        confirmText={(n) => (n ? `เพิ่ม ${n} รุ่น` : "เลือกรุ่นก่อน")} busyText="กำลังเพิ่ม…"
        onConfirm={async (ids) => !!(await patch({ add_parent_ids: ids }, "add"))}
        tabPrefKey="promo_cover_pick_tab" colsPrefKey="promo-cover-pick" showFullPageLink={false} workTab />}
      <ConfirmDialog open={discardAsk} onClose={() => setDiscardAsk(false)} title="ทิ้งที่แก้?" confirmText="ทิ้งที่แก้" variant="danger"
        message="คุณมีข้อมูลที่ยังไม่ได้บันทึก (ชื่อ ร้าน หรือเวลา) — ต้องการออกโดยไม่บันทึกหรือไม่? (รุ่นและปกที่เพิ่มไว้บันทึกแล้ว)"
        onConfirm={() => { setDiscardAsk(false); setDraft(draftOf(full)); setEditing(false); }} />
      {libFor && <AssetPicker open onClose={() => setLibFor(null)} title={libFor ? `เลือกปกโปรของ ${libFor.code}` : "เลือกรูป"} typeFilter="image" defaultSearch={album ? undefined : libFor?.code} defaultCollectionId={album?.id}
        onSelect={(a) => { const it = libFor; setLibFor(null); if (it && a[0]?.r2_key) void setImage(it, a[0].r2_key, "library"); }} />}
    </div>
  );
}
