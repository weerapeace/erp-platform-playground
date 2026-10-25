"use client";

/**
 * กล่องพัก "คำสั่งซื้อจากไลน์" — การ์ดรูปคำสั่งซื้อที่ AI อ่านแล้ว รอคนตรวจ/ยืนยัน
 *
 * - แท็บสถานะ: รอตรวจ / ยืนยันแล้ว / ตีตก / ทั้งหมด + ค้นหา (ร้าน เลขคำสั่งซื้อ คนส่ง เลขพัสดุ)
 * - 📤 อัปรูปเอง (หรือกด Ctrl+V วางรูป) = สำรองตอนไลน์มีปัญหา / ใช้ทดสอบ — วิ่งเส้นเดียวกับรูปจากไลน์
 * - แอดมินเห็นแถบตั้งกลุ่มไลน์ (กด "ใช้กลุ่มนี้" ได้เลยจากชื่อกลุ่มที่บอทเพิ่งเห็น) + เปิดศูนย์จัดการ LINE กลาง
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

type Row = CaptureRow & { po_no: string | null };
type Tab = "pending" | "confirmed" | "rejected" | "all";
type LineSetup = {
  has_token: boolean; has_secret: boolean;
  current: string; current_name: string | null;
  captured: string; captured_name: string | null; captured_at: string | null;
};

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
  const [setup, setSetup] = useState<LineSetup | null>(null);
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

  const loadSetup = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const r = await apiFetch("/api/purchasing/line-orders?line_setup=1");
      const j = await r.json();
      if (r.ok && !j.error) setSetup(j as LineSetup);
    } catch { /* แถบตั้งค่าไม่ขึ้นก็ใช้หน้าได้ */ }
  }, [isAdmin]);
  useEffect(() => { void loadSetup(); }, [loadSetup]);

  const applyCapturedGroup = async () => {
    if (!setup?.captured) return;
    try {
      const r = await apiFetch("/api/admin/line-console", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: "purchase_capture", group_id: setup.captured }),
      });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "ตั้งกลุ่มไม่สำเร็จ");
      toast.success(`ตั้งกลุ่ม "${setup.captured_name ?? setup.captured}" แล้ว — ส่งรูปในกลุ่มนี้ได้เลย`);
      void loadSetup();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ตั้งกลุ่มไม่สำเร็จ"); }
  };

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

      {/* แถบตั้งกลุ่มไลน์ — แอดมินเท่านั้น */}
      {isAdmin && setup && (
        setup.current ? (
          <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>✅ กลุ่มไลน์ส่งรูป: <b>{setup.current_name ?? "ตั้งแล้ว"}</b> — ส่งรูปคำสั่งซื้อในกลุ่มนี้ได้เลย บอทจะตอบกลับให้</span>
            {!setup.has_secret && <span className="text-amber-700">🔐 ยังไม่ได้ใส่รหัสลับบอท (แนะนำ) — ใส่ได้ที่ ⚙️ ตั้งค่าไลน์</span>}
          </div>
        ) : (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5">
            <div className="font-semibold text-amber-900">ยังไม่ได้ตั้งกลุ่มไลน์สำหรับส่งรูป</div>
            <ol className="list-decimal pl-5 text-amber-900/90 text-[13px] space-y-0.5">
              <li>สร้างกลุ่มไลน์ใหม่ (เช่น &quot;ส่งรูปคำสั่งซื้อ&quot;) แล้วเชิญบอท &quot;พนักงานลงบิลจีนลูก้า&quot; เข้ากลุ่ม</li>
              <li>พิมพ์อะไรก็ได้ในกลุ่มนั้น 1 ครั้ง แล้วกด 🔄 ด้านล่าง</li>
              <li>เห็นชื่อกลุ่มถูกแล้ว กด &quot;ใช้กลุ่มนี้&quot;</li>
              <li>ใน LINE Official Account Manager ปิด &quot;ข้อความตอบกลับอัตโนมัติ&quot; (ไม่งั้นไลน์ตอบข้อความสำเร็จรูปซ้อน)</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {setup.captured ? (
                <>
                  <span className="text-[13px] text-slate-700">กลุ่มล่าสุดที่บอทเห็น: <b>{setup.captured_name ?? setup.captured}</b>
                    {setup.captured_at && <span className="text-slate-400"> · {when(setup.captured_at)}</span>}</span>
                  <button onClick={() => void applyCapturedGroup()}
                    className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700">ใช้กลุ่มนี้</button>
                </>
              ) : <span className="text-[13px] text-slate-500">บอทยังไม่เห็นกลุ่มใหม่</span>}
              <button onClick={() => void loadSetup()} className="h-8 px-2.5 rounded-lg border border-amber-300 bg-white text-xs text-amber-800 hover:bg-amber-100">🔄 รีเฟรช</button>
              {!setup.has_token && <span className="text-xs text-rose-600">ยังไม่มีโทเคนบอท — ตั้งที่ ⚙️ ตั้งค่าไลน์ก่อน</span>}
            </div>
          </div>
        )
      )}

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
      {isAdmin && <LineConsole open={consoleOpen} onClose={() => { setConsoleOpen(false); void loadSetup(); }} />}
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
          {r.ai_is_order === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">🤔 ไม่ใช่คำสั่งซื้อ?</span>}
          {r.ai_error && r.status === "pending" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">⚠️ ต้องตรวจเอง</span>}
          {r.status === "confirmed" && (r.po_no
            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">🔗 {r.po_no}</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">✓ ไม่ผูก PO</span>)}
          {r.status === "rejected" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">ตีตก</span>}
        </div>
      </div>
    </button>
  );
}
