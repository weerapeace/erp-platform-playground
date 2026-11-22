"use client";

/**
 * ส่วน "ไลน์บริษัท" ในศูนย์ LINE — เลือกบอทที่เป็นไลน์บริษัท · ตั้งปุ่มเมนูล่างจอ 4 ชุด (company-menu-editor) · สร้างเมนูในไลน์ · ดูพนักงาน/ลูกค้าที่ผูกไลน์
 * API: /api/admin/line-company · กติกา lib/line-company · คู่มือ docs/line-company-oa.md
 * part: all = ทั้งหมด (ป๊อปศูนย์ LINE) · setup = บอท+ปุ่มเมนู+QR · people = คนที่ผูกไลน์ (หน้า /admin/line แยกแท็บ)
 * พนักงาน: ปลดผูก/ระงับที่หน้าสมาชิกไลน์ของฝ่ายบุคคล (ของเดิม) · ลูกค้า: ถอนผูก (ย้อนได้) / ระงับ / ตั้งชื่อเรียก ที่นี่
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import type { CompanyMenuLayout } from "@/lib/line-company";
import { CompanyMenuEditor, type LayoutHistoryItem } from "@/components/line-console/company-menu-editor";
import { CompanyQrPanel, type CompanyQrData } from "@/components/line-console/company-qr-panel";
import { CustomerPicker, type CustomerPickerValue } from "@/components/pickers";

type Data = {
  bots: { key: string; label: string; basic_id: string; ready: boolean }[];
  company_bot: string | null;
  company_ready: boolean;
  menus: { published: boolean; published_at: string | null };
  layout: { layout: CompanyMenuLayout; saved_at: string | null; saved_by: string | null };
  layout_history: LayoutHistoryItem[];
  layout_pending: boolean;
  qr: CompanyQrData;
  shop_qr_rotated_at: string | null;
  chat_enabled: boolean;
  employees_active: number | null;
  employees: { id: string; status: string; linked_at: string | null; line_name: string; code: string; name: string; left_company: boolean; hr_confirmed: boolean; link_method: string }[];
  customers: { id: string; status: string; linked_at: string | null; unlinked_at: string | null; line_name: string; contact_name: string; partner_id: string; partner_name: string; requested_shop: string; requested_at: string | null }[];
};

const STATUS: Record<string, { label: string; cls: string }> = {
  linked: { label: "ผูกอยู่", cls: "bg-emerald-50 text-emerald-700" },
  blocked: { label: "ระงับ", cls: "bg-rose-50 text-rose-700" },
  unlinked: { label: "ถอนผูกแล้ว", cls: "bg-slate-100 text-slate-500" },
  pending: { label: "รอยืนยันร้าน", cls: "bg-amber-50 text-amber-700" },
  rejected: { label: "ปฏิเสธแล้ว", cls: "bg-slate-100 text-slate-500" },
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "");

export function LineCompanySection({ part = "all" }: { part?: "all" | "setup" | "people" } = {}) {
  const showSetup = part !== "people";
  const showPeople = part !== "setup";
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"employees" | "customers">("employees");
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [shopPick, setShopPick] = useState<Record<string, CustomerPickerValue | null>>({});

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/admin/line-company"); const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j as Data); setLoadErr(null);
    } catch (e) { setLoadErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/admin/line-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "ไม่สำเร็จ");
      await load();
      return j as Record<string, unknown>;
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); return null; }
    finally { setBusy(false); }
  };

  const setBot = async (key: string) => {
    if (data?.company_bot && data.menus.published) {
      const ok = await askConfirm({ title: "เปลี่ยนบอทไลน์บริษัท?", message: "เมนูล่างจอของบอทเดิมจะถูกถอดออก แล้วต้องกดสร้างเมนูใหม่ให้บอทที่เลือก", confirmText: "เปลี่ยน" });
      if (!ok) return;
    }
    const j = await post({ set_bot: key });
    if (j) toast.success(key ? `ตั้งเป็นไลน์บริษัทแล้ว${j.chat_enabled ? " · แชทลูกค้าเข้าห้องแชทรวมแล้ว" : ""}` : "เลิกใช้ไลน์บริษัทแล้ว");
  };

  const publish = async () => {
    const j = await post({ publish: true });
    if (!j) return;
    const l = j.linked as { admins: number; employees: number; customers: number; failed: number } | undefined;
    toast.success(`สร้างเมนูในไลน์แล้ว · แอดมิน ${l?.admins ?? 0} · พนักงาน ${l?.employees ?? 0} · ลูกค้า ${l?.customers ?? 0} คน`);
    if (l?.failed) toast.warning(`ผูกเมนูให้ ${l.failed} คนไม่สำเร็จ — คนเหล่านั้นจะได้เมนูถูกเมื่อปิด-เปิดแชตใหม่ หรือกดสร้างเมนูอีกครั้ง`);
  };

  const customerAction = async (c: Data["customers"][number], action: "unlink" | "block" | "unblock" | "rename") => {
    const who = c.contact_name || c.line_name || "คนนี้";
    if (action === "rename") {
      const v = await askText({ title: "ชื่อเรียก (เช่น คุณนก ฝ่ายจัดซื้อ)", initial: c.contact_name });
      if (v === null || v.trim() === c.contact_name) return;
      if (await post({ link_id: c.id, action, contact_name: v })) toast.success("เปลี่ยนชื่อเรียกแล้ว");
      return;
    }
    if (action === "block") {
      const ok = await askConfirm({ title: `ระงับ ${who}?`, message: `ไลน์นี้จะดูข้อมูลของร้าน ${c.partner_name} ไม่ได้จนกว่าจะคืนสิทธิ์ (ยังทักแชทหาพนักงานได้)`, confirmText: "ระงับ", variant: "danger" });
      if (!ok) return;
    }
    if (!(await post({ link_id: c.id, action }))) return;
    if (action === "unlink") toast.undo(`ถอนผูก ${who} แล้ว`, async () => { if (await post({ link_id: c.id, action: "relink" })) toast.success("ย้อนการถอนผูกแล้ว"); });
    else toast.success(action === "block" ? "ระงับแล้ว" : "คืนสิทธิ์แล้ว");
  };

  /** คำขอผูกร้านจาก QR ลูกค้ารวม — ยืนยัน (เลือกร้าน) / ปฏิเสธ · ย้อนกลับได้จากแจ้งผลมุมจอ */
  const decide = async (c: Data["customers"][number], action: "approve" | "reject") => {
    const pick = shopPick[c.id];
    if (action === "approve" && !pick) { toast.warning("เลือกร้านในระบบก่อน"); return; }
    if (action === "reject" && !(await askConfirm({ title: "ปฏิเสธคำขอนี้?", message: `"${c.requested_shop}" จะถูกปฏิเสธ (เก็บประวัติไว้ ย้อนกลับได้)`, confirmText: "ปฏิเสธ" }))) return;
    if (!(await post({ decide: { link_id: c.id, action, partner_id: pick?.id ?? null } }))) return;
    toast.undo(action === "approve" ? `ผูกกับ ${pick?.name} แล้ว` : "ปฏิเสธคำขอแล้ว", async () => { if (await post({ decide: { link_id: c.id, action: "undo" } })) toast.success("ย้อนกลับเป็นรอยืนยันแล้ว"); });
  };

  if (loadErr) return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 flex items-center gap-2">
      <span className="flex-1">ไลน์บริษัท: {loadErr}</span>
      <button onClick={() => void load()} className="h-7 px-2.5 text-xs rounded-lg border border-rose-200 bg-white">ลองใหม่</button>
    </div>
  );
  if (!data) return <div className="text-xs text-slate-400 py-3">กำลังโหลดไลน์บริษัท…</div>;

  const linkedEmp = data.employees.filter((e) => e.status === "linked" && !e.left_company).length;
  const customers = data.customers.filter((c) => showUnlinked || (c.status !== "unlinked" && c.status !== "rejected"));
  const pendingCus = data.customers.filter((c) => c.status === "pending").length;
  const waitHr = data.employees.filter((e) => e.status === "linked" && !e.left_company && !e.hr_confirmed).length;
  const linkedCus = data.customers.filter((c) => c.status === "linked");
  const shops = new Set(linkedCus.map((c) => c.partner_id)).size;

  return (
    <div>
      {part === "all" && <div className="text-xs font-semibold text-slate-500 mb-1">ไลน์บริษัท (พนักงาน + ลูกค้าทักแชทได้)</div>}
      {showSetup && <div className="text-[11px] text-slate-400 mb-2">บอทที่เลือกจะแยกคนให้เอง: พนักงาน · ลูกค้า · คนที่ยังไม่ผูก เห็นเมนูล่างจอคนละชุด · แชทลูกค้าเข้าห้องแชทรวม</div>}

      <div className="border border-slate-200 rounded-lg p-2.5 space-y-2">
        {showSetup && <>
        {/* เลือกบอท */}
        <div className="flex items-center gap-2 flex-wrap">
          <Icon value="🤖" className="text-slate-500 shrink-0" />
          <span className="text-sm text-slate-700">บอทไลน์บริษัท</span>
          <select value={data.company_bot ?? ""} disabled={busy} onChange={(e) => void setBot(e.target.value)}
            className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white min-w-[180px]">
            <option value="">— ยังไม่ใช้ —</option>
            {data.bots.map((b) => <option key={b.key} value={b.key} disabled={!b.ready}>{b.label}{b.basic_id ? ` (${b.basic_id})` : ""}{b.ready ? "" : " · ยังไม่มีรหัสลับ"}</option>)}
          </select>
          {data.company_bot && (data.company_ready
            ? <span className="text-[11px] text-emerald-600">พร้อมรับแชท</span>
            : <span className="text-[11px] text-rose-600">บอทนี้ยังไม่มีโทเคน/รหัสลับ</span>)}
          {data.company_bot && !data.chat_enabled && <span className="text-[11px] text-amber-700">ยังไม่ได้เปิดรับแชทลูกค้าในหน้าตั้งค่าแชท</span>}
        </div>
        {!data.company_bot && (
          <div className="text-[11px] text-slate-500 pl-6">ยังไม่มีบอท? เพิ่มบอทใหม่ในส่วน &ldquo;บอท&rdquo; ด้านบนก่อน (ต้องอยู่ Provider เดียวกับ LINE Login ของระบบ ไม่งั้นระบบจำคนไม่ได้) แล้วคัดลอก Webhook ไปวางใน LINE Developers</div>
        )}

        {/* เมนูล่างจอ: ตั้งปุ่มได้ตั้งแต่ยังไม่มีบอท · สร้างในไลน์ได้เมื่อเลือกบอทแล้ว */}
        <div className="pl-6 space-y-2 pt-1 border-t border-slate-100">
          <CompanyMenuEditor key={data.layout.saved_at ?? "default"} layout={data.layout.layout} history={data.layout_history}
            savedAt={data.layout.saved_at} busy={busy} onSaved={load} />
          {data.company_bot ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button disabled={busy || !data.company_ready} onClick={() => void publish()}
                className="h-8 px-3 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                {busy ? "กำลังทำ…" : data.menus.published ? "สร้างเมนูในไลน์ใหม่" : "สร้างเมนูในไลน์"}
              </button>
              <span className={`text-[11px] ${data.layout_pending ? "text-amber-700" : "text-slate-500"}`}>
                {data.layout_pending ? "แก้ปุ่มแล้ว แต่คนในไลน์ยังเห็นชุดเก่า — กดสร้างเมนูในไลน์ใหม่"
                  : data.menus.published ? `สร้างล่าสุด ${fmt(data.menus.published_at)} · ระบบสลับเมนูให้เองเมื่อมีคนผูก/ถอนผูก` : "ยังไม่ได้สร้าง — ตอนนี้คนในไลน์จะเห็นเมนูที่ตั้งใน LINE OA Manager (ถ้ามี)"}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">ตั้งปุ่มรอไว้ได้เลย · เลือกบอทไลน์บริษัทด้านบนแล้วจะมีปุ่ม &ldquo;สร้างเมนูในไลน์&rdquo;</div>
          )}
        </div>

        {/* QR 3 แบบ + QR รายร้าน */}
        <div className="pl-6 pt-2 border-t border-slate-100">
          <CompanyQrPanel qr={data.qr} shopRotatedAt={data.shop_qr_rotated_at} busy={busy} onChanged={load} />
        </div>

        </>}

        {showPeople && <>
        {/* คนที่ผูกไลน์ */}
        <div className={`flex items-center gap-1.5 ${showSetup ? "pt-1 border-t border-slate-100" : ""}`}>
          <button onClick={() => setTab("employees")} className={`h-7 px-2.5 text-xs rounded-lg border ${tab === "employees" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>
            พนักงาน {linkedEmp}{data.employees_active != null ? `/${data.employees_active}` : ""}{waitHr > 0 ? <span className="text-amber-700"> · รอ HR ยืนยัน {waitHr}</span> : null}
          </button>
          <button onClick={() => setTab("customers")} className={`h-7 px-2.5 text-xs rounded-lg border ${tab === "customers" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>
            ลูกค้า {linkedCus.length} คน · {shops} ร้าน{pendingCus > 0 ? <span className="text-amber-700"> · รอยืนยัน {pendingCus}</span> : null}
          </button>
          <button onClick={() => void load()} className="h-7 px-2 text-xs rounded-lg border border-slate-200 text-slate-500 ml-auto" aria-label="รีเฟรช"><Icon value="🔄" /></button>
        </div>

        {tab === "employees" && (
          <div>
            {data.employees.length === 0
              ? <div className="text-[11px] text-slate-500 py-2">ยังไม่มีพนักงานผูกไลน์ — พิมพ์บัตร QR แจกได้ที่ <Link href="/payroll/line-members" className="text-indigo-600 underline">หน้าสมาชิกไลน์ (ฝ่ายบุคคล)</Link></div>
              : <div className="divide-y divide-slate-100">
                  {data.employees.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 py-1.5 text-xs">
                      <span className="w-16 text-slate-500 shrink-0">{e.code}</span>
                      <span className="flex-1 min-w-0 truncate text-slate-700">{e.name}<span className="text-slate-400"> · ไลน์ {e.line_name || "-"}</span></span>
                      {e.left_company && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 shrink-0">ลาออกแล้ว ยังไม่ปลดผูก</span>}
                      {e.status === "linked" && !e.left_company && !e.hr_confirmed && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 shrink-0">รอ HR ยืนยัน</span>}
                      <span className={`px-1.5 py-0.5 rounded shrink-0 ${STATUS[e.status]?.cls ?? ""}`}>{STATUS[e.status]?.label ?? e.status}</span>
                    </div>
                  ))}
                </div>}
            {data.employees.length > 0 && <div className="text-[11px] text-slate-400 pt-1">ปลดผูก/ระงับพนักงาน ทำที่ <Link href="/payroll/line-members" className="text-indigo-600 underline">หน้าสมาชิกไลน์ (ฝ่ายบุคคล)</Link></div>}
          </div>
        )}

        {tab === "customers" && (
          <div>
            {data.customers.length === 0
              ? <div className="text-[11px] text-slate-500 py-2">ยังไม่มีลูกค้าผูกไลน์ — ให้ลูกค้าสแกน QR ลูกค้า (รวมทุกร้าน) หรือพิมพ์ QR รายร้านจากด้านบน</div>
              : <>
                  <div className="divide-y divide-slate-100">
                    {customers.map((c) => c.status === "pending" ? (
                      <div key={c.id} className="flex items-center gap-2 py-1.5 text-xs flex-wrap bg-amber-50/40">
                        <span className="flex-1 min-w-[140px] truncate text-slate-700">ขอผูกร้าน: <b>{c.requested_shop}</b><span className="text-slate-400"> · {c.contact_name || c.line_name || "-"}</span></span>
                        <div className="w-56"><CustomerPicker value={shopPick[c.id] ?? null} onChange={(v) => setShopPick((m) => ({ ...m, [c.id]: v }))} disabled={busy} placeholder="เลือกร้านที่ตรงกัน…" /></div>
                        <button disabled={busy} onClick={() => void decide(c, "approve")} className="h-6 px-2 rounded bg-emerald-600 text-white shrink-0 disabled:opacity-40">ยืนยันร้าน</button>
                        <button disabled={busy} onClick={() => void decide(c, "reject")} className="h-6 px-2 rounded border border-slate-200 text-slate-600 shrink-0">ปฏิเสธ</button>
                      </div>
                    ) : (
                      <div key={c.id} className="flex items-center gap-2 py-1.5 text-xs flex-wrap">
                        <span className="flex-1 min-w-[140px] truncate text-slate-700">{c.partner_name || c.requested_shop}<span className="text-slate-400"> · {c.contact_name || c.line_name || "-"}</span></span>
                        <span className={`px-1.5 py-0.5 rounded shrink-0 ${STATUS[c.status]?.cls ?? ""}`}>{STATUS[c.status]?.label ?? c.status}</span>
                        <button disabled={busy} onClick={() => void customerAction(c, "rename")} className="h-6 px-2 rounded border border-slate-200 text-slate-600 shrink-0">ชื่อเรียก</button>
                        {c.status === "linked" && <button disabled={busy} onClick={() => void customerAction(c, "block")} className="h-6 px-2 rounded border border-rose-200 text-rose-600 shrink-0">ระงับ</button>}
                        {c.status === "blocked" && <button disabled={busy} onClick={() => void customerAction(c, "unblock")} className="h-6 px-2 rounded border border-emerald-200 text-emerald-700 shrink-0">คืนสิทธิ์</button>}
                        {(c.status === "linked" || c.status === "blocked") && <button disabled={busy} onClick={() => void customerAction(c, "unlink")} className="h-6 px-2 rounded border border-slate-200 text-slate-600 shrink-0">ถอนผูก</button>}
                      </div>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
                    <input type="checkbox" checked={showUnlinked} onChange={(e) => setShowUnlinked(e.target.checked)} /> แสดงที่ถอนผูกแล้ว
                  </label>
                </>}
          </div>
        )}
        </>}
      </div>
    </div>
  );
}
