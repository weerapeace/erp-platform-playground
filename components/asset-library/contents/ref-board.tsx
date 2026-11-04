"use client";

/**
 * กระดาน Reference (ของกลางของหน้า Contents) — ใช้ทั้งหน้า "รายการที่อยากได้" และในอัลบั้ม (ไว้เทียบตอนคัดรูป)
 *   เพิ่ม: รูป (ลากวาง / วางจากคลิปบอร์ด / เลือกไฟล์) · ลิงก์วิดีโอ/โพสต์ (TikTok/YouTube/IG/Pinterest/เว็บ → พรีวิว + เล่นในหน้าเท่าที่ฝังได้) · ข้อความ
 *   แต่ละชิ้นจด "ชอบตรงไหน" ได้ · กรองตามชนิด · ลบ (ถามก่อน)
 *   คลัง Reference กลาง: ปุ่ม "หยิบจากคลัง Ref" (RefLibraryPicker) · ดาวที่การ์ด = เก็บเข้าคลัง (ดาวเต็ม = อยู่ในคลังแล้ว)
 *   ใช้กับคลังเองก็ได้ (แท็บ "คลัง Ref"): ส่ง source แทน albumId + tileExtra (แท็ก/แบรนด์/ใช้กี่ครั้ง)
 * ใช้ของกลาง: useFileDrop · askConfirm · FileThumb · Icon · lib/content-album-refs (ตัวแยกลิงก์/ตัวฝัง)
 */
import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { useCreativeOptions } from "@/app/tasks/use-options";
import { useFileDrop } from "@/components/file-drop";
import { askConfirm } from "@/components/modal/ask-dialog";
import { REF_PROVIDER_META, cleanRefUrl, refEmbedUrl, type RefProvider } from "@/lib/content-album-refs";
import { addAlbumRef, removeAlbumRef, setAlbumRefNote, resolveRefLink, uploadRefImage, saveRefToLibrary, type AlbumRef, type NewRef } from "./data";
import { FileThumb } from "./album-bits";
import { RefLibraryPicker } from "./ref-library-picker";

type Filter = "all" | "image" | "link" | "text";

/** ช่องที่กระดานใช้ (Reference ของรายการ และชิ้นในคลังกลาง ใช้ร่วมกัน) */
export type RefLike = Pick<AlbumRef, "id" | "kind" | "r2_key" | "url" | "provider" | "title" | "thumb_url" | "body" | "note"> & { library_id?: string | null };
/** ที่เก็บของกระดาน — ค่าเริ่ม = Reference ของรายการ (albumId) · คลังกลางส่งของตัวเอง */
export type RefSource = {
  add: (ref: NewRef) => Promise<void>;
  remove: (r: RefLike) => Promise<void>;
  setNote: (r: RefLike, note: string) => Promise<void>;
  removeText?: { title: string; message?: string };
};

export function RefBoard({ albumId, source, refs, canEdit, canRemove = canEdit, onChanged, compact = false, brandId = null, tileExtra, emptyText }: {
  /** Reference ของรายการนี้ (มีปุ่มหยิบจากคลัง + ดาวเก็บเข้าคลัง) */
  albumId?: string;
  /** แทน albumId — กระดานของคลังกลาง */
  source?: RefSource;
  refs: RefLike[];
  canEdit: boolean;
  canRemove?: boolean;
  onChanged: () => void;
  /** ในอัลบั้ม: กริดเล็กลง ไม่มีช่องเพิ่มใหญ่ */
  compact?: boolean;
  /** แบรนด์ของรายการ — ป๊อปหยิบจากคลังเรียงแบรนด์นี้ขึ้นก่อน */
  brandId?: string | null;
  /** ช่องเพิ่มใต้การ์ด (คลังกลาง: แท็ก/แบรนด์/ใช้กี่ครั้ง) */
  tileExtra?: (r: RefLike) => ReactNode;
  /** ข้อความตอนยังไม่มีอะไรเลย (แทนค่าเริ่ม) */
  emptyText?: string;
}) {
  const t = useT();
  const toast = useToast();
  const src: RefSource = useMemo(() => source ?? {
    add: (ref) => addAlbumRef(albumId!, ref),
    remove: (r) => removeAlbumRef(albumId!, r.id),
    setNote: (r, note) => setAlbumRefNote(albumId!, r.id, note),
  }, [source, albumId]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const haveLibraryIds = useMemo(() => new Set(refs.map((r) => r.library_id).filter((x): x is string => !!x)), [refs]);
  const saveToLibrary = async (r: RefLike) => {
    if (!albumId || saving) return;
    setSaving(r.id);
    try {
      const res = await saveRefToLibrary(albumId, r.id);
      toast.success(res.existed ? t("มีในคลัง Ref อยู่แล้ว — ผูกกับชิ้นเดิมให้", "Already in the library — linked to it") : t("เก็บเข้าคลัง Ref แล้ว · ติดแท็กได้ที่แท็บคลัง Ref", "Saved to the library · add tags in the Library tab"));
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(null); }
  };
  const { platforms } = useCreativeOptions();
  const platMeta = useMemo(() => new Map(platforms.map((p) => [p.value, p])), [platforms]);
  const [filter, setFilter] = useState<Filter>("all");
  const [link, setLink] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [textErr, setTextErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<{ id: string; value: string } | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); onChanged(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const addImages = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    void run(t(`กำลังเพิ่มรูป ${imgs.length} รูป…`, `Adding ${imgs.length} image(s)…`), async () => {
      for (const f of imgs) await src.add({ kind: "image", r2_key: await uploadRefImage(f) });
    });
  };
  const addLink = (raw = link) => {
    if (!cleanRefUrl(raw)) { setLinkErr(t("วางลิงก์ที่ขึ้นต้นด้วย https://", "Paste a link starting with https://")); return; }
    setLinkErr(null);
    void run(t("กำลังอ่านลิงก์…", "Reading the link…"), async () => {
      const info = await resolveRefLink(raw);
      if (!info) throw new Error(t("ลิงก์ไม่ถูกต้อง", "Invalid link"));
      await src.add({ kind: "link", ...info });
      setLink("");
    });
  };
  const addText = () => {
    if (!text.trim()) { setTextErr(t("พิมพ์ข้อความก่อน", "Type something first")); return; }
    setTextErr(null);
    void run(t("กำลังบันทึก…", "Saving…"), async () => { await src.add({ kind: "text", body: text.trim() }); setText(""); });
  };
  const remove = async (r: RefLike) => {
    const label = r.title || r.body || r.url || "";
    if (!(await askConfirm({ title: src.removeText?.title ?? t("ลบ Reference นี้?", "Delete this reference?"), message: src.removeText?.message ? <><p>{label}</p><p className="mt-2 text-slate-500">{src.removeText.message}</p></> : label, confirmText: t("ลบ", "Delete"), variant: "danger" }))) return;
    void run(t("กำลังลบ…", "Deleting…"), () => src.remove(r));
  };
  const saveNote = () => {
    if (!editNote) return;
    const n = editNote; setEditNote(null);
    const r = refs.find((x) => x.id === n.id);
    if (!r || (r.note ?? "") === n.value.trim()) return;
    void run(t("กำลังบันทึก…", "Saving…"), () => src.setNote(r, n.value));
  };

  // วางรูปจากคลิปบอร์ด / วางลิงก์ทั้งก้อน (ตอนไม่ได้พิมพ์อยู่ในช่องไหน)
  const onPaste = (e: React.ClipboardEvent) => {
    if (!canEdit) return;
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addImages(files); return; }
    const tag = (e.target as HTMLElement).tagName;
    const pasted = e.clipboardData.getData("text").trim();
    if (tag !== "INPUT" && tag !== "TEXTAREA" && cleanRefUrl(pasted)) { e.preventDefault(); addLink(pasted); }
  };
  const drop = useFileDrop((files) => addImages(files), { accept: "image/", disabled: !canEdit || !!busy, onReject: () => toast.error(t("ลากได้เฉพาะรูป · วิดีโอให้วางเป็นลิงก์", "Images only — paste videos as links")) });

  const count = (f: Filter) => (f === "all" ? refs.length : refs.filter((r) => r.kind === f).length);
  const shown = filter === "all" ? refs : refs.filter((r) => r.kind === filter);
  const FILTERS: [Filter, string, string][] = [["all", "ทั้งหมด", "All"], ["image", "รูป", "Images"], ["link", "วิดีโอ/ลิงก์", "Videos/links"], ["text", "ข้อความ", "Notes"]];

  return (
    <div className="space-y-3" onPaste={onPaste}>
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(([k, th, en]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
            className={`h-7 px-2.5 rounded-full border text-xs ${filter === k ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {t(th, en)} {count(k)}
          </button>
        ))}
        {busy && <span className="ml-auto text-xs text-violet-700">{busy}</span>}
        {albumId && canEdit && (
          <button type="button" onClick={() => setPickerOpen(true)} className={`${busy ? "" : "ml-auto"} inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700`}
            title={t("เลือก Reference ที่เก็บไว้ในคลังกลาง มาใส่รายการนี้ได้เลย (ไม่ต้องอัปใหม่)", "Pick saved references from the central library")}>
            <Icon name="bookmark" />{t("หยิบจากคลัง Ref", "Pick from library")}
          </button>
        )}
      </div>
      {albumId && pickerOpen && (
        <RefLibraryPicker albumId={albumId} brandId={brandId} haveIds={haveLibraryIds} onClose={() => setPickerOpen(false)}
          onAdded={() => { setPickerOpen(false); onChanged(); }} />
      )}

      {canEdit && (
        <div className={`grid gap-2 ${compact ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 md:grid-cols-3"}`}>
          <div {...drop.zone("refs")} className={`rounded-lg border-2 border-dashed p-3 text-center text-xs ${drop.over === "refs" ? "border-violet-400 bg-violet-50" : "border-slate-200 text-slate-500"}`}>
            <Icon name="image" size={18} />
            <p className="mt-1">{t("ลากรูปมาวาง หรือกด Ctrl+V วางรูปจากคลิปบอร์ด", "Drop images, or Ctrl+V to paste")}</p>
            <label className="mt-1.5 inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-slate-50">
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addImages([...(e.target.files ?? [])]); e.target.value = ""; }} />
              <Icon name="add" />{t("เลือกรูป", "Choose images")}
            </label>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Icon name="link" />{t("ลิงก์วิดีโอ/โพสต์ (TikTok · YouTube · IG · Pinterest)", "Video/post link (TikTok · YouTube · IG · Pinterest)")}</p>
            <input value={link} onChange={(e) => { setLink(e.target.value); setLinkErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
              placeholder="https://www.tiktok.com/@…/video/…" className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300" />
            {linkErr && <p className="text-xs text-red-600 mt-1">{linkErr}</p>}
            <button type="button" onClick={() => addLink()} disabled={!!busy} className="mt-1.5 h-7 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t("เพิ่มลิงก์", "Add link")}</button>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Icon name="note" />{t("ข้อความ / โน้ต", "Text / note")}</p>
            <input value={text} onChange={(e) => { setText(e.target.value); setTextErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") addText(); }}
              placeholder={t("เช่น มุมต่ำ เดินเข้ากล้อง แสงเย็น", "e.g. low angle, walking in, cool light")} className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300" />
            {textErr && <p className="text-xs text-red-600 mt-1">{textErr}</p>}
            <button type="button" onClick={addText} disabled={!!busy} className="mt-1.5 h-7 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t("เพิ่มโน้ต", "Add note")}</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">{refs.length ? t("ไม่มี Reference ชนิดนี้", "No references of this kind") : emptyText ? emptyText : albumId ? t("ยังไม่มี Reference — เพิ่มรูป ลิงก์วิดีโอ หรือข้อความ หรือกด \"หยิบจากคลัง Ref\" ให้ทีมถ่ายเห็นภาพเดียวกัน", "No references yet — add images, video links, notes, or pick from the library") : t("ไม่มี Reference ในคลังที่ตรงกับตัวกรอง", "No library references match")}</p>
      ) : (
        <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
          {shown.map((r) => {
            const prov = (r.provider ?? "web") as RefProvider;
            const embed = r.kind === "link" && r.url ? refEmbedUrl(r.url) : null;
            return (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col">
                {r.kind === "image" && r.r2_key && <FileThumb r2Key={r.r2_key} type="image" width={480} className="aspect-[4/5]" />}
                {r.kind === "link" && (playing === r.id && embed ? (
                  <div className="relative bg-black" style={{ aspectRatio: String(embed.ratio) }}>
                    <iframe src={embed.src} title={r.title ?? r.url ?? ""} className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                  </div>
                ) : (
                  <button type="button" onClick={() => (embed ? setPlaying(r.id) : window.open(r.url ?? "", "_blank", "noopener"))}
                    className="relative aspect-[4/5] bg-slate-800 text-white grid place-items-center overflow-hidden">
                    {r.thumb_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumb_url} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                    )}
                    <span className="relative flex flex-col items-center gap-1 text-xs">
                      {prov === "web" ? <Icon name="web" size={24} /> : <PlatformIcon code={prov} iconKey={platMeta.get(prov)?.icon_key} size={24} />}
                      <span className="inline-flex items-center gap-1 px-1.5 rounded bg-black/55"><Icon name={embed ? "play" : "open"} size={11} />{embed ? t("เล่นในหน้านี้", "Play here") : t("เปิดลิงก์", "Open link")}</span>
                    </span>
                  </button>
                ))}
                {r.kind === "text" && (
                  <div className="aspect-[4/5] bg-slate-50 p-3 text-sm text-slate-700 leading-relaxed overflow-auto whitespace-pre-line"><Icon name="note" className="text-slate-400 mr-1" />{r.body}</div>
                )}
                <div className="p-2 flex gap-1.5 items-start">
                  <div className="min-w-0 flex-1 text-xs">
                    {r.kind === "link" && (
                      <a href={r.url ?? "#"} target="_blank" rel="noreferrer" className="block truncate font-medium text-slate-700 hover:text-violet-700" title={r.url ?? ""}>
                        {REF_PROVIDER_META[prov].label}{r.title ? ` · ${r.title}` : ""}
                      </a>
                    )}
                    {editNote?.id === r.id ? (
                      <input autoFocus value={editNote.value} onChange={(e) => setEditNote({ id: r.id, value: e.target.value })} onBlur={saveNote}
                        onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") setEditNote(null); }}
                        className="w-full h-7 px-1.5 rounded border border-violet-300 text-xs focus:outline-none" placeholder={t("ชอบตรงไหน", "What you like")} />
                    ) : r.kind !== "text" && (
                      <button type="button" disabled={!canEdit} onClick={() => setEditNote({ id: r.id, value: r.note ?? "" })}
                        className={`block w-full text-left truncate ${r.note ? "text-slate-700" : "text-slate-400"} ${canEdit ? "hover:text-violet-700" : ""}`}>
                        {r.note ? r.note : canEdit ? t("+ ชอบตรงไหน", "+ What you like") : ""}
                      </button>
                    )}
                  </div>
                  {albumId && (r.library_id ? (
                    <span title={t("อยู่ในคลัง Ref แล้ว", "In the library")} aria-label={t("อยู่ในคลัง Ref แล้ว", "In the library")} className="w-6 h-6 grid place-items-center rounded text-amber-500 shrink-0"><Icon name="star" size={13} /></span>
                  ) : canEdit && (
                    <button type="button" onClick={() => void saveToLibrary(r)} disabled={saving === r.id} aria-label={t("เก็บเข้าคลัง Ref", "Save to library")} title={t("เก็บเข้าคลัง Ref (รายการอื่นหยิบไปใช้ได้)", "Save to the library for reuse")}
                      className="w-6 h-6 grid place-items-center rounded text-slate-300 hover:text-amber-500 hover:bg-amber-50 shrink-0 disabled:opacity-50"><Icon name="star" size={13} /></button>
                  ))}
                  {canRemove && <button type="button" onClick={() => void remove(r)} aria-label={t("ลบ", "Delete")} className="w-6 h-6 grid place-items-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"><Icon name="delete" size={13} /></button>}
                </div>
                {tileExtra?.(r)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { RefTile } from "./ref-tile";
