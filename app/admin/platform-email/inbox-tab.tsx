"use client";

// 📬 แท็บ "เมลที่อ่านแล้ว" — ทุกเมลที่สคริปต์ส่งเข้ามา + ระบบทำอะไรกับมัน (ใช้เป็นประวัติ/ตรวจย้อนหลัง)
// ติ๊กหลายฉบับ → 🔄 อ่านใหม่ (หลังเพิ่มร้านในตั้งค่า/ปรับกฎ) · ✓ ปิดเรื่อง (คนตรวจแล้ว ไม่ต้องทำอะไร)
// โหลดทีละหน้า (50/100/200 ฉบับ) — กรอง/ค้นหา/เรียงที่เซิร์ฟเวอร์
// ของกลาง: MiniTable · Pager · PlatformBadge · ERPInput · toast · ConfirmDialog

import { useCallback, useEffect, useState } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { PlatformBadge } from "@/components/platform-icon";
import { ERPInput } from "@/components/form";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime, KIND_LABEL, PLATFORM_LABEL, STATUS_META, type InboxRow } from "./types";

const FILTERS: { v: string; label: string }[] = [
  { v: "", label: "ทั้งหมด" },
  { v: "attention", label: STATUS_META.attention.label },
  { v: "unreadable", label: STATUS_META.unreadable.label },
  { v: "done", label: STATUS_META.done.label },
  { v: "ignored", label: STATUS_META.ignored.label },
];

export function InboxTab({ initialStatus, onChanged }: { initialStatus: string; onChanged: () => void }) {
  const toast = useToast();
  const [status, setStatusRaw] = useState(initialStatus);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  // โหลดทีละหน้าจากเซิร์ฟเวอร์ (เมลมีหลายพันฉบับ) — เรียงก็เรียงที่เซิร์ฟเวอร์
  const [page, setPage] = useState(0);
  const [size, setSizeRaw] = useState(50);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "received_at", dir: "desc" });
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);

  const setStatus = (v: string) => { setStatusRaw(v); setPage(0); };
  const setSize = (v: number) => { setSizeRaw(v); setPage(0); };
  const onSort = (key: string, dir: "asc" | "desc") => { setSort(key ? { key, dir } : { key: "received_at", dir: "desc" }); setPage(0); };
  useEffect(() => {
    const t = setTimeout(() => { const v = q.trim(); if (v !== query) { setQuery(v); setPage(0); } }, 300);
    return () => clearTimeout(t);
  }, [q, query]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ page: String(page), size: String(size), sort: sort.key, dir: sort.dir });
      if (status) p.set("status", status);
      if (query) p.set("q", query);
      const res = await apiFetch(`/api/platform-email/inbox?${p}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRows(j.rows as InboxRow[]); setTotal(Number(j.total ?? 0)); setSelected(new Set());
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [status, query, page, size, sort]);
  useEffect(() => { void load(); }, [load]);

  const act = async (action: "reprocess" | "reprocess_all" | "resolve") => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/platform-email/inbox", { method: "POST", body: JSON.stringify({ action, ids: [...selected], status }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "ทำไม่สำเร็จ");
      if (action !== "resolve") {
        const r = (j.results ?? []) as { status: string }[];
        const done = r.filter((x) => x.status === "done").length;
        toast.success(`อ่านใหม่ ${r.length} ฉบับ — สำเร็จ ${done} ฉบับ${r.length - done ? ` · ยังต้องดู ${r.length - done} ฉบับ` : ""}`);
      } else toast.success(`ปิดเรื่อง ${selected.size} ฉบับแล้ว`);
      setConfirmResolve(false);
      await load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const columns: MiniColumn<InboxRow>[] = [
    { key: "received_at", header: "เวลาเมล", width: "8.5rem", sortValue: (r) => r.received_at ?? "",
      cell: (r) => <span className="text-xs tabular-nums text-slate-600">{fmtDateTime(r.received_at)}</span> },
    { key: "kind", header: "ประเภท", width: "9rem", sortValue: (r) => r.kind ?? "",
      cell: (r) => (
        <div className="text-xs leading-tight">
          {r.platform_code ? <PlatformBadge code={r.platform_code} name={PLATFORM_LABEL[r.platform_code]} size="xs" /> : <div className="text-slate-400">—</div>}
          <div className="mt-0.5 text-slate-500">{KIND_LABEL[r.kind ?? ""] ?? r.kind ?? "—"}</div>
        </div>
      ) },
    { key: "order", header: "เลขออเดอร์", width: "9.5rem", sortValue: (r) => r.external_order_id ?? r.ref_no ?? "",
      cell: (r) => r.external_order_id
        ? <code className="font-mono text-[11px] text-slate-700">{r.external_order_id}</code>
        : r.ref_no ? <span className="text-[11px] text-slate-500">คำขอ <code className="font-mono">{r.ref_no}</code></span> : <span className="text-slate-300">—</span> },
    { key: "note", header: "ระบบทำอะไร", width: "1fr",
      cell: (r) => (
        <div className="text-xs leading-snug">
          <div className="text-slate-700">{r.note ?? "—"}</div>
          <div className="mt-0.5 truncate text-slate-400" title={`${r.subject ?? ""} · ${r.from_addr ?? ""}`}>{r.subject ?? "(ไม่มีหัวเรื่อง)"}{r.shop_name ? ` · ร้าน ${r.shop_name}` : ""}</div>
        </div>
      ) },
    { key: "status", header: "สถานะ", width: "6.5rem", sortValue: (r) => r.status,
      cell: (r) => <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_META[r.status].cls}`} title={STATUS_META[r.status].hint}>{STATUS_META[r.status].label}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          {FILTERS.map((f) => (
            <button key={f.v} onClick={() => setStatus(f.v)} className={`px-3 ${status === f.v ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
          ))}
        </div>
        <div className="w-64"><ERPInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขออเดอร์ / หัวเรื่อง / ผลที่ทำ" /></div>
        {(status === "ignored" || status === "unreadable" || status === "attention") && rows.length > 0 && (
          <button disabled={busy} onClick={() => void act("reprocess_all")} title="ให้ระบบอ่านเมลกลุ่มนี้ใหม่ด้วยกฎล่าสุด (ทีละ 150 ฉบับ เก่า→ใหม่)"
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50 disabled:opacity-50">{busy ? "กำลังอ่าน..." : "🔄 อ่านใหม่ทั้งกลุ่มนี้"}</button>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {error} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
          <span className="font-medium text-slate-700">เลือก {selected.size} ฉบับ</span>
          <button disabled={busy} onClick={() => void act("reprocess")} className="h-8 rounded-lg bg-slate-900 px-3 text-white hover:bg-slate-800 disabled:opacity-50">{busy ? "กำลังทำ..." : "🔄 อ่านใหม่"}</button>
          <button disabled={busy} onClick={() => setConfirmResolve(true)} className="h-8 rounded-lg border border-slate-200 px-3 hover:bg-slate-50 disabled:opacity-50">✓ ปิดเรื่อง</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:underline">ยกเลิกที่เลือก</button>
        </div>
      )}

      {loading && !rows.length ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : (
        <div className={`space-y-2 transition-opacity ${loading ? "pointer-events-none opacity-50" : ""}`}>
          <MiniTable rows={rows} columns={columns} rowKey={(r) => r.id} hideSearch countUnit="ฉบับ"
            sortKey={sort.key} sortDir={sort.dir} onSortChange={onSort}
            selectable selected={selected} onSelectedChange={setSelected}
            emptyText={status || query ? "ไม่พบเมลตามที่กรอง ลองเปลี่ยนตัวกรองหรือคำค้นหา" : "ยังไม่มีเมลเข้ามา — ติดตั้งสคริปต์ในแท็บ ตั้งค่า + ติดตั้ง แล้วรอสักครู่"}
            maxHeightClass="max-h-[calc(100vh-320px)]"
            footnote="🔄 อ่านใหม่ = ให้ระบบอ่านเมลที่เก็บไว้อีกรอบด้วยกฎล่าสุด (ออเดอร์ที่สร้างแล้วจะไม่ซ้ำ)" />
          {total > 0 && <Pager page={page} pageSize={size} total={total} onPage={setPage} unitLabel="ฉบับ" onPageSize={setSize} pageSizes={[50, 100, 200]} />}
        </div>
      )}

      <ConfirmDialog open={confirmResolve} onClose={() => setConfirmResolve(false)} onConfirm={() => void act("resolve")} loading={busy}
        title={`ปิดเรื่อง ${selected.size} ฉบับ?`} confirmText="ปิดเรื่อง"
        message="เมลที่เลือกจะย้ายไปกลุ่ม “ข้าม” (ระบบไม่สร้าง/แก้ออเดอร์อะไรเพิ่ม) — ใช้เมื่อคนตรวจแล้วว่าไม่ต้องทำอะไร · กลับมากด “อ่านใหม่” ได้ภายหลัง" />
    </div>
  );
}
