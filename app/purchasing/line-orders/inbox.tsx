"use client";

/**
 * กล่องพัก "คำสั่งซื้อจากไลน์" — การ์ดรูปคำสั่งซื้อที่ AI อ่านแล้ว รอคนตรวจ/ยืนยัน
 *
 * - แท็บสถานะ: รอตรวจ / ยืนยันแล้ว / ตีตก / ทั้งหมด + ค้นหา (ร้าน เลขคำสั่งซื้อ คนส่ง เลขพัสดุ)
 * - 📤 อัปรูปเอง (หรือกด Ctrl+V วางรูป) = สำรองตอนไลน์มีปัญหา / ใช้ทดสอบ — วิ่งเส้นเดียวกับรูปจากไลน์
 * - แอดมินเห็นแถบตั้งกลุ่มไลน์ (./line-group-setup — เลือกกลุ่มที่บอทอยู่แล้วได้ทันที) + เปิดศูนย์จัดการ LINE กลาง
 * - ลิงก์ตรงถึงใบ: ?open=<id> (บอทส่งลิงก์นี้ในไลน์)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { LineConsole } from "@/components/line-console";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useOpenParam } from "@/lib/open-param";
import { shrinkImageToFit } from "@/lib/image-resize";
import { PLATFORM_LABEL, curSym, type CaptureRow } from "@/lib/order-capture-shared";
import { CaptureModal } from "./capture-modal";
import { LineGroupSetup } from "./line-group-setup";

type Row = CaptureRow & { po_no: string | null };
type Tab = "pending" | "confirmed" | "rejected" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "รอตรวจ" },
  { key: "confirmed", label: "ยืนยันแล้ว" },
  { key: "rejected", label: "ตีตก" },
  { key: "all", label: "ทั้งหมด" },
];
const PAGE = 60;

const money = (n: number | null, c: unknown) =>
  n === null || n === undefined ? "—" : `${curSym(c)}${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function LineOrdersInbox() {
  const toast = useToast();
  const { can } = useAuth();
  const isAdmin = can("admin.users");
  const canEdit = can("po.edit");

  const [tab, setTab] = useState<Tab>("pending");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [setupKey, setSetupKey] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  useOpenParam(true, setOpenId);

  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async (append = false) => {
    const my = ++reqId.current;
    if (append) setLoadingMore(true); else { setLoading(true); setError(null); }
    try {
      const offset = append ? rows.length : 0;
      const r = await apiFetch(`/api/purchasing/line-orders?status=${tab}&q=${encodeURIComponent(qDebounced)}&limit=${PAGE}&offset=${offset}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      if (my !== reqId.current) return;   // มีคำขอใหม่กว่าแล้ว — ทิ้งผลเก่า
      setRows((prev) => (append ? [...prev, ...(j.rows as Row[])] : (j.rows as Row[])));
      setCounts(j.counts ?? {}); setTotal(j.total ?? 0);
    } catch (e) {
      if (my === reqId.current && !append) setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      if (my === reqId.current) { setLoading(false); setLoadingMore(false); }
    }
    // rows.length ใช้ตอน append เท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, qDebounced]);

  useEffect(() => { void load(false); }, [load]);

  // มีใบที่ AI กำลังอ่าน → รีเฟรชเองทุก 5 วินาทีจนเสร็จ
  const hasProcessing = rows.some((r) => r.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setTimeout(() => void load(false), 5000);
    return () => clearTimeout(t);
  }, [hasProcessing, rows, load]);

  // ---- อัปรูปเอง / วางรูป ----
  const upload = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 6);
    if (imgs.length === 0) { toast.warning("ยังไม่ได้เลือกรูป"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of imgs) {
        // ย่อให้ไม่เกิน ~1.2MB (คงความละเอียดพอให้ AI อ่านตัวหนังสือได้) — ย่อไม่ได้ใช้ไฟล์เดิม
        const small = await shrinkImageToFit(f, 1_200_000).catch(() => null);
        fd.append("images", small?.file ?? f);
      }
      const r = await apiFetch("/api/purchasing/line-orders", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      toast.success("อัปรูปแล้ว — AI อ่านเสร็จแล้ว ตรวจได้เลย");
      if (tab !== "pending") setTab("pending"); else void load(false);
      if (j.item?.id) setOpenId(j.item.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [toast, tab, load]);

  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      if (openId) return;   // เปิดป๊อปอยู่ = ไม่รับวาง (กันอัปโดยไม่ตั้งใจ)
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); void upload(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canEdit, openId, upload]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">💬 คำสั่งซื้อจากไลน์</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ซื้อของจาก Shopee/Taobao แล้วแคปหน้าคำสั่งซื้อส่งเข้ากลุ่มไลน์ → AI อ่านให้ → ตรวจแล้วกดยืนยันที่นี่ (ผูก PO เดิม หรือเปิด PO ใหม่)
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => setConsoleOpen(true)}
              className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50">⚙️ ตั้งค่าไลน์</button>
          )}
          {canEdit && (
            <>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                title="หรือกด Ctrl+V วางรูปในหน้านี้"
                className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {uploading ? "⏳ AI กำลังอ่าน…" : "📤 อัปรูปเอง"}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
            </>
          )}
        </div>
      </div>

      {/* แถบตั้งกลุ่มไลน์ — แอดมินเท่านั้น (เลือกกลุ่มที่บอทอยู่แล้วได้ทันที) */}
      {isAdmin && <LineGroupSetup reloadKey={setupKey} onOpenConsole={() => setConsoleOpen(true)} />}

      {/* แท็บ + ค้นหา */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`h-8 px-3 rounded-md text-sm ${tab === t.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {t.label} <span className={`tabular-nums ${tab === t.key ? "text-white/70" : "text-slate-400"}`}>{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ร้าน / เลขคำสั่งซื้อ / คนส่ง / เลขพัสดุ"
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-full sm:w-80 focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>

      {loading ? <LoadingState />
        : error ? <ErrorState onRetry={() => void load(false)} hint={error} />
        : rows.length === 0 ? (
          <EmptyState icon="💬"
            title={qDebounced ? "ไม่พบคำสั่งซื้อที่ค้นหา" : tab === "pending" ? "ไม่มีคำสั่งซื้อรอตรวจ" : "ยังไม่มีรายการในแท็บนี้"}
            hint={qDebounced ? "ลองเปลี่ยนคำค้นหา" : "ส่งรูปหน้าคำสั่งซื้อเข้ากลุ่มไลน์ หรือกด 📤 อัปรูปเอง"}
            action={canEdit && !qDebounced ? { label: "📤 อัปรูปเอง", onClick: () => fileRef.current?.click() } : undefined} />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {rows.map((r) => <CaptureCard key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)}
            </div>
            {rows.length < total && (
              <div className="text-center">
                <button onClick={() => void load(true)} disabled={loadingMore}
                  className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {loadingMore ? "กำลังโหลด…" : `โหลดเพิ่ม (${rows.length}/${total})`}
                </button>
              </div>
            )}
          </>
        )}

      {openId && (
        <CaptureModal id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} onOpen={setOpenId}
          onChanged={() => void load(false)} />
      )}
      {isAdmin && <LineConsole open={consoleOpen} onClose={() => { setConsoleOpen(false); setSetupKey((k) => k + 1); }} />}
    </div>
  );
}

function CaptureCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const img = r.image_keys[0];
  const conf = r.ai_confidence;
  const confTone = conf === null ? "" : conf >= 85 ? "bg-emerald-50 text-emerald-700" : conf >= 65 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";
  return (
    <button type="button" onClick={onOpen}
      className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-sm transition">
      <div className="relative aspect-[3/4] bg-slate-100">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={r2ImageUrl(img, 360) ?? undefined} alt="" loading="lazy" className="w-full h-full object-cover object-top" />
          : <div className="w-full h-full flex items-center justify-center text-3xl text-slate-300">🧾</div>}
        {r.platform && <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/90 text-slate-700 border border-slate-200">{PLATFORM_LABEL[r.platform]}</span>}
        {r.image_keys.length > 1 && <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">🖼 {r.image_keys.length}</span>}
        {r.status === "processing" && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-sm text-slate-600">⏳ AI กำลังอ่าน…</div>
        )}
      </div>
      <div className="p-2.5 space-y-1">
        <div className="flex items-start justify-between gap-1.5">
          <div className="text-sm font-semibold text-slate-800 truncate">{r.shop_name || <span className="text-slate-400 font-normal">ยังไม่รู้ร้าน</span>}</div>
          {conf !== null && r.status === "pending" && <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${confTone}`}>AI {Math.round(conf)}%</span>}
        </div>
        <div className="text-[11px] text-slate-500 truncate">{r.order_no ? `#${r.order_no}` : "ไม่มีเลขคำสั่งซื้อ"} · {r.items.length} รายการ</div>
        <div className="text-sm font-bold tabular-nums text-slate-800">{money(r.total_paid, r.currency)}</div>
        <div className="text-[11px] text-slate-400 truncate">{r.source === "upload" ? "📤 " : "💬 "}{r.sender_name || "—"} · {when(r.created_at)}</div>
        <div className="flex flex-wrap gap-1">
          {r.dup_of && r.status !== "rejected" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">⚠️ เลขซ้ำ</span>}
          {r.ai_is_order === false && r.status !== "rejected" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">🤔 ไม่ใช่คำสั่งซื้อ?</span>}
          {r.ai_error && r.status === "pending" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">⚠️ ต้องตรวจเอง</span>}
          {r.status === "confirmed" && (r.po_no
            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">🔗 {r.po_no}</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">✓ ไม่ผูก PO</span>)}
          {r.status === "rejected" && (r.rejected_by === "AI"
            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500" title="บอทไม่ได้ตอบในไลน์ · ถ้าเป็นคำสั่งซื้อจริงให้เปิดแล้วกดกู้คืน">🤖 AI ตีตก: ไม่ใช่คำสั่งซื้อ</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">ตีตก</span>)}
        </div>
      </div>
    </button>
  );
}
