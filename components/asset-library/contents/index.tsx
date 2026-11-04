"use client";

/**
 * หน้า Contents ในคลังไฟล์ — อัลบั้มรูป/วิดีโอจากการถ่าย 1 ครั้ง (ไฟล์ตัวจริงอยู่ Google Drive) → แตกเป็นโพสต์ในปฏิทินคอนเทนต์
 * (เจ้าของเลือกแบบ ข 2026-11-03)
 *
 * การ์ดอัลบั้ม + แท็บสถานะ (คิดจากโพสต์ที่ผูก · lib/content-album-status) + ชิปแบรนด์ + ค้นหา + ถังขยะ
 * ลากไฟล์/ทั้งโฟลเดอร์มาวางที่ไหนก็ได้ในหน้า (หรือกดเลือก) → ป๊อป "ลงอัลบั้มไหน?" (อัลบั้มเดิม / สร้างใหม่ · แยกตามโฟลเดอร์ได้)
 * แท็บ "อยากได้" = รายการที่อยากได้ (phase wish) — บรีฟก่อนถ่าย การ์ดโชว์ Reference แทนรูป · ถ่ายแล้วแปลงเป็นอัลบั้ม (WishDetailModal)
 * ใช้ของกลาง: ERPModal (ผ่าน AlbumFormModal/AlbumDetailModal) · state-views · PlatformIcon · Icon · listBrands/useCreativeOptions
 * สิทธิ์: ดู assets.view · สร้าง assets.upload
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileDrop } from "@/components/file-drop";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { useCreativeOptions } from "@/app/tasks/use-options";
import { listBrands, type BrandOption } from "@/app/tasks/data";
import { ALBUM_STAGES, ALBUM_STAGE_META, WISH_STAGES, WISH_STAGE_META, albumReminder, bangkokToday, wishStage, type AlbumStage, type WishStage } from "@/lib/content-album-status";
import { POST_TYPES } from "@/lib/creative-tasks";
import { listContentAlbums, updateContentAlbum, createContentAlbum, getContentAlbum, getAlbumDriveInfo, type ContentAlbum } from "./api";
import { startAlbumUploadTask, onAlbumUpload } from "./data";
import { StageBadge, PlatChip, FileThumb, PickMediaButtons, ALBUM_ACCEPT } from "./album-bits";
import { PlatformIcon } from "@/components/platform-icon";
import { UploadTargetModal, type UploadPlan } from "./upload-target-modal";
import { AlbumFormModal } from "./album-form-modal";
import { AlbumDetailModal } from "./album-detail";
import { WishDetailModal } from "./wish-detail";
import { RefTile } from "./ref-board";

const VIEW_KEY = "erp.contents.view";

const DAY = 86400000;

export function ContentAlbumsBoard({ openAlbumId = null }: { openAlbumId?: string | null }) {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const { platforms } = useCreativeOptions();
  const [albums, setAlbums] = useState<ContentAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [stage, setStage] = useState<AlbumStage | "all">("all");
  const [brandId, setBrandId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [trash, setTrash] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  // อัลบั้ม | อยากได้ — จำแท็บที่ดูล่าสุดในเครื่อง
  const [view, setViewState] = useState<"album" | "wish">(() => { try { return localStorage.getItem(VIEW_KEY) === "wish" ? "wish" : "album"; } catch { return "album"; } });
  const setView = (v: "album" | "wish") => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ไม่จำก็ได้ */ } };
  const [wishFilter, setWishFilter] = useState<WishStage | "all">("all");
  const [wishFormOpen, setWishFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(openAlbumId);
  useEffect(() => { if (openAlbumId) setDetailId(openAlbumId); }, [openAlbumId]);

  // quiet = โหลดใหม่เงียบ ๆ (ไฟล์อัปเสร็จทีละไฟล์) ไม่ขึ้น "กำลังโหลด" ทับการ์ด
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try { setAlbums(await listContentAlbums({ trash })); }
    catch (e) { if (!quiet) setError((e as Error).message); }
    finally { setLoading(false); }
  }, [trash]);
  useEffect(() => { void load(); }, [load]);
  // ไฟล์อัปเสร็จ (จากหน้าไหนก็ตาม) → รีเฟรชการ์ด · รวบหลายไฟล์ติดกันเป็นครั้งเดียว
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => onAlbumUpload((e) => {
    if (!e.fileDone) return;
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void load(true), 1500);
  }), [load]);

  // ── ลากไฟล์/โฟลเดอร์มาวาง หรือกดเลือก → ถามว่าลงอัลบั้มไหน ──
  const canUpload = can("assets.upload") && !trash;
  const [incoming, setIncoming] = useState<File[] | null>(null);
  const drop = useFileDrop((files) => setIncoming(files), {
    // เปิดป๊อปอัลบั้ม/ฟอร์มอยู่ = ไม่รับที่หน้ารวม (ในอัลบั้มมีช่องลากวางของมันเอง)
    accept: ALBUM_ACCEPT, folders: true, disabled: !canUpload || !!detailId || formOpen || wishFormOpen,
    onReject: () => toast.error(t("ลากได้เฉพาะรูปหรือวิดีโอ", "Only photos or videos")),
    onBusy: () => canUpload ? undefined : toast.error(trash ? t("ออกจากถังขยะก่อน แล้วค่อยลากไฟล์มาวาง", "Leave the trash view first") : t("คุณยังไม่มีสิทธิ์อัปไฟล์ (assets.upload)", "You can't upload files (assets.upload)")),
  });
  const runPlan = async (plan: UploadPlan) => {
    setIncoming(null);
    try {
      if (plan.mode === "existing") {
        // ลงไฟล์จากการถ่ายในรายการที่อยากได้ = ถ่ายแล้ว → แปลงเป็นอัลบั้มให้ก่อน
        if (plan.album.phase === "wish") { await updateContentAlbum(plan.album.id, { phase: "album" }); setView("album"); }
        const [d, info] = await Promise.all([getContentAlbum(plan.album.id), getAlbumDriveInfo(plan.album.id)]);
        setDetailId(d.id);
        if (!info.ok) { toast.error(t(`ยังอัปเข้า “${d.name}” ไม่ได้: ${info.reason}`, `Can't upload to “${d.name}”: ${info.reason}`)); return; }
        startAlbumUploadTask({ albumId: d.id, albumName: d.name, files: plan.files, existingKeys: d.files.map((f) => f.r2_key) });
        return;
      }
      const made: ContentAlbum[] = [];
      for (const g of plan.groups) {
        const a = await createContentAlbum({ name: g.name, brand_id: plan.brandId });
        made.push(a);
        const info = await getAlbumDriveInfo(a.id);
        if (!info.ok) { toast.error(t(`สร้างอัลบั้ม “${a.name}” แล้ว แต่ยังอัปไฟล์ไม่ได้: ${info.reason}`, `Album “${a.name}” created but can't upload: ${info.reason}`)); continue; }
        startAlbumUploadTask({ albumId: a.id, albumName: a.name, files: g.files, existingKeys: [] });
      }
      await load(true);
      setView("album");
      if (made.length === 1) setDetailId(made[0].id);
      else if (made.length) toast.success(t(`สร้าง ${made.length} อัลบั้มแล้ว — อัปทีละอัลบั้มตามคิว ดูความคืบหน้ามุมขวาล่าง`, `${made.length} albums created — uploading one by one (see bottom-right)`));
    } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { listBrands().then(setBrands).catch(() => {}); }, []);

  const platMeta = useMemo(() => new Map(platforms.map((p) => [p.value, p])), [platforms]);
  const q = search.trim().toLowerCase();
  const filtered = albums.filter((a) =>
    (!brandId || a.brand_id === brandId) &&
    (!q || a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q) || a.assignees.some((p) => p.name.toLowerCase().includes(q))
      || a.products.some((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))));
  const realAlbums = filtered.filter((a) => a.phase === "album");
  const wishes = filtered.filter((a) => a.phase === "wish");
  const counts = useMemo(() => {
    const m = new Map<string, number>([["all", realAlbums.length]]);
    for (const a of realAlbums) m.set(a.status.stage, (m.get(a.status.stage) ?? 0) + 1);
    return m;
  }, [realAlbums]);
  const shown = trash ? filtered : stage === "all" ? realAlbums.filter((a) => a.status.stage !== "closed") : realAlbums.filter((a) => a.status.stage === stage);
  const shownWishes = wishFilter === "all" ? wishes : wishes.filter((a) => wishStage(a) === wishFilter);
  const wishMode = view === "wish" && !trash;
  const detailAlbum = albums.find((a) => a.id === detailId) ?? null;
  const typeLabel = (k: string) => { const pt = POST_TYPES.find((x) => x.value === k); return pt ? t(pt.label, pt.label_en) : k; };
  const brandsInUse = brands.filter((b) => albums.some((a) => a.brand_id === b.id));

  const restore = async (a: ContentAlbum) => {
    try { await updateContentAlbum(a.id, { restore: true }); toast.success(t("กู้อัลบั้มคืนแล้ว", "Album restored")); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const todayKey = bangkokToday();
  return (
    <div className="relative space-y-4" {...drop.zone("board")}>
      {drop.over === "board" && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-xl border-2 border-dashed border-violet-400 bg-violet-50/80 grid place-items-center">
          <p className="text-violet-800 font-medium flex items-center gap-2"><Icon name="upload" size={22} />{t("วางเพื่ออัปไฟล์/โฟลเดอร์ แล้วเลือกว่าจะลงอัลบั้มไหน", "Drop files or folders, then pick an album")}</p>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Icon name="library" />Contents</h2>
          <p className="text-sm text-slate-500">{t("อัลบั้มรูป/วิดีโอจากการถ่าย 1 ครั้ง ไฟล์ตัวจริงอยู่ Google Drive · แตกเป็นโพสต์ในปฏิทินได้หลายโพสต์ สถานะขยับเองตามโพสต์", "Shoot albums — originals stay in Google Drive · turn into calendar posts; status follows the posts")}</p>
        </div>
        {canUpload && !wishMode && <PickMediaButtons onFiles={setIncoming} />}
        {can("assets.upload") && !trash && (wishMode ? (
          <button onClick={() => setWishFormOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">
            <Icon name="tip" />{t("เพิ่มรายการที่อยากได้", "New wish")}
          </button>
        ) : (
          <button onClick={() => setFormOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">
            <Icon name="add" />{t("สร้างอัลบั้ม", "New album")}
          </button>
        ))}
      </div>

      {/* อัลบั้ม | อยากได้ */}
      {!trash && (
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-1" role="tablist">
          {([["album", "image", "อัลบั้ม", "Albums", albums.filter((a) => a.phase === "album").length], ["wish", "tip", "อยากได้", "Wishes", albums.filter((a) => a.phase === "wish").length]] as const).map(([k, ic, th, en, n]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-sm ${view === k ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <Icon name={ic} />{t(th, en)}<span className={`text-xs ${view === k ? "text-white/75" : "text-slate-400"}`}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* แท็บสถานะ (รายการที่อยากได้: รอหาคนถ่าย / นัดถ่ายแล้ว) */}
      {wishMode && (
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {(["all", ...WISH_STAGES] as const).map((s) => (
            <button key={s} onClick={() => setWishFilter(s)} aria-pressed={wishFilter === s}
              className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm border ${wishFilter === s ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {s === "all" ? t("ทั้งหมด", "All") : t(WISH_STAGE_META[s].th, WISH_STAGE_META[s].en)}
              <span className={`text-xs ${wishFilter === s ? "text-white/70" : "text-slate-400"}`}>{s === "all" ? wishes.length : wishes.filter((a) => wishStage(a) === s).length}</span>
            </button>
          ))}
        </div>
      )}
      {!trash && !wishMode && (
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" role="tablist">
          {(["all", ...ALBUM_STAGES] as const).map((s) => {
            const on = stage === s;
            const label = s === "all" ? t("ทั้งหมด (ยังไม่ปิด)", "All open") : t(ALBUM_STAGE_META[s].th, ALBUM_STAGE_META[s].en);
            const n = s === "all" ? filtered.filter((a) => a.status.stage !== "closed").length : counts.get(s) ?? 0;
            return (
              <button key={s} role="tab" aria-selected={on} onClick={() => setStage(s)}
                className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm border ${on ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {label}<span className={`text-xs ${on ? "text-white/70" : "text-slate-400"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ค้นชื่ออัลบั้ม / คน / รหัสสินค้า", "Search album / person / product")}
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        {brandsInUse.length > 1 && (
          <div className="flex gap-1 overflow-x-auto">
            <button onClick={() => setBrandId("")} className={`shrink-0 h-8 px-3 rounded-full text-sm border ${!brandId ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>{t("ทุกแบรนด์", "All brands")}</button>
            {brandsInUse.map((b) => (
              <button key={b.id} onClick={() => setBrandId(b.id === brandId ? "" : b.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm border ${brandId === b.id ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color || "#94a3b8" }} />{b.name}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => { setTrash((v) => !v); setStage("all"); }} className={`ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm border ${trash ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          <Icon name={trash ? "back" : "delete"} />{trash ? t("กลับไปอัลบั้ม", "Back to albums") : t("ถังขยะ", "Trash")}
        </button>
      </div>

      {wishMode && !loading && !error && (shownWishes.length === 0 ? (
        <EmptyState icon={<Icon name="tip" size={36} />}
          title={wishes.length ? t("ไม่มีรายการในแท็บนี้", "Nothing here") : t("ยังไม่มีรายการที่อยากได้", "No wishes yet")}
          hint={wishes.length ? undefined : t("บอกทีมถ่ายว่าอยากได้คอนเทนต์แบบไหน — เลือกประเภท รุ่น ใส่รายละเอียด แล้วแนบ Reference (รูป · ลิงก์วิดีโอ · ข้อความ)", "Tell the shoot team what you want — type, product, details, and references")}
          action={!wishes.length && can("assets.upload") ? { label: t("เพิ่มรายการที่อยากได้", "New wish"), onClick: () => setWishFormOpen(true) } : undefined} />
      ) : (
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {shownWishes.map((a) => {
            const ws = wishStage(a);
            const reminder = albumReminder({ stage: a.status.stage, created_at: a.created_at, due_date: a.due_date, phase: a.phase }, todayKey);
            const tiles = a.ref_previews.slice(0, 4);
            return (
              <button key={a.id} onClick={() => setDetailId(a.id)} className="text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition">
                <div className="grid grid-cols-2 grid-rows-2 gap-0.5 aspect-[4/3] bg-slate-100">
                  {[0, 1, 2, 3].map((i) => tiles[i] ? <RefTile key={tiles[i].id} r={tiles[i]} /> : <div key={i} className="grid place-items-center text-slate-300"><Icon name={i === 0 && !tiles.length ? "pin" : "add"} /></div>)}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 min-w-0 font-medium text-slate-800 line-clamp-2">{a.name || t("(ไม่มีชื่อ)", "(untitled)")}</p>
                    <span className={`inline-flex items-center h-6 px-2 rounded-full border text-xs font-medium whitespace-nowrap ${ws === "need_shooter" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-sky-50 text-sky-800 border-sky-200"}`}>{t(WISH_STAGE_META[ws].th, WISH_STAGE_META[ws].en)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {a.brand_name && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: a.brand_color || "#94a3b8" }} />{a.brand_name}</span>}
                    {a.products.slice(0, 2).map((p) => <span key={p.id} className="px-1.5 h-5 inline-flex items-center rounded bg-slate-100 font-mono text-slate-600" title={p.name}>{p.code}</span>)}
                  </div>
                  {(a.content_types.length > 0 || a.planned_platforms.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {a.content_types.map((k) => <span key={k} className="inline-flex items-center h-5 px-1.5 rounded-full bg-violet-50 text-violet-800 text-[11px]">{typeLabel(k)}</span>)}
                      {a.planned_platforms.map((code) => <span key={code} title={platMeta.get(code)?.label ?? code}><PlatformIcon code={code} iconKey={platMeta.get(code)?.icon_key} size={15} /></span>)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-slate-500">
                    {a.due_date && <span className={`inline-flex items-center gap-1 ${reminder === "overdue" ? "text-red-600 font-medium" : reminder === "due_soon" ? "text-amber-700 font-medium" : ""}`}><Icon name="calendar" />{t("อยากได้ภายใน", "By")} {new Date(`${a.due_date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>}
                    <span className="inline-flex items-center gap-1"><Icon name="camera" />{a.assignees.length ? a.assignees.map((p) => p.name).filter(Boolean).join(", ") : t("ยังไม่มีคนถ่าย", "No shooter")}</span>
                    <span className="inline-flex items-center gap-1"><Icon name="pin" />Ref {a.ref_count}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
      {wishMode ? null : loading ? <LoadingState /> : error ? <ErrorState hint={error} onRetry={() => void load()} /> : shown.length === 0 ? (
        <EmptyState icon={<Icon name="library" size={36} />}
          title={trash ? t("ถังขยะว่าง", "Trash is empty") : albums.length === 0 ? t("ยังไม่มีอัลบั้ม", "No albums yet") : t("ไม่มีอัลบั้มในแท็บนี้", "No albums here")}
          hint={!trash && albums.length === 0 ? t("ลากรูป/วิดีโอ หรือทั้งโฟลเดอร์จากการถ่ายมาวางที่หน้านี้ได้เลย ระบบจะถามว่าลงอัลบั้มไหน หรือสร้างใหม่ · ไฟล์ตัวจริงขึ้น Google Drive ของแบรนด์", "Drop photos/videos or whole folders here — you'll pick an album or create one · originals go to the brand's Google Drive") : undefined}
          action={!trash && albums.length === 0 && can("assets.upload") ? { label: t("สร้างอัลบั้ม", "New album"), onClick: () => setFormOpen(true) } : undefined} />
      ) : (
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {shown.map((a) => {
            const due = a.due_date ? new Date(`${a.due_date}T00:00:00`) : null;
            // กติกาเดียวกับกระดิ่งเตือนรายวัน (lib/content-album-status albumReminder)
            const reminder = albumReminder({ stage: a.status.stage, created_at: a.created_at, due_date: a.due_date, phase: a.phase }, todayKey);
            const overdue = reminder === "overdue";
            const staleDays = reminder === "stale" ? Math.floor((Date.now() - new Date(a.created_at).getTime()) / DAY) : 0;
            return (
              <div key={a.id} className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition">
                <button onClick={() => (trash ? undefined : setDetailId(a.id))} className="block w-full text-left" disabled={trash}>
                  <div className="grid grid-cols-3 grid-rows-2 gap-0.5 aspect-[4/3] bg-slate-100">
                    <FileThumb r2Key={a.cover_key} type="image" width={480} className="col-span-2 row-span-2" />
                    {[0, 1].map((i) => <FileThumb key={i} r2Key={a.preview_keys[i] ?? null} type="image" width={200} />)}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 min-w-0 font-medium text-slate-800 line-clamp-2">{a.name || t("(ไม่มีชื่อ)", "(untitled)")}</p>
                      {a.phase === "wish" ? <span className="inline-flex items-center h-6 px-2 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-xs">{t("อยากได้", "Wish")}</span> : <StageBadge stage={a.status.stage} />}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      {a.brand_name && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: a.brand_color || "#94a3b8" }} />{a.brand_name}</span>}
                      <span className="inline-flex items-center gap-1"><Icon name="image" />{a.file_count - a.video_count}</span>
                      {a.video_count > 0 && <span className="inline-flex items-center gap-1"><Icon name="video" />{a.video_count}</span>}
                      {a.assignees.length > 0 && <span className="inline-flex items-center gap-1 truncate"><Icon name="user" />{a.assignees.map((p) => p.name).filter(Boolean).join(", ")}</span>}
                    </div>
                    {a.status.platforms.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {a.status.platforms.map((p) => <PlatChip key={p.code} code={p.code} state={p.state} label={platMeta.get(p.code)?.label} iconKey={platMeta.get(p.code)?.icon_key} compact />)}
                      </div>
                    )}
                    {a.products.length > 0 && (
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {a.products.slice(0, 3).map((p) => <span key={p.id} className="px-1.5 h-5 inline-flex items-center rounded bg-slate-100 font-mono text-slate-600" title={p.name}>{p.code}</span>)}
                        {a.products.length > 3 && <span className="text-slate-400">+{a.products.length - 3}</span>}
                      </div>
                    )}
                    {(due || reminder === "stale") && (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {due && <span className={`inline-flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : reminder === "due_soon" ? "text-amber-700 font-medium" : "text-slate-500"}`}><Icon name="calendar" />{t("ลงภายใน", "Post by")} {due.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}{overdue ? ` · ${t("เลยกำหนด", "overdue")}` : reminder === "due_soon" ? ` · ${t("พรุ่งนี้", "tomorrow")}` : ""}</span>}
                        {reminder === "stale" && <span className="inline-flex items-center gap-1 text-amber-700"><Icon name="waiting" />{t(`ค้าง ${staleDays} วัน`, `${staleDays} days waiting`)}</span>}
                      </div>
                    )}
                  </div>
                </button>
                {trash && can("assets.manage") && (
                  <div className="px-3 pb-3"><button onClick={() => void restore(a)} className="w-full h-8 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">{t("กู้คืน", "Restore")}</button></div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlbumFormModal open={formOpen} album={null} brands={brands} defaultBrandId={brandId || null} onClose={() => setFormOpen(false)}
        onSaved={(a) => { setFormOpen(false); toast.success(t("สร้างอัลบั้มแล้ว — ลากไฟล์มาวางได้เลย", "Album created — drop files in")); void load(); setDetailId(a.id); }} />
      <AlbumFormModal open={wishFormOpen} album={null} phase="wish" brands={brands} defaultBrandId={brandId || null} onClose={() => setWishFormOpen(false)}
        onSaved={(a) => { setWishFormOpen(false); toast.success(t("บันทึกแล้ว — เพิ่ม Reference ได้เลย", "Saved — add references now")); void load(true); setView("wish"); setDetailId(a.id); }} />
      {detailId && (detailAlbum?.phase === "wish" ? (
        <WishDetailModal key={`wish-${detailId}`} albumId={detailId} brands={brands} onClose={() => setDetailId(null)} onChanged={() => void load(true)}
          onConverted={(id) => { void load(true).then(() => { setView("album"); setDetailId(id); }); }} />
      ) : (detailAlbum || !loading) && (
        <AlbumDetailModal key={`album-${detailId}`} albumId={detailId} brands={brands} onClose={() => setDetailId(null)} onChanged={() => void load(true)} />
      ))}
      {incoming && (
        <UploadTargetModal files={incoming} albums={albums} brands={brands} defaultBrandId={brandId || null}
          onClose={() => setIncoming(null)} onConfirm={(plan) => void runPlan(plan)} />
      )}
    </div>
  );
}
