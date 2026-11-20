"use client";

// 🔗 หน้าจัดการลิงก์สั้น (ของกลาง) — /tasks/short-links
//   รายการลิงก์ louismontini.co.th/go/... · ยอดคลิกแยกที่มา (Facebook/IG/LINE/TikTok/QR) · แก้ปลายทาง/ชื่อ · QR · ปิด/เปิด · ถังขยะ + กู้คืน
//   ตัวเรียก API: lib/short-links-client · กติกา: lib/short-links · คู่มือ docs/short-links.md
import { useCallback, useEffect, useMemo, useState } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { CopyButton } from "@/components/copy-button";
import { QrCode, qrDataUrl } from "@/components/qr-code";
import { Icon } from "@/components/icon";
import { useMediaQuery } from "@/lib/use-media-query";
import { SHORT_LINK_DISPLAY, SHORT_LINK_SOURCES, SHORT_LINK_SOURCE_LABEL, normalizeShortCode, shortCodeProblem, cleanTargetUrl, type ShortLinkListItem } from "@/lib/short-links";
import { listShortLinks, createShortLink, updateShortLink, deleteShortLink } from "@/lib/short-links-client";

const MODULE_LABEL: Record<string, string> = { content: "แคปชั่นโพสต์", manual: "สร้างเอง", line: "LINE", quotation: "ใบเสนอราคา" };
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

type EditState = { id: string | null; url: string; code: string; label: string };

export function ShortLinksManager() {
  const toast = useToast();
  const { can, user } = useAuth();
  const canManage = can("short_links.manage");
  const mobile = useMediaQuery("(max-width: 767px)");
  const [trash, setTrash] = useState(false);
  const [rows, setRows] = useState<ShortLinkListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<ShortLinkListItem | null>(null);
  const [confirmDel, setConfirmDel] = useState<ShortLinkListItem | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await listShortLinks({ trash })); } catch (e) { setErr((e as Error).message); }
  }, [trash]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const mine = (r: ShortLinkListItem) => canManage || r.created_by === user?.id;
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of rows ?? []) for (const [k, v] of Object.entries(r.by_source)) t[k] = (t[k] ?? 0) + (v ?? 0);
    return t;
  }, [rows]);
  const totalClicks = (rows ?? []).reduce((s, r) => s + r.click_count, 0);

  const openNew = () => { setEditErr(null); setEdit({ id: null, url: "", code: "", label: "" }); };
  const openEdit = (r: ShortLinkListItem) => { setEditErr(null); setEdit({ id: r.id, url: r.target_url, code: r.code, label: r.label ?? "" }); };

  const save = async () => {
    if (!edit) return;
    const url = cleanTargetUrl(edit.url);
    if (!url) { setEditErr("ใส่ลิงก์ปลายทางที่ขึ้นต้นด้วย http:// หรือ https://"); return; }
    const code = normalizeShortCode(edit.code);
    if (edit.code.trim()) { const p = shortCodeProblem(code); if (p) { setEditErr(p); return; } }
    setSaving(true); setEditErr(null);
    try {
      if (edit.id) {
        const before = rows?.find((r) => r.id === edit.id);
        await updateShortLink(edit.id, { target_url: url, label: edit.label, ...(code && code !== before?.code ? { code } : {}) });
        toast.success("บันทึกแล้ว — ลิงก์สั้นเดิมพาไปปลายทางใหม่ทันที");
      } else {
        const r = await createShortLink({ url, code: code || undefined, label: edit.label || undefined, source_module: "manual" });
        toast.success(r.reused ? `ลิงก์นี้มีลิงก์สั้นอยู่แล้ว: ${SHORT_LINK_DISPLAY}${r.code}` : `สร้างแล้ว: ${SHORT_LINK_DISPLAY}${r.code}`);
      }
      setEdit(null); void load();
    } catch (e) { setEditErr((e as Error).message); } finally { setSaving(false); }
  };

  const toggleActive = async (r: ShortLinkListItem) => {
    try {
      await updateShortLink(r.id, { is_active: !r.is_active });
      void load();
      toast.undo(r.is_active ? `ปิดลิงก์ ${r.code} แล้ว (คนกดจะไปหน้าแรกร้าน)` : `เปิดลิงก์ ${r.code} แล้ว`, async () => { await updateShortLink(r.id, { is_active: r.is_active }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const doDelete = async (r: ShortLinkListItem) => {
    try {
      await deleteShortLink(r.id);
      setConfirmDel(null); void load();
      toast.undo(`ย้าย ${r.code} ลงถังขยะแล้ว`, async () => { await updateShortLink(r.id, { restore: true }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const restore = async (r: ShortLinkListItem) => {
    try { await updateShortLink(r.id, { restore: true }); toast.success(`กู้คืน ${r.code} แล้ว`); void load(); } catch (e) { toast.error((e as Error).message); }
  };
  const downloadQr = async (r: ShortLinkListItem) => {
    const src = await qrDataUrl(`${r.short_url}?q=1`, { width: 1024, margin: 2, ecc: "Q" });
    const a = document.createElement("a"); a.href = src; a.download = `qr-${r.code}.png`; a.click();
  };

  const sourceChips = (r: ShortLinkListItem) => (
    <div className="flex flex-wrap gap-1">
      {SHORT_LINK_SOURCES.filter((s) => (r.by_source[s] ?? 0) > 0).map((s) => (
        <span key={s} className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px]">{SHORT_LINK_SOURCE_LABEL[s]} {r.by_source[s]}</span>
      ))}
    </div>
  );
  const actionsFor = (r: ShortLinkListItem) => (
    <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
      {trash ? (
        mine(r) && <button type="button" onClick={() => void restore(r)} className="h-7 px-2 rounded border border-slate-200 text-xs hover:bg-slate-50"><Icon name="refresh" /> กู้คืน</button>
      ) : (<>
        <CopyButton value={r.short_url} title="คัดลอกลิงก์สั้น" />
        <button type="button" title="QR code" onClick={() => setQrFor(r)} className="h-7 w-7 rounded hover:bg-slate-100 text-slate-500"><Icon name="qrcode" /></button>
        {mine(r) && <button type="button" title="แก้ไข" onClick={() => openEdit(r)} className="h-7 w-7 rounded hover:bg-slate-100 text-slate-500"><Icon name="edit" /></button>}
        {mine(r) && <button type="button" title={r.is_active ? "ปิดลิงก์ชั่วคราว" : "เปิดลิงก์"} onClick={() => void toggleActive(r)} className="h-7 w-7 rounded hover:bg-slate-100 text-slate-500"><Icon name={r.is_active ? "eye-off" : "eye"} /></button>}
        {mine(r) && <button type="button" title="ลบ (ย้ายลงถังขยะ)" onClick={() => setConfirmDel(r)} className="h-7 w-7 rounded hover:bg-rose-50 text-rose-500"><Icon name="trash" /></button>}
      </>)}
    </div>
  );

  const columns: MiniColumn<ShortLinkListItem>[] = [
    { key: "code", header: "ลิงก์สั้น", width: "1.3fr", sortValue: (r) => r.code, cell: (r) => (
      <div className="min-w-0">
        <div className={`font-mono text-[13px] ${r.is_active ? "text-violet-700" : "text-slate-400 line-through"}`}>/go/{r.code}</div>
        <div className="text-[11px] text-slate-500 truncate">{r.label || MODULE_LABEL[r.source_module ?? ""] || "—"}{!r.is_active && " · ปิดอยู่"}</div>
      </div>) },
    { key: "target", header: "ไปที่", width: "1.6fr", sortValue: (r) => r.target_url, cell: (r) => (
      <a href={r.target_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block text-xs text-slate-600 truncate hover:underline" title={r.target_url}>
        <span className="font-medium">{hostOf(r.target_url)}</span> <span className="text-slate-400">{r.target_url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}</span>
      </a>) },
    { key: "clicks", header: "คลิก", width: "4.5rem", align: "right", sortValue: (r) => r.click_count, cell: (r) => <span className="font-medium tabular-nums">{r.click_count.toLocaleString()}</span> },
    { key: "sources", header: "มาจาก", width: "1.2fr", cell: sourceChips, noExport: true },
    { key: "by", header: "สร้างโดย", width: "1fr", sortValue: (r) => r.created_at, cell: (r) => <div className="text-[11px] text-slate-500">{r.created_by_name ?? "—"}<br />{fmtDate(r.created_at)}</div> },
    { key: "act", header: "", width: trash ? "6rem" : "10rem", align: "right", cell: actionsFor, noExport: true },
  ];

  const card = (r: ShortLinkListItem) => (
    <div className="p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-mono text-sm ${r.is_active ? "text-violet-700" : "text-slate-400 line-through"}`}>/go/{r.code}</div>
          <div className="text-[11px] text-slate-500 truncate">{r.label || MODULE_LABEL[r.source_module ?? ""] || "—"} · {hostOf(r.target_url)}</div>
        </div>
        <div className="text-right"><div className="text-lg font-medium tabular-nums leading-none">{r.click_count.toLocaleString()}</div><div className="text-[10px] text-slate-400">คลิก</div></div>
      </div>
      {sourceChips(r)}
      {actionsFor(r)}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-3 md:p-5 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Icon name="link" /> ลิงก์สั้น</h1>
          <p className="text-xs text-slate-500">ลิงก์ร้านที่ย่อเป็น {SHORT_LINK_DISPLAY}xxxxx · แก้ปลายทางได้โดยลิงก์สั้น/QR เดิมยังใช้ได้ · แคปชั่นโพสต์ย่อให้อัตโนมัติ</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setTrash((v) => !v)} className={`h-8 px-3 rounded-lg border text-xs ${trash ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 hover:bg-slate-50"}`}><Icon name="trash" /> ถังขยะ</button>
          {!trash && <button type="button" onClick={openNew} className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700"><Icon name="plus" /> สร้างลิงก์สั้น</button>}
        </div>
      </div>

      {!trash && rows && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="rounded-lg bg-violet-50 px-3 py-2"><div className="text-[11px] text-violet-700">คลิกทั้งหมด</div><div className="text-lg font-semibold text-violet-800 tabular-nums">{totalClicks.toLocaleString()}</div></div>
          {SHORT_LINK_SOURCES.map((s) => (
            <div key={s} className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">{SHORT_LINK_SOURCE_LABEL[s]}</div><div className="text-lg font-semibold text-slate-700 tabular-nums">{(totals[s] ?? 0).toLocaleString()}</div></div>
          ))}
        </div>
      )}

      {err ? <ErrorState title="โหลดลิงก์สั้นไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !rows ? <LoadingState label="กำลังโหลดลิงก์สั้น…" />
        : rows.length === 0 ? (trash
          ? <EmptyState icon={<Icon name="trash" />} title="ถังขยะว่าง" hint="ลิงก์ที่ลบจะมาอยู่ที่นี่ กู้คืนได้" />
          : <EmptyState icon={<Icon name="link" />} title="ยังไม่มีลิงก์สั้น" hint="ใส่ลิงก์ร้านในแคปชั่นโพสต์ ระบบย่อให้เอง หรือกดสร้างเองได้" onCreate={openNew} createLabel="สร้างลิงก์สั้น" />)
        : <MiniTable rows={rows} columns={columns} rowKey={(r) => r.id} layout={mobile ? "cards" : "table"} renderCard={card}
            searchText={(r) => `${r.code} ${r.label ?? ""} ${r.target_url} ${r.created_by_name ?? ""}`} searchPlaceholder="ค้นชื่อลิงก์ / ปลายทาง / คนสร้าง"
            countUnit="ลิงก์" onRowClick={(r) => !trash && mine(r) && openEdit(r)} />}

      <ERPModal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "แก้ลิงก์สั้น" : "สร้างลิงก์สั้น"} size="sm" loading={saving}
        hasUnsavedChanges={!!edit && !edit.id && !!edit.url.trim()}
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setEdit(null)} className="h-9 px-4 rounded-lg border border-slate-200 text-sm">ยกเลิก</button><button type="button" disabled={saving} onClick={() => void save()} className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-60">บันทึก</button></div>}>
        {edit && (
          <div className="space-y-3 text-sm">
            <label className="block"><span className="text-xs text-slate-500">ลิงก์ปลายทาง (ลิงก์ยาว)</span>
              <input value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder="https://shop.tiktok.com/view/product/..." className="mt-1 w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" autoFocus /></label>
            <label className="block"><span className="text-xs text-slate-500">ชื่อท้ายลิงก์ (ไม่ใส่ = สุ่มให้ 5 ตัว)</span>
              <div className="mt-1 flex items-center rounded-lg border border-slate-200 overflow-hidden">
                <span className="px-2 text-xs text-slate-400 bg-slate-50 h-9 flex items-center whitespace-nowrap">{SHORT_LINK_DISPLAY}</span>
                <input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="fleur-tiktok" className="flex-1 min-w-0 h-9 px-2 text-sm font-mono outline-none" />
              </div>
              {edit.id && <span className="text-[11px] text-amber-600">เปลี่ยนชื่อท้ายลิงก์ = ลิงก์/QR ที่แจกไปแล้วจะใช้ไม่ได้</span>}</label>
            <label className="block"><span className="text-xs text-slate-500">ชื่อเรียก (ไว้จำ ไม่โชว์ลูกค้า)</span>
              <input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Fleur de Juillet · TikTok" className="mt-1 w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" /></label>
            {editErr && <p className="text-xs text-rose-600">{editErr}</p>}
          </div>
        )}
      </ERPModal>

      <ERPModal open={!!qrFor} onClose={() => setQrFor(null)} title="QR code ลิงก์สั้น" size="sm">
        {qrFor && (
          <div className="flex flex-col items-center gap-3 text-sm">
            <QrCode text={`${qrFor.short_url}?q=1`} size={220} />
            <div className="font-mono text-violet-700">{SHORT_LINK_DISPLAY}{qrFor.code}</div>
            <p className="text-[11px] text-slate-500 text-center">สแกน QR นับเป็นที่มา &quot;QR&quot; · แก้ปลายทางทีหลังได้ QR เดิมยังใช้ได้</p>
            <button type="button" onClick={() => void downloadQr(qrFor)} className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm"><Icon name="download" /> ดาวน์โหลด PNG</button>
          </div>
        )}
      </ERPModal>

      <ConfirmDialog open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={() => confirmDel && void doDelete(confirmDel)} variant="danger"
        title="ลบลิงก์สั้น?" confirmText="ย้ายลงถังขยะ"
        message={confirmDel ? `${SHORT_LINK_DISPLAY}${confirmDel.code} จะใช้ไม่ได้ (คนกดจะไปหน้าแรกร้าน) · กู้คืนได้จากถังขยะ` : ""} />
    </div>
  );
}
