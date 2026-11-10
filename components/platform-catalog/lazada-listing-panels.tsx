"use client";
/**
 * เนื้อหาแท็บของสินค้าบน Lazada ในลิ้นชักสินค้าบนร้าน (listing-drawer) · เฟส 1 = ดูอย่างเดียว
 *
 *   const laz = useLazadaListing(isLazada ? listingId : null);   // ดึงสดจาก Lazada ตอนเปิด
 *   <LazadaInfoPanel state={laz} />  <LazadaImagesPanel state={laz} onOpen={setLightbox} />  <LazadaOptionsPanel state={laz} />
 *
 * ลิ้นชัก/หัว/แท็บจับคู่/ประวัติ = ของเดิมที่ใช้ร่วมกับ LINE · ไฟล์นี้มีแค่ส่วนที่ข้อมูล Lazada ต่างจาก LINE
 * ข้อมูล: GET /api/lazada/listing-detail (ดึงสด ไม่บันทึก) · ปุ่ม "ดึงตัวนี้จาก Lazada" = POST (อัปเดตสำเนาย่อในระบบด้วย)
 * กฎแปลงข้อมูล: lib/lazada-listing-edit (pure + เทสต์) · แผนเฟสแก้ขึ้นร้าน: docs/lazada-connector.md
 * ของกลางที่ใช้: MiniTable · state-views · Icon · sanitizeRichHtml
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { lazStatusBadge, MAX_LAZADA_IMAGES, type LazadaListingDetailResponse, type LazadaListingView, type LazadaSkuView } from "@/lib/lazada-listing-edit";

export type LazadaListingState = {
  view: LazadaListingView | null;
  error: string | null;
  loading: boolean;
  /** เวลาที่ดึงจาก Lazada ล่าสุด */
  fetchedAt: string | null;
  /** โหลดใหม่ (ดึงสด ไม่บันทึก) */
  reload: () => void;
  /** ดึงตัวนี้จาก Lazada + อัปเดตสำเนาในระบบ */
  refresh: () => Promise<void>;
  refreshing: boolean;
};

/** ดึงสินค้าตัวนี้สดจาก Lazada เมื่อเปิดลิ้นชัก (listingId = null → ไม่ทำอะไร) */
export function useLazadaListing(listingId: string | null, onSaved?: () => void): LazadaListingState {
  const toast = useToast();
  const [view, setView] = useState<LazadaListingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!listingId) { lastId.current = null; setView(null); setError(null); setFetchedAt(null); return; }
    const my = ++seq.current;
    // สลับไปรายการอื่น = ล้างของเดิมทันที (กันโชว์ข้อมูลตัวก่อน) · โหลดซ้ำตัวเดิม = คงไว้ระหว่างรอ
    if (lastId.current !== listingId) { lastId.current = listingId; setView(null); setFetchedAt(null); }
    setLoading(true); setError(null);
    apiFetch(`/api/lazada/listing-detail?listing_id=${encodeURIComponent(listingId)}`)
      .then((r) => r.json().catch(() => ({ view: null, fetched_at: null, error: `HTTP ${r.status}` })) as Promise<LazadaListingDetailResponse>)
      .then((j) => {
        if (my !== seq.current) return;   // สลับรายการระหว่างรอ = ทิ้งคำตอบเก่า
        if (j.error || !j.view) { setError(j.error ?? "ดึงข้อมูลจาก Lazada ไม่สำเร็จ"); setView(null); return; }
        setView(j.view); setFetchedAt(j.fetched_at);
      })
      .catch(() => { if (my === seq.current) setError("ดึงข้อมูลจาก Lazada ไม่สำเร็จ — ลองใหม่อีกครั้ง"); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [listingId, n]);

  const refresh = useCallback(async () => {
    if (!listingId) return;
    setRefreshing(true);
    const my = ++seq.current;
    try {
      const r = await apiFetch("/api/lazada/listing-detail", { method: "POST", body: JSON.stringify({ listing_id: listingId }) });
      if (r.status === 403) { toast.error("ไม่มีสิทธิ์บันทึกสำเนาในระบบ — แสดงข้อมูลล่าสุดจาก Lazada อย่างเดียว"); setN((x) => x + 1); return; }
      const j = await r.json().catch(() => ({ view: null, fetched_at: null, error: `HTTP ${r.status}` })) as LazadaListingDetailResponse;
      if (my !== seq.current) return;
      if (j.view) { setView(j.view); setFetchedAt(j.fetched_at); setError(null); }
      if (j.error) toast.error(j.error);
      else { toast.success("ดึงข้อมูลจาก Lazada แล้ว — อัปเดตในระบบแล้ว"); onSaved?.(); }
    } catch (e) { toast.error((e as Error).message); }
    finally { setRefreshing(false); }
  }, [listingId, onSaved, toast]);

  return { view, error, loading, fetchedAt, reload: () => setN((x) => x + 1), refresh, refreshing };
}

const baht = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const thTime = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }); };
const TONE_CLS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700", off: "bg-slate-100 text-slate-600", wait: "bg-amber-50 text-amber-700", bad: "bg-rose-50 text-rose-700", none: "bg-slate-100 text-slate-500",
};

/** ป้ายสถานะ + ปุ่มดึงตัวนี้ (หัวลิ้นชัก) */
export function LazadaHeaderStatus({ state }: { state: LazadaListingState }) {
  const b = state.view ? lazStatusBadge(state.view.status) : null;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {b && <span className={`rounded-full px-2 py-0.5 text-[11px] ${TONE_CLS[b.tone]}`}>{b.label}</span>}
      <button type="button" disabled={state.refreshing || state.loading} onClick={() => void state.refresh()}
        title="ดึงข้อมูลสินค้าตัวนี้จาก Lazada ใหม่ และอัปเดตในระบบ (ไม่แก้อะไรบนร้าน)"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
        <Icon name="refresh" />{state.refreshing ? "กำลังดึง..." : "ดึงตัวนี้จาก Lazada"}
      </button>
      {state.fetchedAt && <span className="text-[10px] text-slate-400">ข้อมูลสดจาก Lazada {thTime(state.fetchedAt)}</span>}
    </div>
  );
}

/** โหลด / พัง → ข้อความเดียวกันทุกแท็บ · null = มีข้อมูลแล้ว */
function gate(state: LazadaListingState) {
  if (state.loading && !state.view) return <LoadingState label="กำลังดึงข้อมูลจาก Lazada…" />;
  if (state.error && !state.view) return <ErrorState title={state.error} onRetry={state.reload} />;
  if (!state.view) return <LoadingState label="กำลังดึงข้อมูลจาก Lazada…" />;
  return null;
}

const ReadOnlyNote = () => (
  <p className="flex items-start gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
    <Icon name="info" className="mt-0.5 shrink-0" />ดูอย่างเดียว — ข้อมูลสดจากร้าน Lazada · การแก้ขึ้นร้าน Lazada จะเปิดให้ทีละเฟส (แก้ชื่อ/รายละเอียด → ราคา → รูป)
  </p>
);

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <div className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{children}</div>
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}

/** แท็บข้อมูลสินค้า */
export function LazadaInfoPanel({ state }: { state: LazadaListingState }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const desc = sanitizeRichHtml(v.description);
  const short = sanitizeRichHtml(v.shortDescription);
  return (
    <div className="space-y-3 text-sm">
      <ReadOnlyNote />
      {v.rejectReasons.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <div className="mb-0.5 font-medium">เหตุผลจาก Lazada</div>
          <ul className="list-disc space-y-0.5 pl-4">{v.rejectReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      <Field label="ชื่อสินค้าบน Lazada" hint={`${v.name.length.toLocaleString()} / 255 ตัวอักษร`}>{v.name || <span className="text-slate-400">(ไม่มีชื่อ)</span>}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="แบรนด์" hint="Lazada ให้เลือกจากรายชื่อแบรนด์ของเขาเท่านั้น">{v.brand ?? "—"}</Field>
        <Field label="หมวดบน Lazada" hint="เปลี่ยนหมวด = ต้องกรอกคุณสมบัติใหม่ทั้งชุด"><span className="font-mono text-slate-500">{v.categoryId ?? "—"}</span></Field>
      </div>
      <div>
        <span className="mb-1 block text-xs text-slate-500">จุดเด่นสินค้า (หัวข้อย่อย · มีเฉพาะ Lazada)</span>
        {short.replace(/<[^>]+>/g, "").trim()
          ? <div className="tiptap-content rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" dangerouslySetInnerHTML={{ __html: short }} />
          : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">(ไม่มีจุดเด่นสินค้า)</p>}
      </div>
      <div>
        <span className="mb-1 block text-xs text-slate-500">รายละเอียดสินค้า</span>
        <div className="tiptap-content max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm [&_img]:max-w-full [&_img]:rounded"
          dangerouslySetInnerHTML={{ __html: desc || "<p class=\"text-slate-400\">(ไม่มีรายละเอียด)</p>" }} />
      </div>
    </div>
  );
}

/** แท็บรูป */
export function LazadaImagesPanel({ state, onOpen }: { state: LazadaListingState; onOpen: (index: number) => void }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  return (
    <div className="space-y-2">
      {v.images.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">สินค้านี้ยังไม่มีรูปบน Lazada</p>
        : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {v.images.map((url, i) => (
              <button key={`${url}-${i}`} type="button" onClick={() => onOpen(i)} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] text-violet-700">ปก</span>}
              </button>
            ))}
          </div>
        )}
      <p className="text-[11px] text-slate-400">รูปสินค้า {v.images.length}/{MAX_LAZADA_IMAGES} · รูปแรก = ปก · Lazada รับ jpg/png ไม่เกิน 3MB ด้านละ 330–5000px (ใช้ตอนเปิดให้แก้รูป)</p>
    </div>
  );
}

/** แท็บตัวเลือก & ราคา */
export function LazadaOptionsPanel({ state }: { state: LazadaListingState }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const cols: MiniColumn<LazadaSkuView>[] = [
    {
      key: "opt", header: "ตัวเลือก", width: "1.6fr",
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-2">
          {s.images[0] ? <img src={s.images[0]} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded object-cover" /> : null}
          <div className="min-w-0">
            <div className="truncate" title={s.label}>{s.label}</div>
            <div className="truncate font-mono text-[11px] text-slate-400">{s.sellerSku ?? "ไม่มีรหัส"}</div>
          </div>
        </div>
      ),
    },
    { key: "price", header: "ราคาปกติ", width: "5.5rem", align: "right", cell: (s) => <span>{baht(s.price)}</span> },
    {
      key: "sp", header: "ราคาลด", width: "7rem", align: "right",
      cell: (s) => s.specialPrice == null ? <span className="text-slate-300">—</span> : (
        <span className="leading-tight">
          <span className="block text-rose-600">{baht(s.specialPrice)}{s.price ? <span className="ml-1 text-[11px]">-{Math.round((1 - s.specialPrice / s.price) * 100)}%</span> : null}</span>
          {(s.specialFrom || s.specialTo) && <span className="block text-[10px] text-slate-400" title={`${s.specialFrom ?? "?"} ถึง ${s.specialTo ?? "?"}`}>{(s.specialFrom ?? "?").slice(0, 10)} – {(s.specialTo ?? "?").slice(0, 10)}</span>}
        </span>
      ),
    },
    {
      key: "stock", header: "สต๊อก", width: "4rem", align: "right",
      cell: (s) => { const q = s.available ?? s.quantity; return q == null ? <span className="text-slate-300">—</span> : <span className={q === 0 ? "text-rose-600" : ""}>{q.toLocaleString()}</span>; },
    },
    {
      key: "st", header: "ขาย", width: "4rem",
      cell: (s) => <span className={`rounded-full px-1.5 text-[11px] ${s.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{s.status === "active" ? "เปิด" : s.status === "inactive" ? "ปิด" : (s.status ?? "—")}</span>,
    },
    {
      key: "pkg", header: "กล่อง", width: "7rem",
      cell: (s) => (s.weight == null && s.length == null ? <span className="text-slate-300">—</span> : (
        <span className="text-[11px] leading-tight text-slate-600">
          <span className="block">{s.weight != null ? `${s.weight} กก.` : "—"}</span>
          <span className="block text-slate-400">{[s.length, s.width, s.height].map((x) => x ?? "?").join("×")} ซม.</span>
        </span>
      )),
    },
  ];
  const off = v.skus.filter((s) => s.status === "inactive").length;
  return (
    <div className="space-y-2">
      <MiniTable rows={v.skus} columns={cols} rowKey={(s) => s.skuId} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-lazada-options" />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>{v.skus.length.toLocaleString()} ตัวเลือก{off ? ` · ปิดขาย ${off.toLocaleString()}` : ""}</span>
        <span className="ml-auto">สต๊อกดูอย่างเดียว (BigSeller ยังซิงค์สต๊อก Lazada อยู่)</span>
      </div>
    </div>
  );
}
