"use client";

/**
 * ดูและแก้ก่อนสร้าง "ฉบับร่าง" บน TikTok Shop (ของกลาง) — แท็บ TikTok ในตัวช่วยลงสินค้า (AddToPlatformWizard ขั้น "ดูและแก้")
 * --------------------------------------------------------------------------
 * ข้อมูล = GET /api/tiktok-shop/create-product?parent_sku_id= (ตัวประกอบเดียวกับตอนสร้างจริง — lib/tiktok-create-plan)
 * แก้แล้วเขียนลง "ร่าง TikTok" (PATCH /api/product-platforms) — ไม่แก้ข้อมูลสินค้าในระบบ:
 *   ชื่อ / รายละเอียด / หมวด → ร่าง · รูป → extra.tiktok_images · น้ำหนัก (แทนของสินค้า) → extra.tiktok_weight
 * ลงเป็นฉบับร่างเสมอ (ไม่ขึ้นขาย · สต๊อกตั้งต้นในร่าง 1 ชิ้น เพราะ TikTok บังคับ) — ช่องบังคับของหมวด/สต๊อกจริง กรอกใน Seller Center ก่อนกดเผยแพร่
 * ของกลางที่ใช้: ListingImageGrid/ListingImagePicker (รูป) · PlatformCategoryPicker (หมวด) · state-views · Icon
 * ห้ามใช้: แก้สินค้าที่มีบน TikTok แล้ว (ใช้ลิ้นชักสินค้าบนร้าน)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PlatformCategoryPicker } from "@/components/platform-category-picker";
import { ListingImageGrid, ListingImagePicker, listingImgSrc, useSystemImages } from "@/components/platform-catalog/listing-images";
import { noteToText } from "@/lib/rich-note";
import { TTS_MAX_IMAGES } from "@/lib/tiktok-listing-edit";
import type { TtsCreatePreview } from "@/lib/tiktok-create-plan";

type LastAttempt = { status: string | null; at: string | null; error: string | null; product_id: string | null };
type Resp = { preview: TtsCreatePreview | null; blockers?: string[]; live?: boolean; mode?: "draft"; platform_id?: string; brand_id?: string | null; last_attempt?: LastAttempt | null; error: string | null };
const thDateTime = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
type EditKey = "name" | "desc" | "weight" | null;
const baht = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH"));

export function TiktokCreatePreviewEditor({ parentId, canEdit, onLoaded }: {
  parentId: string;
  canEdit: boolean;
  /** โหลดแล้ว — ให้ตัวช่วยรู้จำนวนข้อที่ขาด */
  onLoaded?: (pv: TtsCreatePreview, blockers: string[]) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditKey>(null);
  const [val, setVal] = useState("");
  const [imgs, setImgs] = useState<string[] | null>(null);
  const [picker, setPicker] = useState(false);
  const sys = useSystemImages(parentId);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/tiktok-shop/create-product?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json()) as Resp;
      if (j.error || !j.preview) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j); setImgs(null); onLoaded?.(j.preview, j.blockers ?? []);
    } catch (e) { setErr((e as Error).message || "โหลดไม่สำเร็จ"); }
  }, [parentId, onLoaded]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const pv = data?.preview ?? null;
  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    if (!pv || !data?.platform_id) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentId, platform_id: data.platform_id, ...body }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      toast.success(okMsg); setEdit(null); await load();
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const patchExtra = (partial: Record<string, unknown>, okMsg: string) => patch({ extra: { ...(pv?.draft_extra ?? {}), ...partial } }, okMsg);

  if (err) return <ErrorState title="โหลดข้อมูลที่จะส่ง TikTok ไม่สำเร็จ" hint={err} onRetry={() => void load()} className="py-6" />;
  if (!pv || !data) return <LoadingState label="กำลังเตรียมข้อมูลที่จะส่ง TikTok…" className="py-6" />;

  const blockers = data.blockers ?? [];
  const curImgs = imgs ?? pv.images.refs;
  const imgDirty = !!imgs && imgs.join("|") !== pv.images.refs.join("|");

  const fieldRow = (k: Exclude<EditKey, null>, label: string, shown: React.ReactNode, src: string, start: string, opts: { multiline?: boolean; bad?: boolean; save: (v: string) => void; placeholder?: string }) => (
    <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="min-w-0">
        {edit === k ? (
          <div className="space-y-1.5">
            {opts.multiline
              ? <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={6} placeholder={opts.placeholder} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              : <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={opts.placeholder} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />}
            <div className="flex gap-1.5">
              <button type="button" disabled={saving} onClick={() => opts.save(val)} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง TikTok</button>
              <button type="button" onClick={() => setEdit(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className={`min-w-0 flex-1 break-words text-sm ${opts.bad ? "text-rose-600" : "text-slate-800"}`}>{shown}</div>
            {canEdit && <button type="button" onClick={() => { setEdit(k); setVal(start); }} className="shrink-0 text-xs text-violet-700 hover:underline">แก้</button>}
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {src}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Icon name="info" /> ลงเป็น <b>ฉบับร่าง</b> ใน Seller Center — ยังไม่ขึ้นขาย · ใส่สต๊อกตั้งต้นในร่าง {pv.stock.qty} ชิ้นต่อตัวเลือก (TikTok บังคับแม้เป็นร่าง) · หลังสร้างให้เข้า Seller Center › สินค้า › ฉบับร่าง ตรวจ/กรอกช่องที่เหลือ/<b>แก้สต๊อกเป็นจำนวนจริง</b> แล้วกดเผยแพร่เอง
      </p>
      {data.last_attempt && <LastAttemptBox a={data.last_attempt} />}
      {(pv.missing.length > 0 || blockers.length > 0) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {pv.missing.length > 0 && <div><Icon name="warning" /> ยังขาด: {pv.missing.join(" · ")}</div>}
          {blockers.map((b) => <div key={b}><Icon name="warning" /> {b}</div>)}
        </div>
      )}
      {pv.warnings.length > 0 && <ul className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{pv.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

      {/* รูป */}
      <div>
        <ListingImageGrid images={curImgs} onChange={(next) => setImgs(next)} canEdit={canEdit} max={TTS_MAX_IMAGES} platformName="TikTok" dragGroup="tiktok-create-images"
          onOpen={() => {}} onAdd={() => { setPicker(true); sys.load(); }} canAdd={canEdit}
          note="รูปแรก = ปก (ควรพื้นขาว) · ระบบทำเป็น JPG จัตุรัสพื้นขาวแล้วฝากกับ TikTok ให้ตอนสร้าง · TikTok แนะนำ ≥ 5 รูป" />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>มาจาก: {imgDirty ? "ที่เลือกตอนนี้ (ยังไม่บันทึก)" : pv.images.src}</span>
          {canEdit && imgDirty && <button type="button" disabled={saving || curImgs.length === 0} onClick={() => void patchExtra({ tiktok_images: curImgs }, "บันทึกรูปแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกรูปที่เลือก</button>}
          {canEdit && imgDirty && <button type="button" onClick={() => setImgs(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>}
          {canEdit && !imgDirty && pv.images.custom && <button type="button" disabled={saving} onClick={() => { const ex = { ...pv.draft_extra }; delete ex.tiktok_images; void patch({ extra: ex }, "กลับไปใช้รูปอัตโนมัติ"); }} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปใช้รูปอัตโนมัติ</button>}
        </div>
        <ListingImagePicker open={picker} onClose={() => setPicker(false)} mode="product" title="เลือกรูปสินค้าสำหรับ TikTok"
          description={`เลือกได้อีก ${Math.max(0, TTS_MAX_IMAGES - curImgs.length)} รูป (TikTok รับไม่เกิน ${TTS_MAX_IMAGES})`}
          matchedParent={parentId} matchedCode={pv.parent_code} sysImages={sys.images} isUsed={(ref) => curImgs.includes(ref)} full={curImgs.length >= TTS_MAX_IMAGES}
          onPick={(ref) => setImgs((xs) => [...(xs ?? pv.images.refs), ref].slice(0, TTS_MAX_IMAGES))} storageKey="tiktok-create-image-picker" />
      </div>

      {/* ข้อความ */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
        {fieldRow("name", "ชื่อ", pv.name.value || "(ยังไม่มีชื่อ)", pv.name.src, pv.name.value, { bad: !pv.name.value, save: (v) => void patch({ title: v.trim() || null }, "บันทึกชื่อแล้ว"), placeholder: "TikTok ไทย 25–255 ตัวอักษร" })}
        <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-xs text-slate-500">หมวด TikTok</span>
          <div className="min-w-0">
            <div className={`text-sm ${pv.category.id ? "text-slate-800" : "text-rose-600"}`}>{pv.category.label || "ยังไม่ได้เลือก — ต้องเลือกก่อนลง"}</div>
            {canEdit && data.platform_id && <div className="mt-1 max-w-md"><PlatformCategoryPicker platformId={data.platform_id} placeholder="เปลี่ยนหมวด TikTok (พิมพ์ค้น เช่น กระเป๋า / wallet)" onPick={(label) => void patch({ category_path: label }, "บันทึกหมวดแล้ว")} /></div>}
            <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.category.src}</div>
          </div>
        </div>
        <div className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-xs text-slate-500">แบรนด์</span>
          <div><div className="text-sm text-slate-800">{pv.brand.name ?? <span className="text-slate-400">ไม่ใส่</span>}</div><div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.brand.src}</div></div>
        </div>
        {fieldRow("desc", "รายละเอียด", pv.description.value ? <div className="line-clamp-6 whitespace-pre-line text-slate-700">{noteToText(pv.description.value)}</div> : <span className="text-rose-600">ยังไม่มี (TikTok ต้องมี)</span>, pv.description.src, noteToText(pv.description.value),
          { multiline: true, bad: !pv.description.value, save: (v) => void patch({ description: v.trim() || null }, "บันทึกรายละเอียดแล้ว") })}
      </div>

      {/* พัสดุ */}
      <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <div className="mb-1 text-xs font-medium text-slate-600">พัสดุ (น้ำหนักบังคับ · ขนาดกล่องไม่บังคับ)</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span className={pv.package.weight ? "" : "text-rose-600"}>น้ำหนัก {pv.package.weight ? `${pv.package.weight} กก.` : "— ยังไม่มี"}</span>
          <span className={pv.package.l && pv.package.w && pv.package.h ? "" : "text-slate-400"}>กล่อง {pv.package.l && pv.package.w && pv.package.h ? `${pv.package.l}×${pv.package.w}×${pv.package.h} ซม.` : "— ไม่มี (ไม่ส่ง)"}</span>
          {canEdit && edit !== "weight" && <button type="button" onClick={() => { setEdit("weight"); setVal(pv.package.weight ? String(pv.package.weight) : ""); }} className="text-xs text-violet-700 hover:underline">ใส่น้ำหนักสำหรับ TikTok</button>}
        </div>
        {edit === "weight" && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-8 w-24 rounded-md border border-slate-200 px-2 text-sm" aria-label="น้ำหนัก กิโลกรัม" />
            <span className="text-xs text-slate-500">กก.</span>
            <button type="button" disabled={saving} onClick={() => void patchExtra({ tiktok_weight: Number(val) > 0 ? Number(val) : null }, "บันทึกน้ำหนักแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึก</button>
            <button type="button" onClick={() => setEdit(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.package.src} · ขนาดกล่องแก้ที่หน้าสินค้า (Parent SKU)</div>
      </div>

      {/* ตัวเลือก + ราคา */}
      <div className="rounded-xl border border-slate-200 p-3 text-sm">
        <div className="mb-2 text-xs font-medium text-slate-600">
          ตัวเลือก & ราคา ({pv.variants.length.toLocaleString()} SKU{pv.dims.length ? ` · ชั้น: ${pv.dims.map((d) => `${d.name} (${d.values.length})`).join(" · ")}` : " · ตัวเลือกเดียว"} · สต๊อกในร่าง {pv.stock.qty} ชิ้น/ตัวเลือก)
        </div>
        <div className="max-h-64 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-100">
          {pv.variants.map((v) => (
            <div key={v.sku_id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 text-xs">
              {v.image_ref ? <img src={listingImgSrc(v.image_ref, 96)} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="h-8 w-8 rounded bg-slate-50" />}
              <div className="min-w-0"><div className="truncate font-mono">{v.code}</div><div className="truncate text-slate-500">{Object.values(v.attrs).join(" · ") || "—"}</div></div>
              <div className="text-right leading-tight">
                <span className={v.price ? "font-medium" : "text-rose-600"}>{v.price ? `${baht(v.price)}฿` : "ไม่มีราคา"}</span>
                {v.fake && v.sale && v.sale < v.fake && <span className="block text-[11px] text-slate-400">ขายในระบบ {baht(v.sale)}฿</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">ราคาบน TikTok = ราคาเต็มในระบบ (ไม่มี = ราคาขาย) · ส่วนลดตั้งโปรโมชันใน Seller Center · แก้ราคาที่หน้า SKU</div>
      </div>

      {/* ช่องบังคับของหมวด */}
      <div className="rounded-xl border border-slate-200 p-3 text-xs">
        <div className="mb-1 font-medium text-slate-600">ช่องบังคับของหมวด (กรอกใน Seller Center ก่อนกดเผยแพร่)</div>
        {!pv.category.id ? <p className="text-slate-500">เลือกหมวด TikTok ก่อน</p>
          : !pv.attrs.loaded ? <p className="text-slate-500">ดึงช่องของหมวดจาก TikTok ไม่ได้ — ตรวจใน Seller Center</p>
          : pv.attrs.required.length === 0 ? <p className="text-emerald-700">หมวดนี้ไม่มีช่องบังคับเพิ่ม</p>
          : <div className="flex flex-wrap gap-1">{pv.attrs.required.map((n) => <span key={n} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{n}</span>)}</div>}
      </div>
    </div>
  );
}

/** ครั้งล่าสุดที่กดลงบน TikTok (จากร่าง) — สร้างแล้ว / ไม่สำเร็จ (เหตุผล) / กำลังสร้าง */
function LastAttemptBox({ a }: { a: LastAttempt }) {
  const when = thDateTime(a.at);
  if (a.product_id) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <Icon name="done" /> สร้างฉบับร่างบน TikTok แล้ว #{a.product_id}{when ? ` (${when})` : ""} — ไปที่ Seller Center › สินค้า › ฉบับร่าง เพื่อตรวจ กรอกช่องที่เหลือ แก้สต๊อก แล้วกดเผยแพร่
      </p>
    );
  }
  if (a.status === "failed") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
        <div className="font-medium"><Icon name="warning" /> ครั้งล่าสุดที่กดลง{when ? ` (${when})` : ""}: ไม่สำเร็จ</div>
        {a.error && <div className="mt-0.5">{a.error}</div>}
        <div className="mt-0.5 text-rose-700/80">ยังไม่ได้สร้างอะไรบน TikTok — แก้ตามเหตุผลแล้วกดลงใหม่ได้</div>
      </div>
    );
  }
  if (a.status === "creating") {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="refresh" /> กำลังสร้างบน TikTok{when ? ` (เริ่ม ${when})` : ""} — ถ้าค้างเกิน 3 นาที ให้ดูฉบับร่างใน Seller Center ก่อนกดใหม่</p>;
  }
  return null;
}
