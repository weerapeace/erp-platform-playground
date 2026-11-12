"use client";
/**
 * หน้า "ไอเดีย" ใน Design Dashboard (เจ้าของขอ 2026-11-12 · เลือกจาก widget)
 * จดไว้ก่อน ยังไม่ใช่งานจริง — ไม่มีเลข DS · ไม่โผล่บนบอร์ด/สถิติ/อีเมล/รายงาน
 *   ช่อง: ชื่อ · แบรนด์ · รายละเอียดเป็นข้อ ๆ · Reference (หลายลิงก์) · รูปหลายรูป (รูปแรก = รูปปก)
 *   ตัวกรอง: ทั้งหมด · ของฉัน · พักไว้ · เก็บแล้ว + ค้นหา (ช่องค้นหาของ Dashboard) + แบรนด์ (แถบแบรนด์ซ้ายมือ)
 *   การ์ดต่อแถว (ของกลาง GalleryColumns · จำรายคน) · รูป เต็มกรอบ/เห็นทั้งรูป (จำรายคน) · กดรูป = ดูเต็มจอ (ImageLightbox)
 *   พักไว้ / เก็บ (กู้คืนได้ ไม่มีลบทิ้งจริง) · เริ่มทำงานจริง = ป๊อปยืนยัน (เลือกเช็กลิสต์ได้) → POST /api/design-sheets { idea_id } → เปิดใบงานใหม่
 *   รอคัด = ชุดที่ส่งมาในกลุ่มไลน์ "ส่งไอเดีย" (lib/design-idea-line) → เพิ่มเป็นไอเดีย / รวมกับไอเดียที่มี / ไม่เอา · แอดมินตั้งกลุ่มได้ที่แถบบนกล่อง (LineGroupSetup)
 * ข้อมูล: /api/design-ideas · ค่ากลาง lib/design-ideas · doc: docs/design-ideas.md
 * ของกลาง: ERPModal · ImageAttachKeys · ImageLightbox · BrandSelect · GalleryColumns · ChecklistSeedPicker · TaskLinkList · LineGroupSetup · LineConsole · state-views · useToast
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { ImageAttachKeys } from "@/components/image-attach";
import { ImageLightbox } from "@/components/image-lightbox";
import { BrandSelect, type BrandSelectOption } from "@/components/brand-select";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import { ChecklistSeedPicker } from "@/components/record-tasks";
import { TaskLinkList } from "@/components/record-tasks/task-links";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { LineGroupSetup } from "@/components/line-group-setup";
import { LineConsole } from "@/components/line-console";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";
import { MAX_TASK_LINKS, parseTaskLinkUrl, type TaskLink } from "@/lib/record-tasks";
import { ideaDetailHtml, ideaImageUrl, IDEA_IMAGE_FOLDER, IDEA_PROMOTABLE, MAX_IDEA_POINTS, type DesignIdea } from "@/lib/design-ideas";

type View = "inbox" | "all" | "mine" | "paused" | "archived";
type Fit = "cover" | "contain";
const FIT_PREF = "design_ideas_fit";
const NO_BRAND = "__no_brand__";

const fmtIdeaDate = (iso: string) => {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return tr("วันนี้", "Today");
  if (days === 1) return tr("เมื่อวาน", "Yesterday");
  return d.toLocaleDateString(tr("th-TH", "en-GB"), { day: "numeric", month: "short" });
};

export function IdeasView({ canEdit, isAdmin = false, initialView = "all", search, brandId, onPromoted, onInboxCount }: {
  canEdit: boolean;
  /** แอดมิน = เห็นแถบตั้งกลุ่มไลน์ "ส่งไอเดีย" ในกล่องรอคัด */
  isAdmin?: boolean;
  /** เปิดมาที่มุมมองไหน (ลิงก์จากบอทไลน์ ?ideas=1 = กล่องรอคัด) */
  initialView?: View;
  /** คำค้นจากช่องค้นหาของ Dashboard */
  search: string;
  /** แบรนด์ที่เลือกในแถบซ้าย (null = ทั้งหมด · "__no_brand__" = ไม่มีแบรนด์) */
  brandId: string | null;
  /** เริ่มทำงานจริงแล้ว → หน้าแม่เปิดใบงานใหม่ + รีเฟรชบอร์ด */
  onPromoted: (sheetId: string) => void;
  /** จำนวนชุดรอคัดจากไลน์ (ทั้งหมด ไม่ขึ้นกับคำค้น) — หน้าแม่ใช้เป็นตัวเลขบนปุ่ม "ไอเดีย" */
  onInboxCount?: (n: number) => void;
}) {
  const t = useT();
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<DesignIdea[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [merge, setMerge] = useState<DesignIdea | null>(null);
  const [setupKey, setSetupKey] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [fit, setFit] = useState<Fit>("cover");
  const [brands, setBrands] = useState<BrandSelectOption[]>([]);
  const [form, setForm] = useState<DesignIdea | "new" | null>(null);
  const [promote, setPromote] = useState<DesignIdea | null>(null);
  const [lb, setLb] = useState<{ keys: string[]; i: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { cols, setCols, gridStyle } = useGalleryColumns("design_ideas", 4);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch("/api/design-ideas").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setItems((j.data ?? []) as DesignIdea[]);
    } catch (e) { setErr(e instanceof Error ? e.message : tr("โหลดไอเดียไม่สำเร็จ", "Failed to load ideas")); setItems((x) => x ?? []); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const inboxTotal = items ? items.filter((it) => it.status === "inbox").length : null;
  useEffect(() => { if (inboxTotal !== null) onInboxCount?.(inboxTotal); }, [inboxTotal, onInboxCount]);
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string }[]).map((b) => ({ id: b.id, name: b.name })))).catch(() => {});
    apiFetch(`/api/user-prefs?key=${FIT_PREF}`).then((r) => r.json()).then((j) => { if (j?.value === "contain" || j?.value === "cover") setFit(j.value); }).catch(() => {});
  }, []);
  const changeFit = (f: Fit) => {
    setFit(f);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: FIT_PREF, value: f }) }).catch(() => {});
  };

  // ขอบเขต = แบรนด์ที่เลือก + คำค้น → แล้วค่อยแยกตามมุมมอง (นับตัวเลขในปุ่มจากขอบเขตนี้)
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((it) => {
      if (brandId === NO_BRAND ? !!it.brand_id : brandId ? it.brand_id !== brandId : false) return false;
      if (!q) return true;
      return [it.name, it.brand_name ?? "", it.created_by_name ?? "", it.sender_name ?? "", ...it.points, ...it.links.map((l) => `${l.url} ${l.label ?? ""}`)].join(" ").toLowerCase().includes(q);
    });
  }, [items, search, brandId]);
  // รอคัดจากไลน์ยังไม่มีแบรนด์ → ไม่กรองตามแบรนด์ (กรองแค่คำค้น)
  const inbox = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((it) => it.status === "inbox" && (!q || [it.name, it.sender_name ?? "", it.text_body ?? "", ...it.links.map((l) => l.url)].join(" ").toLowerCase().includes(q)));
  }, [items, search]);
  const live = scoped.filter((it) => it.status === "open" || it.status === "paused" || it.status === "promoting");
  const counts = {
    inbox: inbox.length,
    all: live.length,
    mine: live.filter((it) => user?.id && it.created_by === user.id).length,
    paused: live.filter((it) => it.status === "paused").length,
    archived: scoped.filter((it) => it.status === "archived").length,
  };
  const shown = view === "inbox" ? inbox : view === "archived" ? scoped.filter((it) => it.status === "archived")
    : view === "paused" ? live.filter((it) => it.status === "paused")
    : view === "mine" ? live.filter((it) => user?.id && it.created_by === user.id)
    : live;

  const setStatus = async (it: DesignIdea, status: "open" | "paused" | "archived") => {
    setBusy(it.id);
    try {
      const j = await apiFetch(`/api/design-ideas/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setItems((l) => (l ?? []).map((x) => (x.id === it.id ? (j.data as DesignIdea) : x)));
      toast.success(status === "archived" && it.status === "inbox" ? t(`ไม่เอา "${it.name}" — ย้ายไป "เก็บแล้ว" (กู้คืนได้)`, `Moved "${it.name}" to archived`)
        : status === "archived" ? t(`เก็บ "${it.name}" แล้ว — กู้คืนได้ที่ "เก็บแล้ว"`, `Archived "${it.name}"`)
        : status === "paused" ? t(`พัก "${it.name}" ไว้ก่อน`, `Paused "${it.name}"`)
        : it.status === "archived" ? t(`กู้คืน "${it.name}" แล้ว`, `Restored "${it.name}"`) : t(`เอา "${it.name}" กลับมาแล้ว`, `Resumed "${it.name}"`));
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(null); }
  };

  const seg = (k: View, label: string, n: number) => (
    <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k}
      className={`h-8 rounded-md px-2.5 text-xs transition ${view === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      {label} <span className={`tabular-nums ${view === k ? "text-white/70" : "text-slate-400"}`}>{n}</span>
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
          {seg("inbox", t("รอคัดจากไลน์", "From LINE"), counts.inbox)}
          {seg("all", t("ทั้งหมด", "All"), counts.all)}
          {seg("mine", t("ของฉัน", "Mine"), counts.mine)}
          {seg("paused", t("พักไว้", "Paused"), counts.paused)}
          {seg("archived", t("เก็บแล้ว", "Archived"), counts.archived)}
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span>{t("การ์ดต่อแถว", "Per row")}</span>
          <GalleryColumnsControl cols={cols} onChange={setCols} />
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 text-xs" role="group" aria-label={t("การแสดงรูป", "Image fit")}>
          {([["cover", t("เต็มกรอบ", "Fill")], ["contain", t("เห็นทั้งรูป", "Whole image")]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => changeFit(k)} aria-pressed={fit === k}
              className={`h-7 rounded-md px-2 ${fit === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>
          ))}
        </div>
        {canEdit && (
          <button type="button" onClick={() => setForm("new")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-sm font-medium text-white hover:bg-amber-600">
            <Icon value="i:bulb" className="text-[16px]" /> {t("จดไอเดีย", "New idea")}
          </button>
        )}
      </div>

      {view === "all" && counts.inbox > 0 && (
        <button type="button" onClick={() => setView("inbox")}
          className="mb-3 flex w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-800 hover:bg-emerald-100">
          <Icon value="i:brand-line" className="text-[16px]" />
          <span className="flex-1">{t(`มีไอเดียจากไลน์รอคัด ${counts.inbox} ชุด`, `${counts.inbox} LINE ideas waiting to be sorted`)}</span>
          <span className="text-xs font-medium">{t("ไปคัด", "Sort now")} ›</span>
        </button>
      )}
      {view === "inbox" && isAdmin && (
        <div className="mb-3">
          <LineGroupSetup slot="design_idea" setupUrl="/api/design-ideas?setup=1" reloadKey={setupKey} onOpenConsole={() => setConsoleOpen(true)}
            text={{
              purpose: "ส่งไอเดีย",
              readyNote: "ใครในกลุ่มก็ส่งรูป ลิงก์ หรือข้อความได้ ของคนเดิมภายใน 5 นาทีรวมเป็นชุดเดียว บอทตอบครั้งเดียวหลังส่งครบ (ไม่เสียโควตา) · ไอเดียถัดไปทันที พิมพ์ \"ไอเดียใหม่\" นำหน้า",
              pickHint: "แนะนำกลุ่มที่ใช้ส่งไอเดียอย่างเดียว — ทุกข้อความและรูปในกลุ่มที่เลือกจะเข้ากล่องรอคัด",
              busyWarn: "กลุ่มนี้ใช้กับระบบอื่นอยู่ — ข้อความ/รูปเรื่องอื่นจะเข้ากล่องรอคัดด้วย",
            }} />
        </div>
      )}

      {items === null ? <LoadingState label={t("กำลังโหลดไอเดีย...", "Loading ideas...")} className="py-10" />
        : err && !items.length ? <ErrorState title={t("โหลดไอเดียไม่สำเร็จ", "Failed to load ideas")} hint={err} onRetry={() => void load()} />
        : shown.length === 0 ? (
          <EmptyState icon={<Icon value={view === "inbox" ? "i:inbox" : "i:bulb"} className="text-slate-300" />}
            title={view === "inbox" ? t("ไม่มีไอเดียจากไลน์รอคัด", "Nothing from LINE to sort") : view === "archived" ? t("ยังไม่มีไอเดียที่เก็บไว้", "No archived ideas") : search.trim() ? t("ไม่พบไอเดียที่ตรงกับคำค้น", "No ideas match your search") : t("ยังไม่มีไอเดียในมุมมองนี้", "No ideas here yet")}
            hint={view === "inbox" ? t("ส่งรูป ลิงก์ หรือข้อความในกลุ่มไลน์ \"ส่งไอเดีย\" แล้วจะมาพักที่นี่ให้คัด", "Send images, links or text in the LINE ideas group") : view === "archived" ? undefined : search.trim() ? t("ลองเปลี่ยนคำค้น หรือเลือกแบรนด์อื่น", "Try another search or brand") : t("จดไอเดียไว้ก่อนได้เลย ยังไม่ต้องเป็นงานจริง — พร้อมเมื่อไหร่ค่อยกด \"เริ่มทำงานจริง\"", "Jot ideas down first — start a real job when ready")}
            action={canEdit && view !== "archived" && view !== "inbox" && !search.trim() ? { label: t("จดไอเดีย", "New idea"), onClick: () => setForm("new") } : undefined} />
        ) : view === "inbox" ? (
          <div className="space-y-2">
            {shown.map((it) => (
              <InboxCard key={it.id} it={it} canEdit={canEdit} busy={busy === it.id}
                onOpenImages={(i) => setLb({ keys: it.image_keys, i })}
                onAccept={() => setForm(it)} onMerge={() => setMerge(it)} onReject={() => void setStatus(it, "archived")} />
            ))}
          </div>
        ) : (
          <div style={gridStyle}>
            {shown.map((it) => (
              <IdeaCard key={it.id} it={it} fit={fit} small={cols >= 6} canEdit={canEdit} busy={busy === it.id}
                onOpenImages={(i) => setLb({ keys: it.image_keys, i })}
                onEdit={() => setForm(it)} onPromote={() => setPromote(it)} onStatus={(s) => void setStatus(it, s)} />
            ))}
          </div>
        )}

      {form && (
        <IdeaFormModal key={form === "new" ? "new" : form.id} idea={form === "new" ? null : form} brands={brands} defaultBrandId={brandId && brandId !== NO_BRAND ? brandId : null}
          onClose={() => setForm(null)}
          onSaved={(saved, created) => {
            const accepted = form !== "new" && form.status === "inbox";
            setItems((l) => (created ? [saved, ...(l ?? [])] : (l ?? []).map((x) => (x.id === saved.id ? saved : x))));
            setForm(null);
            if (created) setView("all");
            toast.success(created ? t("บันทึกไอเดียแล้ว", "Idea saved") : accepted ? t(`เพิ่ม "${saved.name}" เป็นไอเดียแล้ว`, `Added "${saved.name}" as an idea`) : t("บันทึกแล้ว", "Saved"));
          }} />
      )}
      {promote && (
        <PromoteModal idea={promote} onClose={() => setPromote(null)}
          onDone={(sheet) => {
            setItems((l) => (l ?? []).filter((x) => x.id !== promote.id));
            setPromote(null);
            toast.success(t(`เริ่มงาน ${sheet.code} แล้ว — เปิดใบงานให้`, `Started ${sheet.code}`));
            onPromoted(sheet.id);
          }}
          onStale={() => { setPromote(null); void load(); }} />
      )}
      {merge && (
        <MergeModal source={merge} targets={(items ?? []).filter((x) => x.id !== merge.id && (x.status === "open" || x.status === "paused"))}
          onClose={() => setMerge(null)}
          onDone={(target) => {
            setItems((l) => (l ?? []).filter((x) => x.id !== merge.id).map((x) => (x.id === target.id ? target : x)));
            setMerge(null);
            toast.success(t(`รวมเข้า "${target.name}" แล้ว`, `Merged into "${target.name}"`));
          }}
          onStale={() => { setMerge(null); void load(); }} />
      )}
      {isAdmin && consoleOpen && <LineConsole open={consoleOpen} onClose={() => { setConsoleOpen(false); setSetupKey((k) => k + 1); }} />}
      <ImageLightbox images={(lb?.keys ?? []).map((k) => ({ url: ideaImageUrl(k, 1600) }))} index={lb ? lb.i : -1}
        onClose={() => setLb(null)} onIndex={(i) => setLb((x) => (x ? { ...x, i } : x))} thumbnails />
    </div>
  );
}

function IdeaCard({ it, fit, small, canEdit, busy, onOpenImages, onEdit, onPromote, onStatus }: {
  it: DesignIdea; fit: Fit; small: boolean; canEdit: boolean; busy: boolean;
  onOpenImages: (i: number) => void; onEdit: () => void; onPromote: () => void; onStatus: (s: "open" | "paused" | "archived") => void;
}) {
  const t = useT();
  const archived = it.status === "archived", paused = it.status === "paused", promoting = it.status === "promoting";
  const cover = it.image_keys[0];
  const who = it.sender_name || it.created_by_name || t("ไม่ทราบชื่อ", "Unknown");
  const iconBtn = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50";
  return (
    <div className={`flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white ${paused ? "border-dashed border-slate-300" : "border-slate-200"}`}>
      <div className="relative">
        {cover ? (
          <button type="button" onClick={() => onOpenImages(0)} className="block w-full cursor-zoom-in bg-slate-50" title={t("กดเพื่อดูรูปเต็มจอ", "Open full screen")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ideaImageUrl(cover, 640)} alt={it.name} loading="lazy"
              className={`aspect-square w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${archived ? "grayscale" : ""}`} />
          </button>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-slate-50 text-slate-300"><Icon value="i:photo" className="text-[28px]" /></div>
        )}
        <span className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          archived || paused ? "border border-slate-200 bg-white/95 text-slate-600" : promoting ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>
          {archived ? t("เก็บแล้ว", "Archived") : paused ? <><Icon value="i:player-pause" className="text-[11px]" />{t("พักไว้", "Paused")}</> : promoting ? t("กำลังเริ่มงาน", "Starting") : t("ไอเดีย", "Idea")}
        </span>
        {it.source === "line" && <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700"><Icon value="i:brand-line" className="text-[11px]" />{t("จากไลน์", "LINE")}</span>}
        {it.image_keys.length > 1 && <span className="absolute bottom-1.5 right-1.5 rounded-full border border-slate-200 bg-white/95 px-2 py-0.5 text-[11px] text-slate-600">{t(`${it.image_keys.length} รูป`, `${it.image_keys.length} images`)}</span>}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col gap-1 ${small ? "p-2" : "p-2.5"}`}>
        <button type="button" onClick={canEdit && !promoting ? onEdit : undefined} disabled={!canEdit || promoting}
          className={`truncate text-left font-medium text-slate-800 enabled:hover:text-blue-700 disabled:cursor-default ${small ? "text-xs" : "text-sm"}`} title={it.name}>{it.name}</button>
        <div className="flex min-w-0 items-center gap-1 text-[11px] text-slate-400">
          <Icon value="i:user" className="shrink-0 text-[11px]" /><span className="truncate">{who} · {fmtIdeaDate(it.created_at)}</span>
        </div>
        {!small && (
          <>
            <div className="truncate text-[11px] text-slate-500">{it.brand_name ?? t("ไม่มีแบรนด์", "No brand")}</div>
            {it.points.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                {it.points.slice(0, 3).map((p, i) => <li key={i} className="break-words">{p}</li>)}
                {it.points.length > 3 && <li className="list-none text-slate-400">{t(`+${it.points.length - 3} ข้อ`, `+${it.points.length - 3} more`)}</li>}
              </ul>
            )}
            {it.links.length > 0 && <TaskLinkList links={it.links.slice(0, 3)} />}
          </>
        )}
        <div className="mt-auto flex gap-1 pt-1.5">
          {canEdit && !archived && !promoting && (
            <>
              <button type="button" onClick={onPromote} disabled={busy} title={t("เริ่มทำงานจริง (ได้เลข DS)", "Start a real job")}
                className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-slate-900 px-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                <Icon value="i:rocket" className="text-[13px]" />{small ? "" : <span className="truncate">{t("เริ่มทำงานจริง", "Start job")}</span>}
              </button>
              <button type="button" onClick={() => onStatus(paused ? "open" : "paused")} disabled={busy} className={iconBtn}
                title={paused ? t("เอากลับมา", "Resume") : t("พักไว้", "Pause")} aria-label={paused ? t("เอากลับมา", "Resume") : t("พักไว้", "Pause")}>
                <Icon value={paused ? "i:player-play" : "i:player-pause"} className="text-[14px]" />
              </button>
              <button type="button" onClick={() => onStatus("archived")} disabled={busy} className={iconBtn}
                title={t("เก็บ (กู้คืนได้)", "Archive (restorable)")} aria-label={t("เก็บ", "Archive")}>
                <Icon value="i:archive" className="text-[14px]" />
              </button>
            </>
          )}
          {canEdit && archived && (
            <button type="button" onClick={() => onStatus("open")} disabled={busy}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Icon value="i:arrow-back-up" className="text-[13px]" />{small ? "" : t("กู้คืน", "Restore")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** ป๊อปจด/แก้ไอเดีย — รูปอัปทันที (ImageAttachKeys) · ข้อ ๆ กด Enter = ข้อใหม่ · ลิงก์ http/https หลายลิงก์ */
function IdeaFormModal({ idea, brands, defaultBrandId, onClose, onSaved }: {
  idea: DesignIdea | null; brands: BrandSelectOption[]; defaultBrandId: string | null;
  onClose: () => void; onSaved: (idea: DesignIdea, created: boolean) => void;
}) {
  const t = useT();
  const toast = useToast();
  const accept = idea?.status === "inbox";   // รอคัดจากไลน์ → "เพิ่มเป็นไอเดีย" (บันทึกพร้อมเปลี่ยนเป็นไอเดียที่เปิดอยู่)
  const init = useRef({
    name: idea?.name ?? "", brand_id: idea?.brand_id ?? defaultBrandId ?? "",
    points: idea?.points.length ? idea.points : [""], links: idea?.links ?? [], image_keys: idea?.image_keys ?? [],
  });
  const [name, setName] = useState(init.current.name);
  const [brandId, setBrandId] = useState(init.current.brand_id);
  const [points, setPoints] = useState<string[]>(init.current.points);
  const [links, setLinks] = useState<TaskLink[]>(init.current.links);
  const [keys, setKeys] = useState<string[]>(init.current.image_keys);
  const [nameErr, setNameErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const clean = (ps: string[]) => ps.map((p) => p.trim()).filter(Boolean);
  const dirty = name !== init.current.name || brandId !== init.current.brand_id || JSON.stringify(clean(points)) !== JSON.stringify(clean(init.current.points))
    || JSON.stringify(links) !== JSON.stringify(init.current.links) || JSON.stringify(keys) !== JSON.stringify(init.current.image_keys);

  const save = async () => {
    if (!name.trim()) { setNameErr(true); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), brand_id: brandId || null, points: clean(points), links, image_keys: keys, ...(accept ? { status: "open" } : {}) };
      const res = idea
        ? await apiFetch(`/api/design-ideas/${idea.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await apiFetch("/api/design-ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      onSaved(j.data as DesignIdea, !idea);
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" hasUnsavedChanges={dirty && !saving}
      title={accept ? t("เพิ่มเป็นไอเดีย", "Add as an idea") : idea ? t("แก้ไอเดีย", "Edit idea") : t("จดไอเดีย", "New idea")}
      description={idea
        ? t(`จดโดย ${idea.sender_name || idea.created_by_name || "—"} · ${fmtIdeaDate(idea.created_at)}`, `By ${idea.sender_name || idea.created_by_name || "—"}`)
        : t("ยังไม่ใช่งานจริง — ไม่ได้เลข DS จนกว่าจะกด \"เริ่มทำงานจริง\" · ระบบจดชื่อคนจดกับวันที่ให้เอง", "Not a real job yet — no DS number until you start it")}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? t("กำลังบันทึก…", "Saving…") : accept ? t("เพิ่มเป็นไอเดีย", "Add as an idea") : idea ? t("บันทึก", "Save") : t("บันทึกไอเดีย", "Save idea")}
        </button>
      </>}>
      <div className="space-y-3">
        {accept && idea?.text_body && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <div className="mb-0.5 font-medium"><Icon value="i:brand-line" className="text-[12px]" /> {t(`ข้อความจากไลน์ (${idea.sender_name ?? "—"})`, "LINE message")}</div>
            <div className="whitespace-pre-wrap break-words text-emerald-800">{idea.text_body}</div>
            <div className="mt-1 text-[11px] text-emerald-700">{t("แตกเป็นข้อ ๆ และลิงก์ให้ด้านล่างแล้ว — แก้ได้ก่อนกดเพิ่ม", "Already split into points and links below — edit before adding")}</div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
          <label className="block">
            <span className="text-[11px] text-slate-500">{t("ชื่อไอเดีย", "Idea name")} <span className="text-rose-500">*</span></span>
            <input autoFocus value={name} maxLength={200} onChange={(e) => { setName(e.target.value); setNameErr(false); }} placeholder={t("เช่น กระเป๋าคาดอกผ้าร่ม", "e.g. Nylon chest bag")}
              className={`mt-0.5 h-9 w-full rounded-lg border px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${nameErr ? "border-rose-400" : "border-slate-200"}`} />
            {nameErr && <span className="text-xs text-rose-600">{t("ใส่ชื่อไอเดียก่อน", "Enter a name first")}</span>}
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500">{t("แบรนด์ (ไม่บังคับ)", "Brand (optional)")}</span>
            <BrandSelect brands={brands} value={brandId} onChange={setBrandId} emptyLabel={t("ไม่เลือกแบรนด์", "No brand")} className="mt-0.5 h-9 w-full" />
          </label>
        </div>
        <div>
          <span className="text-[11px] text-slate-500">{t("รายละเอียด (เป็นข้อ ๆ · Enter = ข้อใหม่ · ลบจนว่างแล้วกด Backspace = เอาข้อออก)", "Details (Enter = new point)")}</span>
          <PointsEditor value={points} onChange={setPoints} />
        </div>
        <div>
          <span className="text-[11px] text-slate-500">{t("Reference (ลิงก์อ้างอิง · ใส่ได้หลายลิงก์)", "Reference links")}</span>
          <LinksEditor value={links} onChange={setLinks} />
        </div>
        <div>
          <span className="text-[11px] text-slate-500">{t("รูป (หลายรูปได้ · รูปแรก = รูปปก)", "Images (first = cover)")}</span>
          <div className="mt-0.5"><ImageAttachKeys value={keys} onChange={setKeys} folder={IDEA_IMAGE_FOLDER} /></div>
        </div>
      </div>
    </ERPModal>
  );
}

function PointsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => { if (focus !== null) { refs.current[focus]?.focus(); setFocus(null); } }, [focus, value.length]);
  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (value.length >= MAX_IDEA_POINTS) return;
      onChange([...value.slice(0, i + 1), "", ...value.slice(i + 1)]); setFocus(i + 1);
    } else if (e.key === "Backspace" && value[i] === "" && value.length > 1) {
      e.preventDefault();
      onChange(value.filter((_, j) => j !== i)); setFocus(Math.max(0, i - 1));
    }
  };
  return (
    <div className="mt-0.5 space-y-1">
      {value.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-3 text-center text-slate-400">•</span>
          <input ref={(el) => { refs.current[i] = el; }} value={p} maxLength={300} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} onKeyDown={onKey(i)}
            placeholder={i === 0 ? t("เช่น ผ้าร่มกันน้ำ สีดำ/กรม", "e.g. waterproof nylon") : t("ข้อถัดไป", "Next point")} aria-label={t(`รายละเอียดข้อ ${i + 1}`, `Point ${i + 1}`)}
            className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      ))}
    </div>
  );
}

function LinksEditor({ value, onChange }: { value: TaskLink[]; onChange: (v: TaskLink[]) => void }) {
  const t = useT();
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    const u = parseTaskLinkUrl(url);
    if (!u) { setErr(url.trim() ? t("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://", "Link must start with http:// or https://") : t("วางลิงก์ก่อน", "Paste a link first")); return; }
    if (value.some((l) => l.url === u)) { setErr(t("มีลิงก์นี้แล้ว", "Already added")); return; }
    if (value.length >= MAX_TASK_LINKS) { setErr(t(`ใส่ได้สูงสุด ${MAX_TASK_LINKS} ลิงก์`, `Up to ${MAX_TASK_LINKS} links`)); return; }
    onChange([...value, { url: u }]); setUrl(""); setErr(null);
  };
  return (
    <div className="mt-0.5">
      <div className="flex gap-1.5">
        <input value={url} onChange={(e) => { setUrl(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="https://www.pinterest.com/pin/..." aria-label={t("ลิงก์อ้างอิง", "Reference link")}
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={add} className="h-8 shrink-0 rounded-md border border-slate-300 px-2.5 text-xs text-slate-700 hover:bg-slate-50">＋ {t("เพิ่มลิงก์", "Add link")}</button>
      </div>
      {err && <p className="pt-1 text-xs text-rose-600">{err}</p>}
      <TaskLinkList links={value} onRemove={(u) => onChange(value.filter((l) => l.url !== u))} className="mt-1.5" />
    </div>
  );
}

/** ป๊อปยืนยัน "เริ่มทำงานจริง" — บอกว่าระบบจะทำอะไร + เลือกเช็กลิสต์ (ตั้งต้น = Checklist งานใหม่) */
function PromoteModal({ idea, onClose, onDone, onStale }: {
  idea: DesignIdea; onClose: () => void; onDone: (sheet: { id: string; code: string }) => void; onStale: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [checklist, setChecklist] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const canPromote = (IDEA_PROMOTABLE as readonly string[]).includes(idea.status);
  const go = async () => {
    setBusy(true);
    try {
      const body = { name: idea.name, brand_id: idea.brand_id, detail: ideaDetailHtml(idea.points, idea.links) || null, idea_id: idea.id, ...(checklist ? { checklist } : {}) };
      const res = await apiFetch("/api/design-sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (j.error) { if (res.status === 409) { toast.error(j.error); onStale(); return; } throw new Error(j.error); }
      onDone({ id: String(j.id), code: String(j.code) });
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("เริ่มงานไม่สำเร็จ", "Failed to start the job")); }
    finally { setBusy(false); }
  };
  const row = "flex items-start gap-2 border-b border-slate-100 py-2 text-[13px] last:border-b-0";
  return (
    <ERPModal open onClose={onClose} size="md" closeOnBackdrop={false}
      title={t(`เริ่มทำงานจริง "${idea.name}"?`, `Start a real job from "${idea.name}"?`)}
      description={t("ระบบจะทำตามนี้ให้ · ไอเดียนี้จะย้ายออกจากหน้าไอเดีย", "The system will do the following")}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => void go()} disabled={busy || !canPromote}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          <Icon value="i:rocket" className="text-[15px]" />{busy ? t("กำลังเริ่มงาน…", "Starting…") : t("เริ่มทำงานจริง", "Start job")}
        </button>
      </>}>
      <div>
        <div className={row}><Icon value="i:hash" className="mt-0.5 text-[15px] text-slate-500" /><div>{t("ได้เลขงาน DS ใหม่ (ออกให้ตอนกดยืนยัน) · ขึ้นบอร์ดสถานะแรก", "Gets a new DS number · goes to the first board column")}</div></div>
        <div className={row}><Icon value="i:photo" className="mt-0.5 text-[15px] text-slate-500" />
          <div>{t(`ย้ายไปใบงาน: รูป ${idea.image_keys.length} · รายละเอียด ${idea.points.length} ข้อ · ลิงก์ ${idea.links.length}`, `Moves to the job: ${idea.image_keys.length} images · ${idea.points.length} points · ${idea.links.length} links`)}
            <div className="text-[11px] text-slate-500">{t("รูปไปอยู่แกลเลอรีของใบงาน · รายละเอียดและลิงก์ไปอยู่ช่องรายละเอียด", "Images go to the job gallery · details and links go to the description")}</div></div>
        </div>
        <div className={row}><Icon value="i:list-check" className="mt-0.5 text-[15px] text-slate-500" />
          <div className="min-w-0 flex-1">
            <ChecklistSeedPicker presetType={DESIGN_WAITING.presetType} value={checklist} onChange={setChecklist} label={t("⏳ รออะไรอยู่ ที่จะใส่ให้ (กดชิปเพื่อเอาออก/ใส่)", "Checklist to add")} />
          </div>
        </div>
      </div>
    </ERPModal>
  );
}

/** แถวในกล่องรอคัด (ส่งมาจากกลุ่มไลน์) — คนส่ง · เวลา · รูป · ลิงก์ · ข้อความ · ปุ่มคัด */
function InboxCard({ it, canEdit, busy, onOpenImages, onAccept, onMerge, onReject }: {
  it: DesignIdea; canEdit: boolean; busy: boolean; onOpenImages: (i: number) => void; onAccept: () => void; onMerge: () => void; onReject: () => void;
}) {
  const t = useT();
  const when = new Date(it.created_at);
  const timeTxt = Number.isNaN(when.getTime()) ? "" : `${fmtIdeaDate(it.created_at)} ${when.toLocaleTimeString(tr("th-TH", "en-GB"), { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-medium text-emerald-700">{(it.sender_name || "?").slice(0, 1)}</span>
        <span className="text-sm font-medium text-slate-800">{it.sender_name || t("ไม่ทราบชื่อ", "Unknown")}</span>
        <span className="text-[11px] text-slate-400">{timeTxt}</span>
        <span className="ml-auto truncate text-xs text-slate-500" title={it.name}>{it.name}</span>
      </div>
      {it.image_keys.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {it.image_keys.map((k, i) => (
            <button key={k} type="button" onClick={() => onOpenImages(i)} className="cursor-zoom-in" title={t("กดเพื่อดูรูปเต็มจอ", "Open full screen")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ideaImageUrl(k, 240)} alt="" loading="lazy" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
            </button>
          ))}
        </div>
      )}
      {it.links.length > 0 && <TaskLinkList links={it.links} className="mb-1.5" />}
      {it.text_body && <p className="mb-2 line-clamp-3 whitespace-pre-wrap break-words text-xs text-slate-600">{it.text_body}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={onAccept} disabled={busy}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-amber-500 px-2.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">
            <Icon value="i:bulb" className="text-[13px]" /> {t("เพิ่มเป็นไอเดีย", "Add as idea")}
          </button>
          <button type="button" onClick={onMerge} disabled={busy}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Icon value="i:link" className="text-[13px]" /> {t("รวมกับไอเดียที่มี", "Merge into idea")}
          </button>
          <button type="button" onClick={onReject} disabled={busy}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            <Icon value="i:x" className="text-[13px]" /> {t("ไม่เอา", "Discard")}
          </button>
        </div>
      )}
    </div>
  );
}

/** รวมชุดรอคัด (หรือไอเดีย) เข้าไอเดียที่มีอยู่ — รูป/ลิงก์/ข้อ ๆ ต่อท้ายปลายทาง */
function MergeModal({ source, targets, onClose, onDone, onStale }: {
  source: DesignIdea; targets: DesignIdea[]; onClose: () => void; onDone: (target: DesignIdea) => void; onStale: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = targets.filter((x) => !q.trim() || `${x.name} ${x.brand_name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const go = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/design-ideas/${source.id}/merge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ into: pick }) });
      const j = await res.json();
      if (j.error) { if (res.status === 409) { toast.error(j.error); onStale(); return; } throw new Error(j.error); }
      onDone(j.data as DesignIdea);
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("รวมไม่สำเร็จ", "Merge failed")); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="md" title={t("รวมกับไอเดียที่มี", "Merge into an existing idea")}
      description={t(`รูป ${source.image_keys.length} · ลิงก์ ${source.links.length} · ข้อ ${source.points.length} จาก "${source.name}" จะต่อท้ายไอเดียที่เลือก`, "Images, links and points are appended to the chosen idea")}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => void go()} disabled={busy || !pick} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? t("กำลังรวม…", "Merging…") : t("รวม", "Merge")}
        </button>
      </>}>
      {targets.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{t("ยังไม่มีไอเดียที่เปิดอยู่ให้รวม — กด \"เพิ่มเป็นไอเดีย\" แทน", "No open ideas to merge into — add it as a new idea instead")}</p>
      ) : (
        <div className="space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นชื่อไอเดีย", "Search ideas")} aria-label={t("ค้นชื่อไอเดีย", "Search ideas")}
            className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {list.map((x) => (
              <label key={x.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${pick === x.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="radio" name="merge-into" checked={pick === x.id} onChange={() => setPick(x.id)} className="h-4 w-4" />
                {x.image_keys[0]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={ideaImageUrl(x.image_keys[0], 120)} alt="" className="h-9 w-9 rounded object-cover" />
                  : <span className="flex h-9 w-9 items-center justify-center rounded bg-slate-100 text-slate-300"><Icon value="i:photo" /></span>}
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{x.brand_name ?? t("ไม่มีแบรนด์", "No brand")}</span>
              </label>
            ))}
            {list.length === 0 && <p className="py-4 text-center text-xs text-slate-400">{t("ไม่พบไอเดียที่ตรงกับคำค้น", "No matching ideas")}</p>}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
