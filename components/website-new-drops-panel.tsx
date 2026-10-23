"use client";

/**
 * 🆕 แท็บ "มาใหม่" ในหน้าจัดการเว็บร้าน — สร้างชุดสินค้ามาใหม่ (Drop) ตั้งเวลาเปิด/หมดช่วงใหม่
 * เว็บร้าน: หน้า /new (ชุดล่าสุด + ชุดก่อน ๆ + "เร็ว ๆ นี้" นับถอยหลัง) · ป้าย "ใหม่" บนการ์ด · Section แหล่ง "ชุดมาใหม่ที่เปิดอยู่"
 * ข้อมูล: /api/website/new-drops (ตาราง store_new_drops) · กฎกลาง lib/website-new-drops
 * ของกลาง: ERPModal · ConfirmDialog · WebsiteProductPicker · MediaUploadField · ERPDateTime24 · 2 ภาษา (RecordLangBar + BilingualText)
 *   · 🖼 รูปแทรกในตารางสินค้ารายชุด = ListingInsertsEditor (ตัวเดียวกับหน้ารายการสินค้า)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadWebNewDrops } from "@/lib/website-data";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { MediaUploadField } from "@/components/media-upload-field";
import { ERPDateTime24 } from "@/components/form";
import { BilingualText, ContentLangProvider, RecordLangBar } from "@/components/bilingual-field";
import { DROP_DEFAULT_DAYS, DROP_MAX_CODES, DROP_STATUS_LABEL, dropStatus, orderDrops, type DropStatus, type NewDrop } from "@/lib/website-new-drops";
import { DropPageBuilder } from "@/components/website-drop-page-builder";
import { ListingInsertsEditor } from "@/components/website-listing-panel";
import { normalizeListingInserts } from "@/lib/website-listing";

const keyUrl = (key: string, w = 480) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
/** ISO ↔ เวลาไทย "YYYY-MM-DDTHH:mm" (ช่อง ERPDateTime24) */
const isoToThai = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString().slice(0, 16) : "");
const thaiToIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : "");
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ไม่หมด";
function untilText(iso: string, now: number) {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return "";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `อีก ${d} วัน ${h} ชม.` : h > 0 ? `อีก ${h} ชม. ${m} นาที` : `อีก ${m} นาที`;
}
const STATUS_CLS: Record<DropStatus, string> = {
  upcoming: "bg-amber-50 text-amber-700 border-amber-200",
  live: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ended: "bg-slate-100 text-slate-500 border-slate-200",
};

type Draft = Omit<NewDrop, "id"> & { id?: string; _i18n?: unknown };
const blank = (): Draft => {
  const start = new Date(Date.now() + 86400000);
  start.setUTCHours(3, 0, 0, 0); // 10:00 เวลาไทย พรุ่งนี้
  return { title: "", title_en: "", subtitle: "", subtitle_en: "", imageKey: null, imageMobileKey: null, codes: [], startAt: start.toISOString(), endAt: new Date(start.getTime() + DROP_DEFAULT_DAYS * 86400000).toISOString(), hideUntilStart: true, inserts: [] };
};

export function WebsiteNewDropsPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [drops, setDrops] = useState<NewDrop[] | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [del, setDel] = useState<NewDrop | null>(null);
  // 🧱 หน้าของแต่ละชุด: ชุดไหนจัดเองแล้ว/มีร่าง (ป้ายบนการ์ด) · ชุดที่กำลังจัดหน้า (เปิดตัวจัดหน้าแทนรายการ)
  const [pages, setPages] = useState<Record<string, { custom: boolean; draft: boolean }>>({});
  const [pageFor, setPageFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const j = await loadWebNewDrops<NewDrop, { custom: boolean; draft: boolean }>(shopSlug, true);
      if (j.error) throw new Error(j.error);
      setDrops(j.drops ?? []);
      setPages(j.pages ?? {});
    } catch (e) {
      toast.error((e as Error).message);
      setDrops([]);
    }
  }, [shopSlug, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const o = orderDrops(drops ?? [], now);
    return { upcoming: o.upcoming, live: o.started.filter((d) => dropStatus(d, now) === "live"), ended: o.started.filter((d) => dropStatus(d, now) === "ended") };
  }, [drops, now]);

  /** บันทึกชุด → คืน id ของชุด (สำเร็จ) หรือ null */
  const save = async (): Promise<string | null> => {
    if (!edit) return null;
    setSaving(true);
    setErr(null);
    try {
      const { id, _i18n: _drop, ...drop } = edit;
      void _drop;
      const r = await apiFetch("/api/website/new-drops", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { shopId, id, drop } : { shopId, drop }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success(id ? "บันทึกชุดแล้ว — เว็บอัปเดตภายใน ~1 นาที" : "สร้างชุดแล้ว — เว็บอัปเดตภายใน ~1 นาที");
      setEdit(null);
      await load();
      return id ?? (j?.drop?.id as string | undefined) ?? null;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!del) return;
    const r = await apiFetch(`/api/website/new-drops?id=${encodeURIComponent(del.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast.error(j?.error || "ลบไม่สำเร็จ");
    else toast.success("ลบชุดแล้ว (สินค้ายังอยู่บนเว็บตามปกติ)");
    setDel(null);
    await load();
  };

  const card = (d: NewDrop) => {
    const st = dropStatus(d, now);
    return (
      <div key={d.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="w-36 shrink-0 rounded-lg overflow-hidden bg-slate-100" style={{ aspectRatio: "16 / 9" }}>
          {d.imageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={keyUrl(d.imageKey)} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-2xl">🆕</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 truncate">{d.title}</span>
            {d.title_en && <span className="text-xs text-slate-400 truncate">{d.title_en}</span>}
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLS[st]}`}>{DROP_STATUS_LABEL[st].th}</span>
            {st === "upcoming" && d.hideUntilStart && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">🙈 ซ่อนสินค้าจนเปิด</span>}
            {pages[d.id]?.custom && <span className="rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[11px] text-violet-700">🧱 จัดหน้าเองแล้ว</span>}
            {pages[d.id]?.draft && <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] text-amber-700">✎ หน้ามีร่างยังไม่เผยแพร่</span>}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            เปิด {fmt(d.startAt)} → {d.endAt ? `หมดช่วงใหม่ ${fmt(d.endAt)}` : "ไม่ตั้งเวลาหมด"}
            {st === "upcoming" && <span className="ml-1 text-amber-700">· {untilText(d.startAt, now)}</span>}
          </p>
          <p className="text-xs text-slate-500">สินค้า {d.codes.length} รุ่น{d.codes.length ? ` · ${d.codes.slice(0, 5).join(", ")}${d.codes.length > 5 ? " …" : ""}` : " — ยังไม่ได้เลือกสินค้า"}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button type="button" onClick={() => { setErr(null); setEdit({ ...d }); }} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-400">
            ✏️ แก้ไข
          </button>
          <button type="button" onClick={() => setPageFor(d.id)} className="rounded-lg border border-violet-200 px-2.5 py-1 text-xs text-violet-700 hover:border-violet-400" title="จัดหน้า /new/<ชุด> ด้วยตัวจัดหน้า + พรีวิว">
            🧱 จัดหน้า
          </button>
          <button type="button" onClick={() => setDel(d)} className="text-xs text-red-600 hover:underline">
            ลบ
          </button>
        </div>
      </div>
    );
  };
  const section = (title: string, list: NewDrop[], hint: string) =>
    list.length > 0 && (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">
          {title} <span className="font-normal text-slate-400">({list.length}) · {hint}</span>
        </h3>
        {list.map(card)}
      </section>
    );

  const e = edit;
  const rec = (e ?? {}) as unknown as Record<string, unknown>;
  const startPast = !!e && Date.parse(e.startAt) <= now;

  // 🧱 กำลังจัดหน้าของชุด → ตัวจัดหน้าเต็มพื้นที่แท็บ (กด ← ชุดทั้งหมด กลับมารายการ)
  if (pageFor)
    return (
      <DropPageBuilder
        shopSlug={shopSlug}
        shopId={shopId}
        dropId={pageFor}
        onClose={(changed) => {
          setPageFor(null);
          if (changed) void load();
        }}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-base font-semibold text-slate-800">🆕 มาใหม่เป็นชุด</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ตั้งเวลาปล่อยสินค้าใหม่เป็นชุด ๆ · หน้าเว็บ <code>/new</code> โชว์ชุดล่าสุด + ชุดก่อน ๆ + &quot;เร็ว ๆ นี้&quot; นับถอยหลัง · สินค้าในชุดที่เปิดอยู่ได้ป้าย &quot;ใหม่&quot; · ลิงก์เมนู &quot;มาใหม่&quot; → <code>/new</code>
          </p>
        </div>
        <button type="button" onClick={() => { setErr(null); setEdit(blank()); }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          ➕ สร้างชุดใหม่
        </button>
      </div>

      {drops === null ? (
        <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</p>
      ) : drops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
          ยังไม่มีชุดมาใหม่ — หน้า <code>/new</code> จะโชว์สินค้าที่ขึ้นร้านล่าสุดให้อัตโนมัติไปก่อน
          <div className="mt-3">
            <button type="button" onClick={() => setEdit(blank())} className="text-blue-600 hover:underline">
              ➕ สร้างชุดแรก
            </button>
          </div>
        </div>
      ) : (
        <>
          {section("⏳ เร็ว ๆ นี้", groups.upcoming, "ยังไม่ถึงเวลาเปิด — หน้าเว็บโชว์รูปปก + นับถอยหลัง")}
          {section("🟢 เปิดอยู่", groups.live, "สินค้าได้ป้าย \"ใหม่\" · ชุดล่าสุดขึ้นบนสุดของ /new")}
          {section("📦 จบช่วงใหม่แล้ว", groups.ended, "ยังอยู่ในหน้า /new ส่วนชุดก่อนหน้า (ไม่มีป้ายใหม่)")}
        </>
      )}

      <ERPModal
        open={!!e}
        onClose={() => !saving && setEdit(null)}
        title={e?.id ? `แก้ชุด: ${e.title || ""}` : "สร้างชุดมาใหม่"}
        size="lg"
        footer={
          <div className="flex w-full items-center gap-2">
            {err && <span className="text-xs text-red-600">⚠ {err}</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setEdit(null)} disabled={saving} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              ยกเลิก
            </button>
            {/* 🧱 จัดหน้า /new/<ชุด> — บันทึกข้อมูลชุดก่อน แล้วเปิดตัวจัดหน้า (ชุดใหม่ก็ได้ บันทึกแล้วได้ id) */}
            <button
              type="button"
              onClick={async () => {
                const id = await save();
                if (id) setPageFor(id);
              }}
              disabled={saving}
              className="rounded-lg border border-violet-300 px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              title="บันทึกชุดนี้ แล้วจัดหน้า /new/<ชุด> ด้วยตัวจัดหน้า + พรีวิว"
            >
              🧱 บันทึก + จัดหน้าชุดนี้
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : "💾 บันทึกชุด"}
            </button>
          </div>
        }
      >
        {e && (
          <ContentLangProvider>
            <div className="space-y-4">
              <RecordLangBar value={rec} keys={["title", "subtitle"]} onPatch={(p) => setEdit({ ...e, ...(p as Partial<Draft>) })} note="ชื่อ/คำโปรยของชุด ไทย | อังกฤษ (หน้า /en)" />
              <div className="grid gap-3 sm:grid-cols-2">
                <BilingualText label="ชื่อชุด" maxLength={80} placeholder="เช่น ชุดปลายเดือนตุลา / Holiday Drop" value={rec} fieldKey="title" onPatch={(p) => setEdit({ ...e, ...(p as Partial<Draft>) })} />
                <BilingualText label="คำโปรย (ไม่ใส่ก็ได้)" maxLength={240} placeholder="เช่น ลายใหม่ 6 รุ่น สีพิเศษเฉพาะชุดนี้" value={rec} fieldKey="subtitle" onPatch={(p) => setEdit({ ...e, ...(p as Partial<Draft>) })} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">⏰ เวลาเปิดชุด (เวลาไทย)</span>
                  <ERPDateTime24 value={isoToThai(e.startAt)} onChange={(v) => v && setEdit({ ...e, startAt: thaiToIso(v) })} />
                  <p className="mt-1 text-[11px] text-slate-500">{startPast ? "เวลานี้ผ่านมาแล้ว = เปิดทันทีหลังบันทึก" : untilText(e.startAt, now) + " · ก่อนเวลานี้หน้าเว็บโชว์ \"เร็ว ๆ นี้\" + นับถอยหลัง"}</p>
                </div>
                <div>
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">🏷 หมดช่วง &quot;ใหม่&quot; (ป้ายหาย · ย้ายไปชุดก่อนหน้า)</span>
                  {e.endAt ? (
                    <ERPDateTime24 value={isoToThai(e.endAt)} onChange={(v) => setEdit({ ...e, endAt: v ? thaiToIso(v) : null })} />
                  ) : (
                    <p className="h-9 flex items-center text-sm text-slate-500">ไม่หมด (ป้ายใหม่ค้างจนกว่าจะตั้งเวลา)</p>
                  )}
                  <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={!e.endAt} onChange={(ev) => setEdit({ ...e, endAt: ev.target.checked ? null : new Date(Date.parse(e.startAt) + DROP_DEFAULT_DAYS * 86400000).toISOString() })} />
                    ไม่ตั้งเวลาหมด
                  </label>
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-blue-600" checked={e.hideUntilStart} onChange={(ev) => setEdit({ ...e, hideUntilStart: ev.target.checked })} />
                <span>
                  🙈 ซ่อนสินค้าในชุดจากทั้งเว็บจนถึงเวลาเปิด (ปล่อยพร้อมกันแบบ Drop)
                  <span className="block text-[11px] text-slate-500">ติ๊ก = ก่อนเวลาเปิด ลูกค้าหาสินค้าพวกนี้ไม่เจอเลย (หน้ารวม/ค้นหา/หน้าสินค้า/สั่งซื้อ) · สินค้าที่อยู่ในชุดอื่นที่เปิดแล้วไม่ถูกซ่อน</span>
                </span>
              </label>

              <div>
                <span className="block text-[11px] font-medium text-slate-500 mb-1">🛍 สินค้าในชุด (เรียงตามที่เลือก · สูงสุด {DROP_MAX_CODES})</span>
                <WebsiteProductPicker shopSlug={shopSlug} value={e.codes} max={DROP_MAX_CODES} onChange={(codes) => setEdit({ ...e, codes })} />
                <p className="mt-1 text-[11px] text-slate-500">ต้องเพิ่มสินค้าเข้า &quot;สินค้าบนเว็บ&quot; และเผยแพร่ไว้ก่อน (ถ้าตั้งซ่อน ระบบซ่อนให้เองจนถึงเวลาเปิด)</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MediaUploadField label="🖥 รูปปก คอม (16:9)" hint="แนะนำ 2560×1440 · โชว์หัวชุดในหน้า /new และการ์ด เร็ว ๆ นี้" value={e.imageKey ? { kind: "image", key: e.imageKey } : null} onChange={(m) => setEdit({ ...e, imageKey: m?.key ?? null })} allowVideo={false} folder="storefront-drops" previewRatio="16 / 9" />
                <MediaUploadField label="📱 รูปปก มือถือ (4:5)" hint="แนะนำ 1080×1350 · ว่าง = ใช้ของคอม" value={e.imageMobileKey ? { kind: "image", key: e.imageMobileKey } : null} onChange={(m) => setEdit({ ...e, imageMobileKey: m?.key ?? null })} allowVideo={false} folder="storefront-drops" previewRatio="4 / 5" />
              </div>

              {/* 🖼 รูปแทรกในตารางสินค้าของชุดนี้ — ของกลางเดียวกับรูปแทรกหน้ารายการสินค้า (ListingInsertsEditor) */}
              <div>
                <span className="block text-[11px] font-medium text-slate-500 mb-1">🖼 รูปแทรกในตารางสินค้าของชุด (ไม่ใส่ก็ได้)</span>
                <ListingInsertsEditor
                  where="drop"
                  list={normalizeListingInserts(e.inserts)}
                  onChange={(inserts) => setEdit({ ...e, inserts })}
                  categories={[]}
                  products={e.codes.map((code) => ({ code, name: "" }))}
                />
              </div>
            </div>
          </ContentLangProvider>
        )}
      </ERPModal>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        title="ลบชุดนี้?"
        message={del ? `ลบชุด "${del.title}" — สินค้าไม่ถูกลบ แค่ไม่อยู่ในชุดแล้ว (ถ้าชุดยังไม่เปิดและตั้งซ่อนไว้ สินค้าจะโผล่บนเว็บทันที)` : ""}
        confirmText="ลบชุด"
        cancelText="ยกเลิก"
      />
    </div>
  );
}
