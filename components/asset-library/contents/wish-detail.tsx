"use client";

/**
 * หน้า "รายการที่อยากได้" (ป๊อปเต็มจอ) — บรีฟก่อนถ่าย: ประเภท Content · รุ่น · รายละเอียด · คนถ่าย · วันที่อยากได้ + กระดาน Reference
 * ถ่ายแล้ว → "แปลงเป็นอัลบั้ม" (phase wish → album · id เดิม · Reference ติดไปอยู่ในอัลบั้ม ไว้เทียบตอนคัดรูป)
 * ใช้ของกลาง: ERPModal · ConfirmDialog · RefBoard · AlbumFormModal (โหมด wish) · PlatformIcon
 * สิทธิ์: แก้/เพิ่ม Reference/แปลง = assets.upload · ลบ = assets.manage
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PlatformIcon } from "@/components/platform-icon";
import { useCreativeOptions } from "@/app/tasks/use-options";
import type { BrandOption } from "@/app/tasks/data";
import { POST_TYPES } from "@/lib/creative-tasks";
import { WISH_STAGE_META, wishStage } from "@/lib/content-album-status";
import { getContentAlbum, updateContentAlbum, trashContentAlbum, type AlbumDetail } from "./api";
import { RefBoard } from "./ref-board";
import { AlbumFormModal } from "./album-form-modal";

export function WishDetailModal({ albumId, brands, onClose, onChanged, onConverted }: {
  albumId: string;
  brands: BrandOption[];
  onClose: () => void;
  onChanged: () => void;
  /** แปลงเป็นอัลบั้มแล้ว → หน้ารวมเปิดอัลบั้มให้ต่อ */
  onConverted: (albumId: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const { platforms } = useCreativeOptions();
  const platMeta = useMemo(() => new Map(platforms.map((p) => [p.value, p])), [platforms]);
  const canEdit = can("assets.upload");
  const [wish, setWish] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try { setWish(await getContentAlbum(albumId)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [albumId]);
  useEffect(() => { void load(); }, [load]);

  const convert = async () => {
    setBusy(true);
    try {
      await updateContentAlbum(albumId, { phase: "album" });
      toast.success(t("แปลงเป็นอัลบั้มแล้ว — ลากรูป/โฟลเดอร์จากการถ่ายมาวางได้เลย", "Now an album — drop the shoot's photos/folders in"));
      onChanged(); onConverted(albumId);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); setConvertOpen(false); }
  };
  const trash = async () => {
    setBusy(true);
    try { await trashContentAlbum(albumId); toast.success(t("ย้ายไปถังขยะแล้ว", "Moved to trash")); onChanged(); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); setTrashOpen(false); }
  };

  const typeLabel = (k: string) => { const pt = POST_TYPES.find((x) => x.value === k); return pt ? t(pt.label, pt.label_en) : k; };
  const stage = wish ? wishStage(wish) : null;
  return (
    <ERPModal open onClose={onClose} title={wish?.name || t("รายการที่อยากได้", "Wish")} size="xl" storageKey="content-wish-detail"
      footer={wish ? (
        <div className="flex flex-wrap items-center gap-2 w-full">
          {can("assets.manage") && <button onClick={() => setTrashOpen(true)} className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-red-600 rounded-lg hover:bg-red-50"><Icon name="delete" />{t("ลบ", "Delete")}</button>}
          <span className="flex-1" />
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {canEdit && (
            <button onClick={() => setConvertOpen(true)} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">
              <Icon name="camera" />{t("ถ่ายแล้ว → แปลงเป็นอัลบั้ม", "Shot it → turn into an album")}
            </button>
          )}
        </div>
      ) : undefined}>
      {loading && !wish ? <LoadingState /> : error && !wish ? <ErrorState hint={error} onRetry={() => void load()} /> : wish && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {stage && <span className={`inline-flex items-center h-6 px-2 rounded-full border text-xs font-medium ${stage === "need_shooter" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-sky-50 text-sky-800 border-sky-200"}`}>{t(WISH_STAGE_META[stage].th, WISH_STAGE_META[stage].en)}</span>}
            {wish.brand_name && <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: wish.brand_color || "#94a3b8" }} />{wish.brand_name}</span>}
            {wish.due_date && <span className="inline-flex items-center gap-1 text-slate-600"><Icon name="calendar" />{t("อยากได้ภายใน", "Wanted by")} {new Date(`${wish.due_date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span>}
            <span className="inline-flex items-center gap-1 text-slate-600"><Icon name="camera" />{wish.assignees.length ? wish.assignees.map((p) => p.name).filter(Boolean).join(", ") : t("ยังไม่มีคนถ่าย", "No shooter yet")}</span>
            {canEdit && <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="edit" />{t("แก้ข้อมูล", "Edit")}</button>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {wish.content_types.map((k) => <span key={k} className="inline-flex items-center h-6 px-2 rounded-full bg-violet-50 text-violet-800 border border-violet-200">{typeLabel(k)}</span>)}
            {wish.products.map((p) => <span key={p.id} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-slate-100 text-slate-700"><span className="font-mono">{p.code}</span>{p.name ? <span className="text-slate-500 truncate max-w-[180px]">{p.name}</span> : null}</span>)}
            {wish.planned_platforms.map((code) => <span key={code} title={platMeta.get(code)?.label ?? code}><PlatformIcon code={code} iconKey={platMeta.get(code)?.icon_key} size={18} /></span>)}
          </div>
          {wish.description && <p className="text-sm text-slate-700 whitespace-pre-line rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">{wish.description}</p>}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Icon name="pin" />Reference <span className="text-slate-400 font-normal">{wish.refs.length}</span></h3>
            <RefBoard albumId={albumId} refs={wish.refs} canEdit={canEdit} onChanged={() => { void load(true); onChanged(); }} />
          </section>
        </div>
      )}

      {wish && <AlbumFormModal open={editOpen} album={wish} brands={brands} onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); toast.success(t("บันทึกแล้ว", "Saved")); void load(true); onChanged(); }} />}
      <ConfirmDialog open={convertOpen} onClose={() => setConvertOpen(false)} onConfirm={() => void convert()} loading={busy}
        title={t("แปลงเป็นอัลบั้ม", "Turn into an album")} confirmText={t("แปลงเป็นอัลบั้ม", "Turn into album")}
        message={t("ย้ายไปด้วยทั้งหมด: ชื่อ · แบรนด์ · รุ่น · ประเภท Content · แพลตฟอร์ม · วันที่ · คนถ่าย · Reference (อยู่ในอัลบั้ม ไว้เทียบตอนคัดรูป) — แล้วลากรูป/โฟลเดอร์จากการถ่ายมาวางได้ทันที", "Everything moves over: name, brand, products, content types, platforms, date, shooter, and references (kept in the album for picking shots) — then drop the shoot's files in")} />
      <ConfirmDialog open={trashOpen} onClose={() => setTrashOpen(false)} onConfirm={() => void trash()} loading={busy} variant="danger"
        title={t("ลบรายการนี้", "Delete this wish")} confirmText={t("ย้ายไปถังขยะ", "Move to trash")}
        message={t("ย้ายไปถังขยะ (กู้คืนได้) · Reference ไม่หาย", "Moves to trash (restorable) · references are kept")} />
    </ERPModal>
  );
}
