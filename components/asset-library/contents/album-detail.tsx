"use client";

/**
 * หน้าในอัลบั้ม Contents (ป๊อปเต็มจอ)
 *   ที่อยู่ใน Drive · กริดไฟล์อยู่บนสุด (โชว์เต็มรูป ไม่ครอป · ลากเรียงลำดับ/‹ › → content_albums.file_order) + ลากไฟล์มาวาง (ตัวจริงขึ้น Drive ทีละชิ้น วิ่งเบื้องหลัง ปิดป๊อปได้) · กริดไฟล์ (เลือกใช้ / ตั้งปก / ใช้แล้วที่โพสต์ไหน / หายจาก Drive)
 *   ข้อมูลอัลบั้มแก้ในหน้าเลย (ชุดช่องกลาง AlbumInfoFields · บันทึกเอง: ตัวเลือกบันทึกทันที · ข้อความบันทึกตอนออกจากช่อง)
 *   แคปชั่นแยกแพลตฟอร์ม = การ์ดเดียวกับหน้าลงโพสต์ (CaptionCard โหมด draft) → content_albums.caption_drafts (บันทึกเองหลังพิมพ์ 0.8 วิ) · AI เขียนรายแพลตฟอร์ม/ทุกแพลตฟอร์ม
 *   สถานะต่อแพลตฟอร์ม + โพสต์ที่สร้างจากอัลบั้ม
 *   ส่งเข้าปฏิทิน: เลือกวันก่อน (ContentDatePickModal · เห็นโพสต์เดิมของแบรนด์แต่ละวัน) → ป๊อปสร้างโพสต์กลาง ContentCreateModal ที่ใส่วัน + ข้อมูลจากอัลบั้มให้แล้ว
 *     (แบรนด์ · ชื่อ · แพลตฟอร์ม · ประเภท · ไฟล์ที่เลือก · แคปชั่นร่าง · สินค้าที่แท็ก — ไม่ได้แท็ก = เดาจากรหัสในชื่ออัลบั้ม)
 *   ช่วยคัดรูป (เบลอ/คล้าย · ./cull) · ดาวน์โหลดทั้งอัลบั้มเป็น zip (lib/zip)
 * หน้าตาแบบ B (เจ้าของเลือก 2026-11-20): รูปซ้าย · ข้อมูล/แคปชั่น/Reference/ลงแล้ว แถบขวา (จอเล็กย้ายไปใต้รูป) · ลบ/ปิดอัลบั้มอยู่ในเมนู "เพิ่มเติม"
 *   ติ๊กมุมรูป = เลือกใช้ → แถบคำสั่ง BulkActionBar (inline) · แตะรูป = ImageLightbox · ขนาดรูป gallery-columns · วิธีใช้ = InfoHint
 *   เอาไฟล์ออก / ล้างที่เลือก / ตั้งปก → ปุ่ม "ย้อนกลับ" ในแจ้งเตือน (toast.undo · ไฟล์ใส่กลับผ่าน POST files restore)
 * ใช้ของกลาง: ERPModal · ConfirmDialog · BulkActionBar · ImageLightbox · useGalleryColumns · InfoHint · Popover · UploadProgress · runBackgroundTask · ContentCreateModal · ContentDatePickModal · useDragReorder · findParentSkuByCode · askDuplicateUploads (ผ่าน ./data)
 * สิทธิ์: แก้/อัป assets.upload · ลบไฟล์ assets.delete · ลบอัลบั้ม assets.manage · สร้างโพสต์ tasks.create
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { UploadProgress } from "@/components/upload-progress";
import { r2ImageUrl } from "@/lib/r2-image";
import { posterFromImageFile, posterFromVideoElement, type VideoPoster } from "@/lib/video-poster";
import { downloadImagesAsZip } from "@/lib/zip";
import { askConfirm } from "@/components/modal/ask-dialog";
import { analyzeAlbumPhotos } from "./cull";
import { RefBoard } from "./ref-board";
import { formatBytes } from "@/lib/assets";
import { useCreativeOptions } from "@/app/tasks/use-options";
import { listCampaigns, getCaptionTemplates, getPlatformSettings, type BrandOption, type CaptionTemplate, type ContentCaption, type PlatformSettings, type ShopChannel } from "@/app/tasks/data";
import { CaptionCard, PullCaptionModal } from "@/app/tasks/content/caption-card";
import { captionForPlatform, type AlbumCaptionDrafts } from "@/lib/content-album-captions";
import { ContentDatePickModal } from "@/app/tasks/content/content-date-pick";
import { findParentSkuByCode } from "@/components/pickers";
import { codeLike } from "@/lib/website-image-match";
import type { ContentCreatePreset } from "@/app/tasks/content/content-create-modal";
import { useFileDrop } from "@/components/file-drop";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import { InfoHint } from "@/components/info-hint";
import { Popover } from "@/components/popover";
import { getContentAlbum, getAlbumDriveInfo, updateContentAlbum, trashContentAlbum, removeAlbumFile, restoreAlbumFile, startAlbumUploadTask, onAlbumUpload, syncAlbumDrive, aiAlbumCaption, setAlbumFileCover,
  albumPostPreset, pendingUploadsFor, clearPendingUploads,
  type AlbumDetail, type AlbumDriveInfo, type AlbumFile, type AlbumUploadStep, type PendingUpload } from "./data";
import { StageBadge, PlatChip, FileThumb, PickMediaButtons, isAlbumMedia, ALBUM_ACCEPT } from "./album-bits";
import { AlbumInfoFields, albumInfoFrom, albumInfoPayload, type AlbumInfoForm } from "./album-info-fields";

const ContentCreateModal = nextDynamic(() => import("@/app/tasks/content/content-create-modal").then((m) => m.ContentCreateModal), { ssr: false });
const SYNC_ROUNDS = 15;   // ดึงไฟล์จาก Drive ครั้งละไม่กี่ไฟล์ → วนซ้ำจนครบ (กันค้างนานเกินในคำขอเดียว)
const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;

export function AlbumDetailModal({ albumId, brands, onClose, onChanged }: {
  albumId: string;
  brands: BrandOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const { platforms } = useCreativeOptions();
  const platMeta = useMemo(() => new Map(platforms.map((p) => [p.value, p])), [platforms]);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drive, setDrive] = useState<AlbumDriveInfo | null>(null);
  const [step, setStep] = useState<AlbumUploadStep | null>(null);
  const [viewFile, setViewFile] = useState<AlbumFile | null>(null);
  // 🎬 ปกคลิป (เลือกเฟรมจากวิดีโอที่เปิดดู / อัปรูปเอง)
  const viewVideoRef = useRef<HTMLVideoElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [delFile, setDelFile] = useState<AlbumFile | null>(null);
  const [delDrive, setDelDrive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [postPreset, setPostPreset] = useState<ContentCreatePreset | null>(null);
  /** ส่งเข้าปฏิทิน: ขั้นเลือกวันก่อน (เตรียมค่าตั้งต้นไว้ระหว่างเลือก) */
  const [datePick, setDatePick] = useState<ContentCreatePreset | null>(null);
  const [postDate, setPostDate] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showRefs, setShowRefs] = useState(false);
  const [zipMsg, setZipMsg] = useState<string | null>(null);
  const [cullMsg, setCullMsg] = useState<string | null>(null);
  const [cull, setCull] = useState<{ blurry: Set<string>; groupOf: Map<string, number>; groups: number; keep: string[]; checked: number } | null>(null);
  const canEdit = can("assets.upload");
  const refreshPending = useCallback(() => setPending(pendingUploadsFor(albumId)), [albumId]);
  useEffect(() => { refreshPending(); }, [refreshPending]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const a = await getContentAlbum(albumId);
      setAlbum(a);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [albumId]);
  const loadDrive = useCallback(() => { getAlbumDriveInfo(albumId).then(setDrive).catch((e) => setDrive({ ok: false, reason: (e as Error).message })); }, [albumId]);
  useEffect(() => { void load(); loadDrive(); }, [load, loadDrive]);

  const patch = async (fields: Parameters<typeof updateContentAlbum>[1], okMsg?: string) => {
    try {
      await updateContentAlbum(albumId, fields);
      if (okMsg) toast.success(okMsg);
      await load(true); onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };

  // ── ข้อมูลอัลบั้ม (แก้ในหน้า · บันทึกเอง) + แคปชั่นแยกแพลตฟอร์ม ──
  const [info, setInfo] = useState<AlbumInfoForm | null>(null);
  const infoRef = useRef(info);
  infoRef.current = info;
  const [drafts, setDrafts] = useState<AlbumCaptionDrafts>({});
  const draftsRef = useRef(drafts);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [capTpl, setCapTpl] = useState<{ templates: CaptionTemplate[]; shop: ShopChannel[] }>({ templates: [], shop: [] });
  const [pset, setPset] = useState<PlatformSettings>({});
  const [openPlats, setOpenPlats] = useState<Set<string>>(new Set());
  const [pullTo, setPullTo] = useState<string | null>(null);
  const [aiPlat, setAiPlat] = useState<string | null>(null);   // แพลตฟอร์มที่ AI กำลังเขียน · "*" = ทุกแพลตฟอร์ม
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initFor = useRef<string | null>(null);
  // ตั้งค่าเริ่มจากอัลบั้มครั้งเดียวต่ออัลบั้ม (โหลดซ้ำหลังบันทึก ไม่ทับที่กำลังพิมพ์)
  useEffect(() => {
    if (!album || initFor.current === album.id) return;
    initFor.current = album.id;
    setInfo(albumInfoFrom(album));
    setDrafts(album.caption_drafts ?? {});
    draftsRef.current = album.caption_drafts ?? {};
    setOpenPlats(new Set(album.planned_platforms.slice(0, 1)));
  }, [album]);
  const capBrand = album?.brand_id ?? null;
  useEffect(() => { getCaptionTemplates(capBrand).then((r) => setCapTpl({ templates: r.templates, shop: r.shop_channels })).catch(() => {}); }, [capBrand]);
  useEffect(() => { getPlatformSettings().then(setPset).catch(() => {}); }, []);
  const platLabel = (code: string) => platMeta.get(code)?.label ?? code;

  const saveFields = async (fields: Parameters<typeof updateContentAlbum>[1]) => {
    if (!Object.keys(fields).length) return;
    setSaveState("saving");
    try {
      await updateContentAlbum(albumId, fields);
      setSaveState("saved");
      await load(true); onChanged();
      if ("brand_id" in fields) loadDrive();
    } catch (e) { setSaveState("error"); toast.error((e as Error).message); }
  };
  // ตัวเลือก (แบรนด์/วัน/คน/แพลตฟอร์ม/สินค้า) บันทึกทันที · ข้อความ (ชื่อ/หมายเหตุ) บันทึกตอนออกจากช่อง
  const TEXT_KEYS: readonly string[] = ["name", "description", "caption_draft"];
  const changeInfo = (p: Partial<AlbumInfoForm>) => {
    setInfo((cur) => (cur ? { ...cur, ...p } : cur));
    const discrete = Object.fromEntries(Object.entries(p).filter(([k]) => !TEXT_KEYS.includes(k))) as Partial<AlbumInfoForm>;
    if (Object.keys(discrete).length) void saveFields(albumInfoPayload(discrete));
  };
  const commitText = () => {
    const f = infoRef.current;
    if (!f || !album) return;
    const p: Partial<AlbumInfoForm> = {};
    if (!f.name.trim()) setInfo((cur) => (cur ? { ...cur, name: album.name } : cur));
    else if (f.name.trim() !== album.name) p.name = f.name;
    if (f.description.trim() !== (album.description ?? "").trim()) p.description = f.description;
    if (Object.keys(p).length) void saveFields(albumInfoPayload(p));
  };

  // แคปชั่นแยกแพลตฟอร์ม — ตามแพลตฟอร์มที่เลือกไว้ (เรียงตามหน้าแพลตฟอร์มกลาง)
  const capPlatforms = useMemo(() => {
    const order = platforms.map((p) => p.value);
    return [...(info?.planned_platforms ?? [])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [info?.planned_platforms, platforms]);
  const capOf = (p: string): ContentCaption => {
    const d = captionForPlatform(drafts, album?.caption_draft, p);
    return { platform: p, caption: d?.caption ?? null, hashtags: d?.hashtags ?? null, ...(d?.caption_type ? { caption_type: d.caption_type } : {}) };
  };
  const saveDrafts = async () => {
    try {
      await updateContentAlbum(albumId, { caption_drafts: draftsRef.current });
      setSaveState("saved");
      await load(true); onChanged();
    } catch (e) { setSaveState("error"); toast.error((e as Error).message); }
  };
  const flushDrafts = () => { if (capTimer.current) { clearTimeout(capTimer.current); capTimer.current = null; void saveDrafts(); } };
  const setCap = (p: string, change: Partial<ContentCaption>) => {
    const cur = draftsRef.current;
    const base = captionForPlatform(cur, album?.caption_draft, p) ?? { caption: null, hashtags: null, caption_type: null };
    const next = { ...cur, [p]: {
      caption: change.caption !== undefined ? change.caption : base.caption,
      hashtags: change.hashtags !== undefined ? change.hashtags : base.hashtags,
      caption_type: change.caption_type !== undefined ? (change.caption_type ?? null) : base.caption_type,
    } };
    draftsRef.current = next;
    setDrafts(next);
    setSaveState("saving");
    if (capTimer.current) clearTimeout(capTimer.current);
    capTimer.current = setTimeout(() => { capTimer.current = null; void saveDrafts(); }, 800);
  };
  const togglePlat = (p: string) => setOpenPlats((cur) => { const n = new Set(cur); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const applyAll = async (from: string) => {
    const others = capPlatforms.filter((p) => p !== from);
    if (!others.length) return;
    if (!(await askConfirm({ title: t("ใช้แคปชั่นนี้กับแพลตฟอร์มอื่น?", "Use this caption on other platforms?"), message: t(`คัดลอกแคปชั่น + แฮชแท็กของ ${platLabel(from)} ไปทับ ${others.map(platLabel).join(", ")}`, `Copy ${platLabel(from)} caption + hashtags over ${others.map(platLabel).join(", ")}`), confirmText: t("ใช้กับทุกแพลตฟอร์ม", "Apply to all") }))) return;
    const src = capOf(from);
    for (const p of others) setCap(p, { caption: src.caption, hashtags: src.hashtags, caption_type: src.caption_type });
  };
  // ✨ AI เขียนให้แพลตฟอร์มเดียว (prompt + ลิมิตของแพลตฟอร์มนั้น) — บันทึกเหมือนพิมพ์เอง
  const aiWrite = async (p: string) => {
    const r = await aiAlbumCaption(albumId, "", p);
    setCap(p, { caption: r.caption, hashtags: r.hashtags.join(" ") || null });
    return r;
  };
  const aiFor = async (p: string) => {
    if ((capOf(p).caption ?? "").trim() && !(await askConfirm({ title: t(`ให้ AI เขียนทับแคปชั่น ${platLabel(p)}?`, `Rewrite the ${platLabel(p)} caption?`), message: t("ข้อความเดิมของแพลตฟอร์มนี้จะถูกแทนที่ · มีค่าใช้จ่ายเล็กน้อยต่อครั้ง", "The current text is replaced · small cost per use"), confirmText: t("เขียนใหม่", "Rewrite") }))) return;
    setAiPlat(p);
    try {
      const r = await aiWrite(p);
      toast.success(r.images_used ? t(`AI เขียน ${platLabel(p)} จาก ${r.images_used} รูปแล้ว — ตรวจทานได้เลย`, `AI wrote ${platLabel(p)} from ${r.images_used} photo(s)`) : t(`AI เขียน ${platLabel(p)} แล้ว (ไม่มีรูปให้ดู)`, `AI wrote ${platLabel(p)} (no photos)`));
    } catch (e) { toast.error((e as Error).message); }
    finally { setAiPlat(null); }
  };
  const aiAll = async () => {
    const usable = capPlatforms.filter((p) => pset[p]?.use_caption !== false);
    const empty = usable.filter((p) => !(capOf(p).caption ?? "").trim());
    const targets = empty.length ? empty : usable;
    if (!targets.length) return;
    if (!(await askConfirm({ title: t("ให้ AI เขียนแคปชั่น", "AI write captions"),
      message: t(`${empty.length ? "เขียนให้แพลตฟอร์มที่ยังว่าง" : "เขียนทับทุกแพลตฟอร์ม"}: ${targets.map(platLabel).join(", ")} · เรียก AI ${targets.length} ครั้ง (มีค่าใช้จ่ายเล็กน้อยต่อครั้ง)`, `${empty.length ? "Fill empty" : "Rewrite all"}: ${targets.map(platLabel).join(", ")} · ${targets.length} AI call(s)`),
      confirmText: t("เขียนเลย", "Write") }))) return;
    setAiPlat("*");
    let ok = 0;
    for (const p of targets) {
      try { await aiWrite(p); ok++; } catch (e) { toast.error(`${platLabel(p)}: ${(e as Error).message}`); }
    }
    setAiPlat(null);
    setOpenPlats((cur) => new Set([...cur, ...targets]));
    if (ok) toast.success(t(`AI เขียนแล้ว ${ok} แพลตฟอร์ม — ตรวจทานได้เลย (บันทึกให้แล้ว)`, `AI wrote ${ok} platform(s) — saved`));
  };
  const applyCover = async (poster: VideoPoster | null) => {
    const f = viewFile;
    if (!f) return;
    if (!poster) { toast.error(t("ทำรูปปกไม่ได้ — ลองเลื่อนวิดีโอใหม่อีกที หรือกด “อัปรูปเป็นปก”", "Couldn't make the cover — scrub again or upload an image")); return; }
    setCoverBusy(true);
    try {
      const key = await setAlbumFileCover(albumId, f.id, poster.file);
      setViewFile((v) => (v && v.id === f.id ? { ...v, r2_key: key } : v));
      toast.success(t("ตั้งปกคลิปแล้ว", "Video cover set"));
      await load(true); onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setCoverBusy(false); }
  };
  const coverFromFrame = async () => {
    const el = viewVideoRef.current;
    if (!el || !viewFile) return;
    el.pause();
    await applyCover(await posterFromVideoElement(el, viewFile.file_name));
  };
  const closeAll = () => { flushDrafts(); commitText(); onClose(); };

  // ── อัปไฟล์ (วิ่งเบื้องหลัง — ปิดป๊อปได้ ดูความคืบหน้ามุมขวาล่าง) · ลากทั้งโฟลเดอร์ได้ ──
  const startUpload = (list: File[]) => {
    const files = list.filter(isAlbumMedia);
    if (!files.length) { toast.error(t("ลากได้เฉพาะรูปหรือวิดีโอ", "Only photos or videos")); return; }
    if (!album || !drive?.ok) return;
    startAlbumUploadTask({ albumId, albumName: album.name, files, existingKeys: album.files.map((f) => f.r2_key), onEnd: refreshPending });
  };
  const drop = useFileDrop((files) => startUpload(files), { accept: ALBUM_ACCEPT, folders: true, onReject: () => toast.error(t("ลากได้เฉพาะรูปหรือวิดีโอ", "Only photos or videos")) });
  // ความคืบหน้าการอัปของอัลบั้มนี้ (เริ่มจากในนี้ หรือจากหน้ารวมก็เห็น)
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  useEffect(() => onAlbumUpload((e) => {
    if (e.albumId !== albumId) return;
    if (e.step !== undefined) { setStep(e.step); refreshPending(); }
    if (e.fileDone) { void load(true); onChangedRef.current(); loadDrive(); refreshPending(); }
  }), [albumId, load, loadDrive, refreshPending]);

  // ↕ ลากเรียงลำดับไฟล์ (ลำดับนี้ใช้ตอนโชว์ · ส่งเข้าปฏิทิน · ดาวน์โหลด zip) — บันทึกทันที
  const moveFile = (from: number, to: number) => {
    if (!album || from === to) return;
    const next = moveItem(album.files, from, to);
    setAlbum({ ...album, files: next });
    void patch({ file_order: next.map((x) => x.id) });
  };
  const reorder = useDragReorder(moveFile, { group: `album-files:${albumId}` });

  // ── เลือกรูปที่จะใช้ · ติ๊กมุมซ้ายบนของรูป (แตะตัวรูป = ดูรูปใหญ่) · เลือกแล้วแถบคำสั่งโผล่ล่างกริด (BulkActionBar) ──
  // กดรัว ๆ ได้: อัปเดตบนจอทันที แล้วบันทึกรวดเดียวหลังหยุดแตะ (ไม่โหลดอัลบั้มใหม่ทับระหว่างแตะ)
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickIds = useRef<string[] | null>(null);
  const flushPicks = useCallback(() => {
    if (pickTimer.current) { clearTimeout(pickTimer.current); pickTimer.current = null; }
    const ids = pickIds.current; pickIds.current = null;
    if (!ids) return;
    updateContentAlbum(albumId, { picked_asset_ids: ids }).then(() => onChangedRef.current()).catch((e) => toast.error((e as Error).message));
  }, [albumId, toast]);
  const setPicks = (fn: (cur: Set<string>) => Set<string>) => {
    setAlbum((a) => {
      if (!a) return a;
      const next = fn(new Set(a.picked_asset_ids));
      const ids = a.files.filter((x) => next.has(x.id)).map((x) => x.id);
      pickIds.current = ids;
      return { ...a, picked_asset_ids: ids, files: a.files.map((x) => ({ ...x, picked: next.has(x.id) })) };
    });
    if (pickTimer.current) clearTimeout(pickTimer.current);
    pickTimer.current = setTimeout(flushPicks, 700);
  };
  const togglePick = (f: AlbumFile) => setPicks((cur) => { if (cur.has(f.id)) cur.delete(f.id); else cur.add(f.id); return cur; });
  const pickAll = (on: boolean) => setPicks(() => new Set(on ? (album?.files ?? []).map((x) => x.id) : []));
  // ✕ ล้างที่เลือก — ย้อนกลับได้ในแจ้งเตือนมุมจอ
  const clearPicks = () => {
    const before = album?.picked_asset_ids ?? [];
    if (!before.length) return;
    pickAll(false);
    toast.undo(t(`ล้างที่เลือกแล้ว ${before.length} ไฟล์`, `Cleared ${before.length} pick(s)`), () => setPicks(() => new Set(before)));
  };
  // ปิดหน้าไปก่อนบันทึก = บันทึกให้
  useEffect(() => () => flushPicks(), [flushPicks]);
  const setCover = (f: AlbumFile) => {
    const prev = album?.cover_asset_id ?? null;
    const next = prev === f.id ? null : f.id;
    void patch({ cover_asset_id: next }).then(() => toast.undo(next ? t("ตั้งปกอัลบั้มแล้ว", "Cover set") : t("เอาปกออกแล้ว", "Cover removed"), () => patch({ cover_asset_id: prev })));
  };

  // ── เอาไฟล์ออก (ทีละไฟล์ / ที่เลือกไว้) · ย้อนกลับได้: ใส่ไฟล์กลับ + คืนลำดับ/ที่เลือก/ปก ──
  type RemoveSnap = { ids: string[]; order: string[]; picked: string[]; cover: string | null };
  const snapFor = (ids: string[]): RemoveSnap => ({ ids, order: (album?.files ?? []).map((x) => x.id), picked: album?.picked_asset_ids ?? [], cover: album?.cover_asset_id ?? null });
  const undoRemove = async (s: RemoveSnap) => {
    try {
      for (const id of s.ids) await restoreAlbumFile(albumId, id);
      await updateContentAlbum(albumId, { file_order: s.order, picked_asset_ids: s.picked, cover_asset_id: s.cover });
      toast.success(t(`ใส่กลับแล้ว ${s.ids.length} ไฟล์`, `${s.ids.length} file(s) restored`));
    } catch (e) { toast.error((e as Error).message); }
    await load(true); onChanged();
  };
  const doDeleteFile = async () => {
    if (!delFile) return;
    setBusy(true);
    const snap = snapFor([delFile.id]);
    try {
      flushPicks();
      const r = await removeAlbumFile(albumId, delFile.id, delDrive);
      // ลบใน Drive แล้ว = ย้อนจากที่นี่ไม่ได้ (กู้ใน Drive ได้ 30 วัน แล้วกด "ดึงไฟล์ใหม่จาก Drive")
      if (r.drive_trashed) toast.success(t("เอาออกแล้ว · ไฟล์ใน Drive ไปถังขยะ (กู้คืนได้ใน Drive)", "Removed · Drive file moved to trash"));
      else toast.undo(t("เอาออกจากอัลบั้มแล้ว · ไฟล์ใน Drive ยังอยู่", "Removed · Drive file kept"), () => undoRemove(snap));
      setDelFile(null); setDelDrive(false); await load(true); onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const removePicked = async () => {
    if (!album) return;
    const ids = [...album.picked_asset_ids];
    if (!ids.length) return;
    if (!(await askConfirm({ title: t(`เอา ${ids.length} ไฟล์ที่เลือกออกจากอัลบั้ม?`, `Remove ${ids.length} picked file(s)?`), variant: "danger", confirmText: t("เอาออก", "Remove"),
      message: t("ไฟล์ใน Google Drive ยังอยู่ · โพสต์ที่ใช้ไฟล์ไปแล้วยังใช้ได้ · กด “ย้อนกลับ” ในแจ้งเตือนมุมจอได้", "Drive files are kept · existing posts keep working · undo from the notice") }))) return;
    const snap = snapFor(ids);
    flushPicks();
    setBusy(true);
    const done: string[] = [];
    try {
      for (const id of ids) { await removeAlbumFile(albumId, id, false); done.push(id); }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
    if (done.length) toast.undo(t(`เอาออกแล้ว ${done.length} ไฟล์`, `${done.length} file(s) removed`), () => undoRemove({ ...snap, ids: done }), { ms: 10000 });
    await load(true); onChanged();
  };
  const doTrashAlbum = async () => {
    setBusy(true);
    try { await trashContentAlbum(albumId); toast.success(t("ย้ายอัลบั้มไปถังขยะแล้ว (ไฟล์ใน Drive ไม่ถูกลบ)", "Album moved to trash (Drive files kept)")); onChanged(); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); setTrashOpen(false); }
  };

  const openPost = () => {
    if (!album) return;
    if (!campaigns.length) listCampaigns().then((cs) => setCampaigns(cs.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
    flushDrafts();
    const base = albumPostPreset({ ...album, caption_drafts: draftsRef.current, planned_platforms: infoRef.current?.planned_platforms ?? album.planned_platforms });
    setDatePick(base);
    // ยังไม่ได้แท็กสินค้า → เดาจากรหัสในชื่ออัลบั้ม (เช่น "ROAR06") ถ้าตรงรหัส Parent SKU เป๊ะ
    if (!base.parent) {
      const code = album.name.split(/\s+/).map((w) => codeLike(w)).find(Boolean);
      if (code) void findParentSkuByCode(code).then((p) => { if (p) setDatePick((cur) => (cur && !cur.parent ? { ...cur, parent: p } : cur)); });
    }
  };

  // ดึงไฟล์ที่ใส่เองในโฟลเดอร์ Drive + ตรวจไฟล์ที่หาย (วนทีละชุดจนครบ)
  const syncDrive = async () => {
    setSyncing(t("กำลังดูโฟลเดอร์ Drive...", "Checking the Drive folder..."));
    let added = 0, missing = 0, restored = 0;
    try {
      for (let round = 0; round < SYNC_ROUNDS; round++) {
        const r = await syncAlbumDrive(albumId);
        added += r.added; missing = r.missing; restored += r.restored;
        if (r.added) { void load(true); onChanged(); }
        if (!r.remaining) break;
        setSyncing(t(`ดึงแล้ว ${added} ไฟล์ · เหลืออีก ${r.remaining}`, `${added} added · ${r.remaining} left`));
      }
      const parts = [added ? t(`ดึงไฟล์ใหม่ ${added} ไฟล์`, `${added} new file(s)`) : t("ไม่มีไฟล์ใหม่ในโฟลเดอร์", "No new files in the folder")];
      if (missing) parts.push(t(`${missing} ไฟล์หายจาก Drive`, `${missing} missing in Drive`));
      if (restored) parts.push(t(`${restored} ไฟล์กลับมาแล้ว`, `${restored} back again`));
      if (missing) toast.error(parts.join(" · ")); else toast.success(parts.join(" · "));
      await load(true); onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSyncing(null); }
  };

  // ⬇ ดาวน์โหลดรูปทั้งอัลบั้ม (ต้นฉบับจาก Drive · ไฟล์ใหญ่เกิน 30MB ใช้รูปย่อ) — วิดีโอไม่รวม (เปิดจาก Drive)
  const downloadZip = async () => {
    if (!album) return;
    const photos = (album.picked_asset_ids.length ? album.files.filter((f) => f.picked) : album.files).filter((f) => f.asset_type !== "video");
    if (!photos.length) { toast.error(t("ไม่มีรูปให้ดาวน์โหลด (วิดีโอเปิดจาก Drive)", "No photos to download (open videos in Drive)")); return; }
    const big = 30 * 1024 * 1024;
    const useOriginal = (f: AlbumFile) => !!f.drive_file_id && !f.drive_missing && (f.size_bytes ?? 0) <= big;
    const total = photos.reduce((n, f) => n + (useOriginal(f) ? f.size_bytes ?? 0 : 0), 0);
    if (total > 600 * 1024 * 1024 && !(await askConfirm({ title: t("ไฟล์รวมใหญ่มาก", "Very large download"), message: t(`รวมราว ${Math.round(total / 1048576)} MB อาจใช้เวลานานและกินหน่วยความจำเครื่อง — ดาวน์โหลดต่อไหม?`, `About ${Math.round(total / 1048576)} MB — continue?`), confirmText: t("ดาวน์โหลด", "Download") }))) return;
    setZipMsg(t("กำลังเตรียม…", "Preparing…"));
    try {
      const n = await downloadImagesAsZip(photos.map((f) => ({
        url: useOriginal(f) ? `/api/drive-video/${f.drive_file_id}` : (r2ImageUrl(f.r2_key) ?? ""),
        name: f.file_name,
      })), album.name || "album", (d, tot) => setZipMsg(t(`กำลังโหลด ${d}/${tot}`, `Downloading ${d}/${tot}`)));
      if (!n) toast.error(t("โหลดรูปไม่ได้เลย ลองใหม่อีกครั้ง", "Couldn't download any photo"));
      else toast.success(t(`ดาวน์โหลด ${n} รูปแล้ว${album.video_count ? ` (วิดีโอ ${album.video_count} ไฟล์ เปิดจาก Drive)` : ""}`, `${n} photo(s) downloaded`));
    } catch (e) { toast.error((e as Error).message); }
    finally { setZipMsg(null); }
  };

  // 🔍 ช่วยคัดรูป: รูปอาจเบลอ + รูปคล้ายกัน (ถ่ายรัว) → แนะนำรูปที่ควรเก็บ (ไม่มีค่าใช้จ่าย)
  const runCull = async () => {
    if (!album) return;
    setCullMsg(t("กำลังดูรูป…", "Checking photos…"));
    try {
      const r = await analyzeAlbumPhotos(album.files, (d, tot) => setCullMsg(t(`กำลังดูรูป ${d}/${tot}`, `Checking ${d}/${tot}`)));
      const groupOf = new Map<string, number>();
      r.groups.forEach((g, i) => g.forEach((id) => groupOf.set(id, i + 1)));
      setCull({ blurry: new Set(r.blurry), groupOf, groups: r.groups.length, keep: r.keep, checked: r.checked });
      if (!r.blurry.length && !r.groups.length) toast.success(t(`ดู ${r.checked} รูปแล้ว ไม่เจอรูปเบลอหรือรูปซ้ำ`, `Checked ${r.checked} photos — nothing to cull`));
    } catch (e) { toast.error((e as Error).message); }
    finally { setCullMsg(null); }
  };
  const applyCull = async () => {
    if (!album || !cull) return;
    // วิดีโอไม่ได้ถูกตรวจ → คงสถานะเลือกเดิมของวิดีโอไว้
    const keep = [...cull.keep, ...album.files.filter((f) => f.asset_type === "video" && f.picked).map((f) => f.id)];
    if (album.picked_asset_ids.length && !(await askConfirm({ title: t("แทนรูปที่เลือกไว้?", "Replace current picks?"), message: t(`ตอนนี้เลือกไว้ ${album.picked_asset_ids.length} ไฟล์ — จะเปลี่ยนเป็น ${keep.length} ไฟล์ตามที่แนะนำ`, `Currently ${album.picked_asset_ids.length} picked — switch to ${keep.length} suggested`), confirmText: t("ใช้ตามที่แนะนำ", "Use suggestions") }))) return;
    await patch({ picked_asset_ids: keep }, t(`เลือกใช้ ${keep.length} ไฟล์ตามที่แนะนำแล้ว`, `${keep.length} file(s) picked`));
    setCull(null);
  };

  const files = album?.files ?? [];
  const pickedCount = album?.picked_asset_ids.length ?? 0;
  // ขนาดรูปในกริด (ของกลาง gallery-columns · จำรายคน · Ctrl+ลูกกลิ้งบนกริด = ย่อ/ขยาย)
  const gallery = useGalleryColumns("content-album-files", 4, "0.5rem");
  // ดูรูปใหญ่ (ของกลาง ImageLightbox · เลื่อนซ้าย-ขวา) — เฉพาะรูป · คลิปเปิดตัวเล่นวิดีโอ (ตั้งปกคลิปจากเฟรมได้)
  const photos = useMemo(() => files.filter((f) => f.asset_type !== "video"), [files]);
  const [lightIdx, setLightIdx] = useState(-1);
  const lightImages = useMemo<LightboxImage[]>(() => photos.map((f) => ({
    url: (f.drive_file_id ? r2ImageUrl(`drive:${f.drive_file_id}`, 2000) : r2ImageUrl(f.r2_key, 1600)) ?? "",
    thumbUrl: r2ImageUrl(f.r2_key, 240) ?? null,
    label: f.file_name,
  })), [photos]);
  const openFile = (f: AlbumFile) => { if (f.asset_type === "video") setViewFile(f); else setLightIdx(photos.findIndex((x) => x.id === f.id)); };
  const lightFile = lightIdx >= 0 ? photos[lightIdx] ?? null : null;
  const linkBtn = "inline-flex items-center gap-1 text-violet-700 hover:underline disabled:opacity-60";
  const toolBtn = "inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60";
  const darkBtn = "h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-white/20 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50";
  return (
    <ERPModal open onClose={closeAll} title={album?.name || t("อัลบั้ม", "Album")} size="xl" storageKey="content-album-detail"
      footer={album ? (
        <div className="flex flex-wrap items-center gap-2 w-full">
          {/* ลบ / ปิดอัลบั้ม อยู่ในเมนู ⋯ (กันกดโดนพลาด) */}
          {(canEdit || can("assets.manage")) && (
            <Popover panelClassName="w-60 p-1"
              trigger={(toggle) => (
                <button onClick={toggle} aria-label={t("เมนูเพิ่มเติม", "More")} title={t("ปิดอัลบั้ม / ลบอัลบั้ม", "Close / delete album")}
                  className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"><Icon value="i:dots-vertical" />{t("เพิ่มเติม", "More")}</button>
              )}>
              {(close) => (
                <div className="flex flex-col text-sm">
                  {canEdit && (
                    <button onClick={() => { close(); void patch({ closed: !album.closed_at }, album.closed_at ? t("เปิดอัลบั้มอีกครั้งแล้ว", "Album reopened") : t("ปิดอัลบั้มแล้ว", "Album closed")); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-left text-slate-700 hover:bg-slate-50">
                      <Icon name={album.closed_at ? "refresh" : "done"} />{album.closed_at ? t("เปิดอัลบั้มอีกครั้ง", "Reopen album") : t("ปิดอัลบั้ม (จบแล้ว)", "Close album (done)")}
                    </button>
                  )}
                  {can("assets.manage") && (
                    <button onClick={() => { close(); setTrashOpen(true); }} className="flex items-center gap-2 px-3 py-2 rounded-md text-left text-red-600 hover:bg-red-50">
                      <Icon name="delete" />{t("ลบอัลบั้ม (ไปถังขยะ)", "Delete album (to trash)")}
                    </button>
                  )}
                </div>
              )}
            </Popover>
          )}
          {album.closed_at && <span className="text-xs text-slate-500">{t("อัลบั้มนี้ปิดแล้ว", "This album is closed")}</span>}
          <span className="flex-1" />
          <button onClick={closeAll} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {can("tasks.create") && (
            <button onClick={openPost} disabled={!files.length}
              title={!files.length ? t("ยังไม่มีไฟล์ในอัลบั้ม", "No files yet") : undefined}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
              <Icon name="calendar" />{pickedCount ? t(`ส่งเข้าปฏิทิน (${pickedCount})`, `Send to calendar (${pickedCount})`) : t("ส่งเข้าปฏิทิน", "Send to calendar")}
            </button>
          )}
        </div>
      ) : undefined}>
      {loading && !album ? <LoadingState /> : error && !album ? <ErrorState hint={error} onRetry={() => void load()} /> : album && (
        <div className="space-y-3" {...drop.guard}>
          {/* หัวแถวเดียว: สถานะ · แบรนด์ · ที่อยู่ใน Drive · ปุ่ม Drive · บันทึกแล้ว */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <StageBadge stage={album.status.stage} />
            {album.brand_name && <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: album.brand_color || "#94a3b8" }} />{album.brand_name}</span>}
            {!drive ? <span className="text-xs text-slate-400">{t("กำลังดูโฟลเดอร์ Drive...", "Checking Drive folder...")}</span>
              : drive.ok ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-xs text-slate-500"><Icon name="folder" size={14} /><span className="min-w-0 break-words">Google Drive › {drive.label}{drive.pending ? t(" (สร้างให้ตอนอัปไฟล์แรก)", " (created on first upload)") : ""}</span></span>
              ) : <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-800"><Icon name="warning" size={14} />{drive.reason}</span>}
            <span className="ml-auto flex flex-wrap items-center gap-3 text-xs">
              {saveState !== "idle" && (
                <span className={`inline-flex items-center gap-1 ${saveState === "error" ? "text-red-600" : saveState === "saving" ? "text-slate-500" : "text-emerald-600"}`}>
                  <Icon name={saveState === "error" ? "warning" : saveState === "saving" ? "waiting" : "done"} />
                  {saveState === "error" ? t("บันทึกไม่สำเร็จ", "Save failed") : saveState === "saving" ? t("กำลังบันทึก…", "Saving…") : t("บันทึกแล้ว", "Saved")}
                </span>
              )}
              {drive?.ok && canEdit && drive.folder_url && (
                <button onClick={() => void syncDrive()} disabled={!!syncing} title={t("ไฟล์ที่อัปเองผ่านแอป Google Drive เข้าโฟลเดอร์นี้ + ตรวจไฟล์ที่ถูกลบใน Drive", "Files added straight to this Drive folder + check for files deleted in Drive")}
                  className={linkBtn}><Icon name="refresh" />{syncing ?? t("ดึงไฟล์ใหม่จาก Drive", "Pull from Drive")}</button>
              )}
              {drive?.ok && drive.folder_url && <a href={drive.folder_url} target="_blank" rel="noreferrer" className={linkBtn}><Icon name="open" />{t("เปิดใน Drive", "Open in Drive")}</a>}
            </span>
          </div>
          {files.some((f) => f.drive_missing) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              <Icon name="warning" />{t(`${files.filter((f) => f.drive_missing).length} ไฟล์หายจาก Drive (ถูกลบหรืออยู่ในถังขยะ) — โพสต์ที่ใช้ไฟล์นี้จะโพสต์ไม่ได้ · กู้คืนใน Drive แล้วกด “ดึงไฟล์ใหม่จาก Drive” หรือเอาไฟล์ออกจากอัลบั้ม`, `${files.filter((f) => f.drive_missing).length} file(s) missing in Drive — posts using them will fail · restore in Drive then pull again, or remove them`)}
            </div>
          )}
          {pending.length > 0 && canEdit && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
              <Icon name="waiting" />
              <span className="min-w-0 flex-1">{t(`อัปค้าง ${pending.length} ไฟล์ (${pending.map((p) => p.name).join(", ")}) — ลากไฟล์เดิมมาวางอีกครั้ง ระบบจะส่งต่อจากที่ค้าง ไม่ต้องเริ่มใหม่`, `${pending.length} unfinished upload(s) (${pending.map((p) => p.name).join(", ")}) — drop the same files again to resume`)}</span>
              <button onClick={() => { clearPendingUploads(albumId); refreshPending(); }} className="text-xs text-amber-700 hover:underline">{t("ล้างรายการ", "Clear")}</button>
            </div>
          )}

          {/* แบบ B: รูปซ้าย · ข้อมูล/แคปชั่น/Reference/ลงแล้ว แถบขวา (จอเล็ก = แถบขวาย้ายไปใต้รูป) */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            {/* ── ซ้าย: ไฟล์ในอัลบั้ม ── */}
            <section className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-700">{t(`ไฟล์ (${files.length})`, `Files (${files.length})`)}</h3>
                {canEdit && files.length > 0 && (
                  <InfoHint label={t("วิธีใช้", "How to")}>
                    <span className="block space-y-1 text-xs">
                      <span className="block">{t("ติ๊กมุมซ้ายบน = เลือกรูปที่จะใช้ (ส่งเข้าปฏิทิน / ดาวน์โหลด / AI ใช้เฉพาะที่เลือก)", "Tick the top-left box = pick (calendar / download / AI use picks only)")}</span>
                      <span className="block">{t("แตะรูป = ดูรูปใหญ่ เลื่อนซ้าย-ขวาได้ · คลิป = เล่น + ตั้งปกคลิปจากเฟรม", "Tap = view large, swipe left/right · videos: play + set cover from a frame")}</span>
                      <span className="block">{t("ดาว = ปกอัลบั้ม · กดค้างที่รูปแล้วลาก (หรือ ‹ ›) = เรียงลำดับ", "Star = album cover · hold and drag (or ‹ ›) = reorder")}</span>
                      <span className="block">{t("Ctrl + หมุนลูกกลิ้งบนรูป = ย่อ/ขยายรูป", "Ctrl + scroll on the grid = resize")}</span>
                    </span>
                  </InfoHint>
                )}
                {pickedCount > 0 && <span className="text-xs text-violet-700">{t(`เลือกใช้ ${pickedCount}`, `${pickedCount} picked`)}</span>}
                {files.length > 0 && (
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    {canEdit && pickedCount < files.length && (
                      <button onClick={() => pickAll(true)} className={toolBtn}><Icon name="done" />{t("เลือกทั้งหมด", "Pick all")}</button>
                    )}
                    {canEdit && files.some((f) => f.asset_type !== "video") && (
                      <button onClick={() => void runCull()} disabled={!!cullMsg} title={t("หารูปที่อาจเบลอ + รูปคล้ายกันที่ถ่ายรัว แล้วแนะนำรูปที่ควรเก็บ (ไม่มีค่าใช้จ่าย)", "Find blurry and burst look-alike photos, suggest which to keep (free)")}
                        className={toolBtn}><Icon name="inspect" />{cullMsg ?? t("ช่วยคัดรูป", "Help me cull")}</button>
                    )}
                    <button onClick={() => void downloadZip()} disabled={!!zipMsg} title={t("รูปต้นฉบับทั้งอัลบั้ม (หรือเฉพาะที่เลือกใช้) เป็นไฟล์ zip · วิดีโอเปิดจาก Drive", "All photos (or picked ones) as a zip · videos stay in Drive")}
                      className={toolBtn}><Icon name="download" />{zipMsg ?? (pickedCount ? t("zip ที่เลือก", "Zip picked") : t("zip ทั้งอัลบั้ม", "Zip all"))}</button>
                    <GalleryColumnsControl cols={gallery.cols} onChange={gallery.setCols} as="stepper" className="hidden sm:inline-flex" />
                  </span>
                )}
              </div>
              {cull && (cull.blurry.size > 0 || cull.groups > 0) && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sm text-sky-800">
                  <Icon name="inspect" />
                  <span className="min-w-0 flex-1">{t(`ดู ${cull.checked} รูป · อาจเบลอ ${cull.blurry.size} รูป · รูปคล้ายกัน ${cull.groups} ชุด → แนะนำเก็บ ${cull.keep.length} รูป (ชุดคล้ายเก็บรูปที่คมสุด)`, `${cull.checked} checked · ${cull.blurry.size} maybe blurry · ${cull.groups} look-alike sets → keep ${cull.keep.length}`)}</span>
                  {canEdit && <button onClick={() => void applyCull()} className="h-7 px-2.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700">{t("เลือกใช้ตามที่แนะนำ", "Pick suggested")}</button>}
                  <button onClick={() => setCull(null)} className="text-xs text-sky-700 hover:underline">{t("ปิด", "Dismiss")}</button>
                </div>
              )}
              {files.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">{t("ยังไม่มีไฟล์ — ลากรูป/วิดีโอมาวางที่ช่องด้านล่าง", "No files yet — drop photos/videos below")}</p>
              ) : (
                <div ref={gallery.wheelRef} style={gallery.gridStyle}>
                  {files.map((f, i) => {
                    const cover = album.cover_asset_id === f.id;
                    return (
                      <div key={f.id} {...(canEdit ? reorder.rowProps(i) : {})} className={`group relative rounded-lg overflow-hidden border bg-white ${f.picked ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200"} ${canEdit ? reorder.rowCls(i) : ""}`}>
                        <button onClick={() => openFile(f)} {...(canEdit ? reorder.handleProps(i) : {})} className={`block w-full ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`} title={canEdit ? t(`${f.file_name} · แตะ = ดูรูปใหญ่ · กดค้างแล้วลาก = เรียงลำดับ`, `${f.file_name} · tap to view · hold and drag to reorder`) : f.file_name}>
                          <FileThumb r2Key={f.r2_key} type={f.asset_type} duration={f.duration_sec} className="aspect-square" fit="contain" />
                        </button>
                        {canEdit && (
                          <>
                            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => togglePick(f)} aria-pressed={f.picked} aria-label={f.picked ? t("เลิกเลือก", "Unpick") : t("เลือกใช้", "Pick")} title={f.picked ? t("เลิกเลือก", "Unpick") : t("เลือกใช้รูปนี้", "Pick this")}
                              className={`absolute top-1 left-1 w-7 h-7 grid place-items-center rounded-full border-2 shadow-sm ${f.picked ? "bg-violet-600 border-violet-600 text-white" : "bg-white/70 border-white hover:bg-white"}`}>{f.picked && <Icon name="done" size={15} />}</button>
                            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setCover(f)} aria-label={cover ? t("ปกอัลบั้ม (กดเพื่อเอาออก)", "Cover (click to unset)") : t("ตั้งเป็นปก", "Set as cover")} title={cover ? t("ปกอัลบั้ม (กดเพื่อเอาออก)", "Cover (click to unset)") : t("ตั้งเป็นปก", "Set as cover")}
                              className={`absolute top-1 right-1 w-7 h-7 grid place-items-center rounded-md ${cover ? "bg-amber-400 text-white" : "bg-white/90 text-slate-400 [filter:grayscale(1)] opacity-70 sm:opacity-0 sm:group-hover:opacity-100"}`}><Icon name="star" size={14} /></button>
                          </>
                        )}
                        {canEdit && files.length > 1 && (
                          <>
                            {i > 0 && <button onPointerDown={(e) => e.stopPropagation()} onClick={() => moveFile(i, i - 1)} aria-label={t("เลื่อนไปก่อนหน้า", "Move earlier")}
                              className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-7 hidden sm:grid place-items-center rounded-md bg-white/90 text-slate-700 shadow sm:opacity-0 sm:group-hover:opacity-100">‹</button>}
                            {i < files.length - 1 && <button onPointerDown={(e) => e.stopPropagation()} onClick={() => moveFile(i, i + 1)} aria-label={t("เลื่อนไปถัดไป", "Move later")}
                              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-7 hidden sm:grid place-items-center rounded-md bg-white/90 text-slate-700 shadow sm:opacity-0 sm:group-hover:opacity-100">›</button>}
                          </>
                        )}
                        {can("assets.delete") && (
                          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { setDelFile(f); setDelDrive(false); }} aria-label={t("เอาออก", "Remove")} title={t("เอาออก", "Remove")}
                            className="absolute bottom-1 right-1 w-6 h-6 grid place-items-center rounded-md bg-white/90 text-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><Icon name="delete" size={14} /></button>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-0.5 p-1 pointer-events-none pr-8">
                          {f.drive_missing && <span className="px-1 rounded bg-red-600 text-white text-[10px]">{t("หายจาก Drive", "Missing in Drive")}</span>}
                          {cull?.blurry.has(f.id) && <span className="px-1 rounded bg-amber-500 text-white text-[10px]">{t("อาจเบลอ", "Blurry?")}</span>}
                          {cull?.groupOf.has(f.id) && <span className={`px-1 rounded text-white text-[10px] ${cull.keep.includes(f.id) ? "bg-sky-600" : "bg-slate-500"}`}>{t(`คล้าย #${cull.groupOf.get(f.id)}`, `Alike #${cull.groupOf.get(f.id)}`)}{cull.keep.includes(f.id) ? " ★" : ""}</span>}
                          {f.used_in.length > 0 && <span className="px-1 rounded bg-emerald-600 text-white text-[10px]" title={f.used_in.map((u) => u.label).filter(Boolean).join(", ")}>{t(`ใช้แล้ว ${f.used_in.length}`, `Used ${f.used_in.length}`)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ลากไฟล์มาวาง */}
              {canEdit && drive?.ok && !album.closed_at && (
                <div {...drop.zone("album")}
                  className={`rounded-xl border-2 border-dashed px-4 py-3 text-center transition ${drop.over === "album" ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"}`}>
                  <p className="text-sm text-slate-600 flex flex-wrap items-center justify-center gap-2">
                    <Icon name="upload" />{t("ลากรูป/วิดีโอ หรือทั้งโฟลเดอร์ มาวางที่นี่", "Drop photos/videos or whole folders here")}
                    <InfoHint label={t("เกี่ยวกับการอัป", "About uploads")}>{t("ไฟล์ตัวจริงขึ้น Google Drive (ไม่เกิน 5GB ต่อไฟล์) · ระบบเก็บแค่รูปย่อไว้โชว์ · อัปเบื้องหลัง ปิดหน้าต่างนี้ได้ · ถ้าเผลอปิดแท็บกลางคัน ลากไฟล์เดิมมาวางใหม่ = ส่งต่อจากที่ค้าง (เครื่องเดิม ภายใน 6 วัน)", "Originals go to Google Drive (≤5GB each) · only small previews stay here · runs in the background · closed the tab midway? drop the same files again to resume (same device, within 6 days)")}</InfoHint>
                  </p>
                  <PickMediaButtons onFiles={startUpload} className="mt-2 justify-center" />
                  {step && <UploadProgress name={step.name} size={step.size} pct={step.pct} label={step.label} count={{ current: step.current, total: step.total }} className="mt-3 text-left" />}
                </div>
              )}

              {/* แถบคำสั่งเมื่อเลือกรูป (ของกลาง BulkActionBar โหมดในป๊อป) */}
              {canEdit && (
                <BulkActionBar placement="inline" count={pickedCount} unit={t("ไฟล์", "file(s)")} onClear={clearPicks}
                  extra={pickedCount < files.length ? <button onClick={() => pickAll(true)} className="underline hover:text-white">{t(`เลือกทั้งหมด ${files.length}`, `Pick all ${files.length}`)}</button> : undefined}>
                  <button onClick={() => void downloadZip()} disabled={!!zipMsg} className={darkBtn}><Icon name="download" />{zipMsg ?? t("ดาวน์โหลด", "Download")}</button>
                  {pickedCount === 1 && (() => {
                    const only = files.find((x) => x.picked);
                    return only ? <button onClick={() => setCover(only)} className={darkBtn}><Icon name="star" />{album.cover_asset_id === only.id ? t("เอาปกออก", "Unset cover") : t("ตั้งเป็นปก", "Set cover")}</button> : null;
                  })()}
                  {can("assets.delete") && <button onClick={() => void removePicked()} disabled={busy} className={`${darkBtn} text-red-300`}><Icon name="delete" />{t("เอาออก", "Remove")}</button>}
                  {can("tasks.create") && <button onClick={openPost} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-500 text-xs font-medium text-white hover:bg-violet-400"><Icon name="calendar" />{t("ส่งเข้าปฏิทิน", "Send to calendar")}</button>}
                </BulkActionBar>
              )}
            </section>

            {/* ── ขวา: ข้อมูล · แคปชั่น · Reference · ลงแล้ว (PC ติดอยู่ข้างรูป เลื่อนในแถบได้) ── */}
            <aside className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto">
              {info && (
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-700">{t("ข้อมูลอัลบั้ม", "Album info")}</h3>
                    {canEdit && <InfoHint side="right">{t("แก้ตรงนี้ได้เลย · ตัวเลือกบันทึกทันที · ข้อความบันทึกตอนออกจากช่อง", "Edit here · choices save instantly · text saves when you leave the field")}</InfoHint>}
                  </div>
                  <AlbumInfoFields form={info} onChange={changeInfo} onBlurText={commitText} brands={brands} brandLocked={!!album.drive_folder_id} disabled={!canEdit} showCaption={false} columns={1} />
                </section>
              )}

              {/* แคปชั่นตามแพลตฟอร์ม — การ์ดเดียวกับหน้าลงโพสต์ (CaptionCard โหมด draft) */}
              <section className="space-y-2 border-t border-slate-200 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">{t("แคปชั่นตามแพลตฟอร์ม", "Captions by platform")}</h3>
                  <InfoHint side="right">{t("พิมพ์แล้วบันทึกให้เอง · ตอนส่งเข้าปฏิทิน แคปชั่นแต่ละแพลตฟอร์มติดไปกับโพสต์ให้", "Saves as you type · each platform's caption goes into the post")}</InfoHint>
                  {canEdit && can("ai.caption") && capPlatforms.length > 0 && (
                    <button onClick={() => void aiAll()} disabled={!!aiPlat || !files.length} title={t("AI ดูรูปที่เลือกใช้ (สูงสุด 4 รูป) + การ์ดรู้จักแบรนด์ แล้วเขียนให้ทีละแพลตฟอร์ม · มีค่าใช้จ่ายเล็กน้อยต่อครั้ง", "AI looks at up to 4 picked photos + the brand card, one call per platform")}
                      className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-violet-200 bg-white text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Icon name="ai" />{aiPlat === "*" ? t("AI กำลังเขียน…", "AI writing…") : t("AI เขียนทุกแพลตฟอร์ม", "AI write all")}</button>
                  )}
                </div>
                {capPlatforms.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("เลือก “ตั้งใจลงที่ไหน” ด้านบนก่อน แล้วจะมีช่องแคปชั่นของแต่ละแพลตฟอร์ม", "Pick “Planned platforms” above first")}</p>
                ) : (
                  <div className="space-y-2">
                    {capPlatforms.map((p) => (
                      <CaptionCard key={p} draft open={openPlats.has(p)} onToggle={() => togglePlat(p)} cap={capOf(p)} templates={capTpl.templates}
                        sharedVars={{ shop: capTpl.shop, fake_price: null, real_price: null, price: null, color: null, sku: null, product: album.products[0]?.name ?? null, link: null }}
                        brandId={album.brand_id} setting={pset[p]} onChange={canEdit ? (change) => setCap(p, change) : () => {}}
                        canAi={canEdit && can("ai.caption")} aiBusy={aiPlat === p || aiPlat === "*"} onAiWrite={() => void aiFor(p)}
                        onApplyAll={canEdit && capPlatforms.length > 1 ? (from) => void applyAll(from) : undefined}
                        onPullFrom={canEdit && capPlatforms.length > 1 ? () => setPullTo(p) : undefined}
                        pushToast={(type, m) => toast.show(m, type)} />
                    ))}
                  </div>
                )}
              </section>

              {/* Reference ที่ขอไว้ (ติดมาจากรายการที่อยากได้) — เทียบตอนคัดรูป */}
              <section className="space-y-2 border-t border-slate-200 pt-3">
                {album.refs.length > 0 || showRefs ? (
                  <>
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Icon name="pin" />{t("Reference ที่ขอไว้", "References")} <span className="text-slate-400 font-normal">{album.refs.length}</span></h3>
                    <RefBoard albumId={albumId} brandId={album.brand_id} refs={album.refs} canEdit={canEdit} onChanged={() => { void load(true); onChanged(); }} compact />
                  </>
                ) : canEdit ? (
                  <button onClick={() => setShowRefs(true)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50"><Icon name="pin" />{t("+ เพิ่ม Reference", "+ Add references")}</button>
                ) : <p className="text-sm text-slate-400">{t("ไม่มี Reference", "No references")}</p>}
              </section>

              {/* สถานะต่อแพลตฟอร์ม + โพสต์ */}
              <section className="space-y-2 border-t border-slate-200 pt-3">
                <h3 className="text-sm font-semibold text-slate-700">{t("ลงที่ไหนแล้วบ้าง", "Where it's posted")}</h3>
                {album.status.platforms.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("ยังไม่มีโพสต์ — เลือก “ตั้งใจลงที่ไหน” แล้วกด “ส่งเข้าปฏิทิน”", "No posts yet — pick platforms, then “Send to calendar”")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {album.status.platforms.map((p) => <PlatChip key={p.code} code={p.code} state={p.state} label={platMeta.get(p.code)?.label} iconKey={platMeta.get(p.code)?.icon_key} />)}
                  </div>
                )}
                {album.posts.length > 0 && (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {album.posts.map((p) => (
                      <li key={p.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${!p.is_active || p.status === "cancelled" ? "opacity-50" : ""}`}>
                        <a href={`/tasks/content-calendar?content=${p.id}`} target="_blank" rel="noreferrer" className="font-medium text-violet-700 hover:underline">{p.content_no ?? "—"}</a>
                        <span className="min-w-0 flex-1 truncate text-slate-700">{p.title}</span>
                        {p.scheduled_at && <span className="text-xs text-slate-500">{new Date(p.scheduled_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>}
                        <span className="flex gap-1">{p.platforms.map((code) => {
                          const st = p.post_status[code];
                          if (st === "skip") return null;
                          return <PlatChip key={code} code={code} state={st === "posted" ? "posted" : st === "scheduled" ? "scheduled" : st === "failed" ? "failed" : "ready"} label={platMeta.get(code)?.label} iconKey={platMeta.get(code)?.icon_key} compact />;
                        })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </div>
      )}

      {/* ดูรูปใหญ่ (ของกลาง ImageLightbox) — เลื่อนซ้าย-ขวา · ติ๊กเลือก/ตั้งปก/เปิด Drive ได้จากในนี้ */}
      <ImageLightbox images={lightImages} index={lightIdx} onIndex={setLightIdx} onClose={() => setLightIdx(-1)} thumbnails
        footer={() => lightFile && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-white/90">
            <span className="max-w-[40ch] truncate">{lightFile.file_name}</span>
            <span className="text-white/60">{[lightFile.width && lightFile.height ? `${lightFile.width}×${lightFile.height}` : null, lightFile.size_bytes ? formatBytes(lightFile.size_bytes) : null].filter(Boolean).join(" · ")}</span>
            {canEdit && <button onClick={() => togglePick(lightFile)} className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium ${lightFile.picked ? "bg-violet-600 border-violet-600" : "border-white/30 hover:bg-white/10"}`}><Icon name="done" />{lightFile.picked ? t("เลือกแล้ว", "Picked") : t("เลือกใช้", "Pick")}</button>}
            {canEdit && <button onClick={() => setCover(lightFile)} className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium ${album?.cover_asset_id === lightFile.id ? "bg-amber-500 border-amber-500" : "border-white/30 hover:bg-white/10"}`}><Icon name="star" />{album?.cover_asset_id === lightFile.id ? t("ปกอัลบั้ม", "Cover") : t("ตั้งเป็นปก", "Set cover")}</button>}
            {lightFile.drive_file_id && <a href={driveFileUrl(lightFile.drive_file_id)} target="_blank" rel="noreferrer" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-white/30 text-xs hover:bg-white/10"><Icon name="open" />{t("เปิดใน Drive", "Open in Drive")}</a>}
            {lightFile.drive_file_id && <a href={`/api/drive-video/${lightFile.drive_file_id}?dl=1`} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-white/30 text-xs hover:bg-white/10"><Icon name="download" />{t("ต้นฉบับ", "Original")}</a>}
            {lightFile.used_in.length > 0 && <span className="text-xs text-emerald-300">{t("ใช้ในโพสต์:", "Used in:")} {lightFile.used_in.map((u) => u.label).filter(Boolean).join(", ")}</span>}
          </div>
        )} />

      {/* ดูคลิป (เล่นวิดีโอ + ตั้งปกคลิปจากเฟรม / อัปรูปเอง) */}
      {viewFile && (
        <ERPModal open onClose={() => setViewFile(null)} title={viewFile.file_name} size="xl" storageKey="content-album-file" zIndex={60}
          footer={<div className="flex flex-wrap items-center gap-2 w-full text-sm text-slate-500">
            <span>{[viewFile.width && viewFile.height ? `${viewFile.width}×${viewFile.height}` : null, viewFile.size_bytes ? formatBytes(viewFile.size_bytes) : null].filter(Boolean).join(" · ")}</span>
            <span className="flex-1" />
            {viewFile.drive_file_id && <a href={driveFileUrl(viewFile.drive_file_id)} target="_blank" rel="noreferrer" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><Icon name="open" />{t("เปิดใน Drive", "Open in Drive")}</a>}
            {viewFile.drive_file_id && <a href={`/api/drive-video/${viewFile.drive_file_id}?dl=1`} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><Icon name="download" />{t("ดาวน์โหลดต้นฉบับ", "Download original")}</a>}
          </div>}>
          {viewFile.asset_type === "video" && canEdit && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
              <Icon name="image" />
              <span className="min-w-0 flex-1 text-violet-800">{t("ปกคลิป: เลื่อนวิดีโอไปเฟรมที่อยากได้ (หยุดค้างไว้) แล้วกด “ใช้เฟรมนี้เป็นปก” · หรืออัปรูปเอง", "Video cover: scrub to the frame you want, pause, then use this frame · or upload an image")}</span>
              {viewFile.drive_file_id && (
                <button onClick={() => void coverFromFrame()} disabled={coverBusy} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                  <Icon name="camera" />{coverBusy ? t("กำลังตั้งปก…", "Setting…") : t("ใช้เฟรมนี้เป็นปก", "Use this frame")}
                </button>
              )}
              <button onClick={() => coverInputRef.current?.click()} disabled={coverBusy} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                <Icon name="upload" />{t("อัปรูปเป็นปก", "Upload cover")}
              </button>
              <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={(e) => { const img = e.target.files?.[0]; e.target.value = ""; if (img) void posterFromImageFile(img).then(applyCover); }} />
            </div>
          )}
          <div className="grid place-items-center bg-slate-900/5 rounded-lg min-h-[50vh]">
            {viewFile.asset_type === "video" && viewFile.drive_file_id ? (
              <video ref={viewVideoRef} controls preload="metadata" className="max-h-[70vh] max-w-full" src={`/api/drive-video/${viewFile.drive_file_id}`}
                poster={viewFile.r2_key.startsWith("drive:") ? undefined : r2ImageUrl(viewFile.r2_key, 1280) ?? undefined} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={viewFile.file_name} className="max-h-[70vh] max-w-full object-contain"
                src={(viewFile.drive_file_id ? r2ImageUrl(`drive:${viewFile.drive_file_id}`, 2000) : r2ImageUrl(viewFile.r2_key, 1600)) ?? ""} />
            )}
          </div>
          {viewFile.used_in.length > 0 && <p className="mt-2 text-sm text-slate-600">{t("ใช้ในโพสต์:", "Used in:")} {viewFile.used_in.map((u) => u.label).filter(Boolean).join(", ")}</p>}
        </ERPModal>
      )}

      <ConfirmDialog open={!!delFile} onClose={() => setDelFile(null)} onConfirm={() => void doDeleteFile()} loading={busy} variant="danger"
        title={t("เอาไฟล์ออกจากอัลบั้ม", "Remove file from album")} confirmText={delDrive ? t("เอาออก + ลบใน Drive", "Remove + trash in Drive") : t("เอาออก", "Remove")}
        message={delFile ? (
          <div className="space-y-2 text-sm">
            <p>{delFile.file_name}</p>
            {delFile.used_in.length > 0 && <p className="text-amber-700">{t(`ไฟล์นี้ใช้อยู่ใน ${delFile.used_in.map((u) => u.label).filter(Boolean).join(", ")} — โพสต์ยังใช้ได้ (ลบใน Drive ไม่ได้)`, `Used in ${delFile.used_in.map((u) => u.label).filter(Boolean).join(", ")} — posts keep it (can't trash in Drive)`)}</p>}
            {delFile.drive_file_id && delFile.used_in.length === 0 && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={delDrive} onChange={(e) => setDelDrive(e.target.checked)} />{t("ย้ายไฟล์ใน Google Drive ไปถังขยะด้วย (กู้คืนได้ใน Drive 30 วัน)", "Also move the Google Drive file to trash (recoverable for 30 days)")}</label>
            )}
          </div>
        ) : ""} />
      <ConfirmDialog open={trashOpen} onClose={() => setTrashOpen(false)} onConfirm={() => void doTrashAlbum()} loading={busy} variant="danger"
        title={t("ลบอัลบั้ม", "Delete album")} confirmText={t("ย้ายไปถังขยะ", "Move to trash")}
        message={t("อัลบั้มไปอยู่ในถังขยะ (กู้คืนได้) · ไฟล์ใน Google Drive และโพสต์ที่สร้างไปแล้วไม่ถูกลบ", "The album goes to trash (restorable) · Drive files and existing posts are kept")} />
      {pullTo && (
        <PullCaptionModal target={pullTo} caps={capPlatforms.map(capOf)} settings={pset} onClose={() => setPullTo(null)}
          onApply={(from, opts) => { const src = capOf(from); setCap(pullTo, { ...(opts.caption ? { caption: src.caption } : {}), ...(opts.hashtags ? { hashtags: src.hashtags } : {}) }); setPullTo(null); }} />
      )}
      {/* ส่งเข้าปฏิทิน ขั้นที่ 1: เลือกวัน */}
      {datePick && album && (
        <ContentDatePickModal open brandId={album.brand_id} albumId={album.id} selectedDay={album.due_date} onClose={() => setDatePick(null)}
          description={t("กดวันที่จะลง → เปิดรายละเอียดโพสต์ที่ใส่ข้อมูลจากอัลบั้มให้แล้ว · ในช่องวันคือโพสต์ที่มีอยู่แล้ว (สีม่วง = จากอัลบั้มนี้)", "Pick a day → the post form opens prefilled from this album · each day shows existing posts (purple = from this album)")}
          onPick={(day) => { const p = datePick; setDatePick(null); setPostDate(day); setPostPreset(p); }}
          footer={<div className="flex flex-wrap items-center gap-2 w-full">
            <span className="text-xs text-slate-500">{[datePick.parent ? `${t("สินค้า", "Product")} ${datePick.parent.code}` : null, album.brand_name, datePick.album ? t(`${datePick.album.asset_ids.length} ไฟล์`, `${datePick.album.asset_ids.length} files`) : null].filter(Boolean).join(" · ")}</span>
            <span className="flex-1" />
            <button onClick={() => setDatePick(null)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={() => { const p = datePick; setDatePick(null); setPostDate(null); setPostPreset(p); }} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยังไม่กำหนดวัน", "No date yet")}</button>
          </div>} />
      )}
      {postPreset && album && (
        <ContentCreateModal open preset={postPreset} brands={brands} campaigns={campaigns} defaultBrandId={album.brand_id} defaultDate={postDate}
          onClose={() => setPostPreset(null)} pushToast={(type, m) => toast.show(m, type)}
          onCreated={() => { setPostPreset(null); void load(true); onChanged(); }} />
      )}
    </ERPModal>
  );
}
