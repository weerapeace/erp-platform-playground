"use client";

// 📥 กล่องเมลที่รับออเดอร์ (แท็บตั้งค่า) — เจ้าของเลือก 2026-11-27: หลายกล่อง · กล่องไหนให้ "ERP ดึงเอง" ได้ · สคริปต์เดิมยังใช้คู่กันได้
//   การ์ดแรก = สคริปต์ใน Gmail (แบบเดิม · สถานะจากรอบส่งล่าสุด) · การ์ดถัดไป = กล่องที่ ERP ดึงเองผ่านการเชื่อม Gmail ของกลาง
//   เพิ่ม/แก้ชื่อ/พัก/เอาออก (ย้อนกลับได้) · เชื่อม Gmail (หน้าของ Google) · ดึงตอนนี้ · ดึงย้อนหลัง N วัน (กดซ้ำจนครบเองอัตโนมัติ)
// ของกลาง: ERPModal · ConfirmDialog · ERPInput · toast.undo · Icon · API /api/platform-email/mailboxes + /api/gmail/connect

import { useCallback, useEffect, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { ago, fmtDateTime } from "./types";

type Run = { at: string; ok: boolean; error?: string; fetched: number; created: number; remaining: number; last_ok_at: string | null; fails: number; reconnect?: boolean; manual?: boolean };
type Box = { email: string; label: string; enabled: boolean; added_at: string; run: Run | null; connected: boolean; conn_error: string | null };
type Data = { boxes: Box[]; gmail_configured: boolean; script: { last_ping_at: string | null; last_received_at: string | null }; enabled: boolean };
type PullRes = { ok: boolean; error: string | null; reconnect: boolean; found: number; fetched: number; created: number; remaining: number };

const RETURN_TO = "/admin/platform-email?tab=settings";

export function MailboxesSection({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ mode: "add" | "edit"; email: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeFor, setRemoveFor] = useState<Box | null>(null);
  const [backFor, setBackFor] = useState<Box | null>(null);
  const [backDays, setBackDays] = useState(30);
  const [busy, setBusy] = useState<Record<string, string>>({});   // email → ข้อความกำลังทำ
  const stopRef = useRef<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/platform-email/mailboxes");
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j as Data); setLoadErr(null);
    } catch (e) { setLoadErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // กลับมาจากหน้า Google (?gmail=connected|error) → แจ้งผล แล้วล้าง URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const g = sp.get("gmail");
    if (!g) return;
    const email = sp.get("email") ?? "";
    const requested = sp.get("requested");
    if (g === "connected") {
      toast.success(`เชื่อม Gmail ของ ${email} แล้ว — กด "ดึงตอนนี้" หรือรอรอบอัตโนมัติ (ทุก 15 นาที)`);
      if (requested) toast.warning(`ตั้งใจเชื่อม ${requested} แต่ในหน้า Google เลือกบัญชี ${email} — ถ้าผิด กดเชื่อมใหม่แล้วเลือกให้ตรง (หรือเพิ่มกล่อง ${email})`);
    } else toast.error(`เชื่อม Gmail${email ? ` ของ ${email}` : ""} ไม่สำเร็จ: ${sp.get("reason") ?? "ไม่ทราบสาเหตุ"}`);
    ["gmail", "email", "requested", "reason"].forEach((k) => sp.delete(k));
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [toast]);

  const post = async (body: Record<string, unknown>) => {
    const r = await apiFetch("/api/platform-email/mailboxes", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && !j.error, j };
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const { ok, j } = await post(edit.mode === "add" ? { action: "add", email: edit.email, label: edit.label } : { action: "update", email: edit.email, label: edit.label });
      if (!ok) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(edit.mode === "add" ? "เพิ่มกล่องแล้ว — กด เชื่อม Gmail ต่อ" : "บันทึกแล้ว");
      setEdit(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const toggle = async (b: Box) => {
    const { ok, j } = await post({ action: "update", email: b.email, enabled: !b.enabled });
    if (!ok) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return; }
    toast.undo(b.enabled ? `พักการดึงกล่อง ${b.label}` : `เปิดดึงกล่อง ${b.label}`, async () => { await post({ action: "update", email: b.email, enabled: b.enabled }); await load(); });
    await load();
  };

  const remove = async () => {
    const b = removeFor; if (!b) return;
    const { ok, j } = await post({ action: "remove", email: b.email });
    setRemoveFor(null);
    if (!ok) { toast.error(j.error || "เอาออกไม่สำเร็จ"); return; }
    toast.undo(`เอากล่อง ${b.label} ออกแล้ว`, async () => {
      const r = await post({ action: "restore", box: j.box });
      if (r.ok) toast.success("ย้อนกลับแล้ว"); else toast.error(r.j.error || "ย้อนกลับไม่สำเร็จ");
      await load();
    });
    await load();
  };

  const connect = async (b: Box) => {
    try {
      const r = await apiFetch("/api/gmail/connect", { method: "POST", body: JSON.stringify({ email: b.email, return_to: RETURN_TO }) });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "เริ่มเชื่อมไม่สำเร็จ");
      window.location.href = j.url as string;
    } catch (e) { toast.error(e instanceof Error ? e.message : "เริ่มเชื่อมไม่สำเร็จ"); }
  };

  /** ดึงตอนนี้ (days=0) หรือย้อนหลัง — ย้อนหลังกดต่อเองจนครบ (ครั้งละ ~45 วิ) */
  const pull = async (b: Box, days = 0) => {
    stopRef.current[b.email] = false;
    let total = 0, created = 0, round = 0;
    try {
      for (;;) {
        round++;
        setBusy((s) => ({ ...s, [b.email]: days ? `ดึงย้อนหลัง ${days} วัน… รอบ ${round} (ได้ ${total} ฉบับ)` : "กำลังดึง…" }));
        const r = await apiFetch("/api/platform-email/mailboxes", { method: "POST", body: JSON.stringify({ action: "pull", email: b.email, days }) });
        const j = await r.json().catch(() => ({})) as PullRes & { error?: string | null };
        if (!j || j.ok === false) throw new Error(j?.error || "ดึงไม่สำเร็จ");
        total += j.fetched; created += j.created;
        if (!days || j.remaining <= 0 || j.fetched === 0 || stopRef.current[b.email] || round >= 40) {
          const left = days && j.remaining > 0 ? ` · เหลืออีก ~${j.remaining} ฉบับ (กดดึงย้อนหลังอีกครั้ง หรือรอรอบอัตโนมัติ)` : "";
          toast.success(total ? `ดึงแล้ว ${total} ฉบับ · ออเดอร์ใหม่ ${created}${left}` : `ไม่มีเมลใหม่${left}`);
          break;
        }
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "ดึงไม่สำเร็จ"); }
    finally { setBusy((s) => { const n = { ...s }; delete n[b.email]; return n; }); await load(); }
  };

  if (loadErr && !data) return <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">โหลดกล่องเมลไม่สำเร็จ: {loadErr} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></section>;
  if (!data) return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">กำลังโหลดกล่องเมล…</section>;

  const scriptAt = data.script.last_ping_at;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">กล่องเมลที่รับออเดอร์</div>
          <div className="text-xs text-slate-500">ใช้ได้หลายกล่องพร้อมกัน · ออเดอร์เดียวกันเข้าซ้ำหลายทาง ระบบนับครั้งเดียว</div>
        </div>
        {canManage && (
          <button onClick={() => setEdit({ mode: "add", email: "", label: "" })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="add" className="h-4 w-4" />เพิ่มกล่องเมล
          </button>
        )}
      </div>
      {!data.enabled && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">ปิดสวิตช์ &quot;รับเมลเข้า ERP&quot; ไว้ — ทุกกล่องหยุดรับจนกว่าจะเปิด</div>}

      <div className="mt-3 grid gap-3">
        {/* สคริปต์ใน Gmail (แบบเดิม) */}
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-800">กล่องที่ติดสคริปต์ใน Gmail</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">สคริปต์ใน Gmail (แบบเดิม)</span>
          </div>
          <div className={`mt-1 text-xs ${scriptAt ? "text-emerald-700" : "text-slate-400"}`}>
            {scriptAt ? `ส่งเข้าล่าสุด ${ago(scriptAt)} (${fmtDateTime(scriptAt)})` : "ยังไม่เคยส่งเข้า — ติดตั้งตามขั้นตอนด้านล่าง"}
          </div>
        </div>

        {data.boxes.map((b) => {
          const run = b.run;
          const needConnect = !b.connected || !!run?.reconnect;
          const working = busy[b.email];
          return (
            <div key={b.email} className={`rounded-lg border p-3 ${needConnect || (run && !run.ok) ? "border-amber-300" : "border-blue-200"} ${b.enabled ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{b.label}</div>
                  <div className="truncate text-xs text-slate-500">{b.email}</div>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-xs ${b.enabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{b.enabled ? "ERP ดึงเอง · ทุก 15 นาที" : "พักการดึง"}</span>
              </div>

              <div className="mt-2 text-xs">
                {needConnect ? (
                  <span className="text-amber-700">{b.connected ? "การเชื่อม Gmail หลุด/หมดอายุ — กดเชื่อมใหม่" : "ยังไม่ได้เชื่อม Gmail — กดเชื่อม แล้วล็อกอิน Gmail ของกล่องนี้"}{run?.error ? ` (${run.error})` : ""}</span>
                ) : run ? (
                  run.ok
                    ? <span className="text-emerald-700">ดึงล่าสุด {ago(run.at)} · {run.fetched ? `ได้ ${run.fetched} ฉบับ · ออเดอร์ใหม่ ${run.created}` : "ไม่มีเมลใหม่"}{run.remaining > 0 ? ` · ค้าง ${run.remaining} ฉบับ (รอบหน้าดึงต่อ)` : ""}</span>
                    : <span className="text-rose-700">ดึงไม่สำเร็จ {run.fails} รอบติด: {run.error}{run.last_ok_at ? ` · สำเร็จล่าสุด ${ago(run.last_ok_at)}` : ""}</span>
                ) : <span className="text-slate-400">เชื่อมแล้ว · ยังไม่เคยดึง — กด &quot;ดึงตอนนี้&quot; หรือรอรอบอัตโนมัติ</span>}
              </div>
              {working && <div className="mt-1 text-xs text-blue-700">{working}</div>}

              {canManage && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {needConnect && data.gmail_configured && (
                    <button onClick={() => void connect(b)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"><Icon name="open" className="h-3.5 w-3.5" />{b.connected ? "เชื่อม Gmail ใหม่" : "เชื่อม Gmail"}</button>
                  )}
                  {!data.gmail_configured && <span className="text-xs text-rose-600">ผู้ดูแลยังไม่ได้ตั้งค่าการเชื่อม Gmail (docs/gmail-connect-setup.md)</span>}
                  {!needConnect && (
                    <>
                      <button disabled={!!working || !b.enabled} onClick={() => void pull(b)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Icon name="refresh" className="h-3.5 w-3.5" />ดึงตอนนี้</button>
                      <button disabled={!!working || !b.enabled} onClick={() => { setBackDays(30); setBackFor(b); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Icon name="upload" className="h-3.5 w-3.5 rotate-180" />ดึงย้อนหลัง</button>
                    </>
                  )}
                  {working && <button onClick={() => { stopRef.current[b.email] = true; }} className="h-8 rounded-lg px-3 text-xs text-slate-500 hover:bg-slate-100">หยุดหลังรอบนี้</button>}
                  <button onClick={() => setEdit({ mode: "edit", email: b.email, label: b.label })} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-600 hover:bg-slate-100"><Icon name="edit" className="h-3.5 w-3.5" />แก้ชื่อ</button>
                  <button onClick={() => void toggle(b)} className="h-8 rounded-lg px-2 text-xs text-slate-600 hover:bg-slate-100">{b.enabled ? "พักการดึง" : "เปิดดึง"}</button>
                  <button onClick={() => setRemoveFor(b)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-rose-600 hover:bg-rose-50"><Icon name="delete" className="h-3.5 w-3.5" />เอาออก</button>
                </div>
              )}
            </div>
          );
        })}
        {!data.boxes.length && (
          <div className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">ยังไม่มีกล่องที่ให้ ERP ดึงเอง — กด &quot;เพิ่มกล่องเมล&quot; ใส่อีเมลของกล่องที่รับเมล Shopee/Lazada แล้วกดเชื่อม Gmail</div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">ERP อ่านเมลอย่างเดียว (ไม่ลบ ไม่ติดป้ายใน Gmail) · ร้านในเมลต้องอยู่ในรายการ &quot;ร้านของเรา&quot; ด้านล่าง · ถ้าการเชื่อมหลุด ระบบเด้งกระดิ่งแจ้ง</p>

      <ERPModal open={!!edit} onClose={() => setEdit(null)} size="sm" title={edit?.mode === "add" ? "เพิ่มกล่องเมลให้ ERP ดึงเอง" : "แก้ชื่อกล่องเมล"}
        hasUnsavedChanges={!!edit && (edit.mode === "add" ? !!(edit.email || edit.label) : false)}
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setEdit(null)} className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button disabled={saving || !edit || (edit.mode === "add" && !edit.email.trim())} onClick={() => void saveEdit()} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>}>
        {edit && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">อีเมล Gmail ของกล่อง</div>
              <ERPInput value={edit.email} disabled={edit.mode === "edit"} onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="shopname@gmail.com" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">ชื่อที่แสดง</div>
              <ERPInput value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="กล่อง IG International" />
            </div>
            {edit.mode === "add" && <div className="text-xs text-slate-500">บันทึกแล้วกด &quot;เชื่อม Gmail&quot; → ล็อกอิน Gmail ของกล่องนี้ในหน้า Google → อนุญาตให้อ่านเมล</div>}
          </div>
        )}
      </ERPModal>

      <ERPModal open={!!backFor} onClose={() => setBackFor(null)} size="sm" title={`ดึงย้อนหลัง — ${backFor?.label ?? ""}`}
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setBackFor(null)} className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button onClick={() => { const b = backFor; setBackFor(null); if (b) void pull(b, backDays); }} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">เริ่มดึง</button>
        </div>}>
        <div className="space-y-2">
          <div className="mb-1 text-xs text-slate-500">ย้อนหลังกี่วัน</div>
          <ERPInput type="number" min={1} max={365} value={backDays} onChange={(e) => setBackDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} />
          <div className="text-xs text-slate-500">เมลที่เคยรับแล้วข้ามเอง · เมลเยอะ ระบบทำทีละรอบ (~45 วินาที) ต่อกันเองจนครบ · ออเดอร์ที่มีอยู่แล้วไม่บันทึกซ้ำ</div>
        </div>
      </ERPModal>

      <ConfirmDialog open={!!removeFor} onClose={() => setRemoveFor(null)} onConfirm={() => void remove()} variant="danger"
        title={`เอากล่อง ${removeFor?.label ?? ""} ออก?`}
        message="ERP จะหยุดดึงเมลจากกล่องนี้ (เมล/ออเดอร์ที่รับไว้แล้วอยู่ครบ · การเชื่อม Gmail ไม่ถูกลบ) · กดย้อนกลับได้ในแจ้งเตือนมุมจอ"
        confirmText="เอาออก" cancelText="อยู่ต่อ" />
    </section>
  );
}
