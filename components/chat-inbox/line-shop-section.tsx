"use client";
/**
 * ห้องแชทรวม — ช่องขวา: ไลน์ลูกค้าคนนี้ผูกร้านไหน · คำขอผูกร้านจาก QR ลูกค้ารวม (ไลน์บริษัท)
 *   รอยืนยัน → เลือกร้าน (CustomerPicker กลาง) → "ยืนยันร้าน" (ย้อนกลับได้จากแจ้งผลมุมจอ) · "ไม่ใช่ลูกค้า" = ปฏิเสธ (เก็บไว้ ไม่ลบ)
 *   โชว์เฉพาะห้อง LINE ของบอทไลน์บริษัท · API /api/chat/conversations/[id]/line-shop
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { CustomerPicker, type CustomerPickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";

type Link = {
  id: string; status: "pending" | "linked" | "blocked"; partner_id: string | null; partner_name: string | null;
  requested_shop: string | null; contact_name: string | null; requested_at: string | null; decided_by: string | null;
};

export function LineShopSection({ conversationId, canDecide }: { conversationId: string; canDecide: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<{ company: boolean; link: Link | null } | null>(null);
  const [pick, setPick] = useState<CustomerPickerValue | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/chat/conversations/${conversationId}/line-shop`);
      const j = await r.json();
      if (r.ok && !j.error) setState({ company: !!j.company, link: j.link ?? null });
    } catch { /* ไม่ใช่ข้อมูลหลักของห้อง — โหลดไม่ได้ก็ซ่อนไว้ */ }
  }, [conversationId]);
  useEffect(() => { setState(null); setPick(null); void load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/chat/conversations/${conversationId}/line-shop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setState({ company: true, link: j.link ?? null });
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setBusy(false); }
  };

  if (!state?.company) return null;
  const l = state.link;
  const undo = (id: string) => async () => { if (await post({ action: "undo", link_id: id })) toast.success("ย้อนกลับเป็นรอยืนยันแล้ว"); };

  return (
    <section className="space-y-2 border-b border-slate-100 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">ร้านของลูกค้า (ไลน์บริษัท)</h3>
      {!l && <p className="text-xs text-slate-500">ยังไม่ได้ผูกร้าน — ให้ลูกค้าสแกน QR ลูกค้า หรือส่ง QR รายร้านให้</p>}
      {l?.status === "linked" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">
          <Icon value="i:circle-check" /> ผูกกับ <b>{l.partner_name ?? "ร้าน"}</b>{l.contact_name ? ` · ${l.contact_name}` : ""}
          {l.decided_by && <div className="text-[11px] text-emerald-700/80 mt-0.5">ยืนยันโดย {l.decided_by}</div>}
        </div>
      )}
      {l?.status === "blocked" && <p className="text-xs text-rose-700">ไลน์นี้ถูกระงับการดูข้อมูลร้าน {l.partner_name ?? ""} (คืนสิทธิ์ได้ที่ศูนย์ LINE)</p>}
      {l?.status === "pending" && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-xs text-amber-900">
            ขอผูกกับร้าน: <b>{l.requested_shop}</b>{l.contact_name ? ` · ${l.contact_name}` : ""}
          </div>
          {canDecide ? (
            <>
              <CustomerPicker value={pick} onChange={setPick} disabled={busy} placeholder="เลือกร้านในระบบที่ตรงกัน…" />
              <div className="flex gap-1.5">
                <button type="button" disabled={busy || !pick}
                  onClick={async () => { if (pick && (await post({ action: "approve", link_id: l.id, partner_id: pick.id }))) toast.undo(`ผูกกับ ${pick.name} แล้ว · เมนูลูกค้าขึ้นในไลน์ของเขาแล้ว`, undo(l.id)); }}
                  className="h-8 flex-1 rounded-md bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40">ยืนยันร้าน</button>
                <button type="button" disabled={busy}
                  onClick={async () => {
                    if (!(await askConfirm({ title: "ไม่ใช่ลูกค้าของเรา?", message: "คำขอนี้จะถูกปฏิเสธ (เก็บประวัติไว้ ย้อนกลับได้) · ลูกค้ายังทักแชตได้ตามปกติ", confirmText: "ปฏิเสธ" }))) return;
                    if (await post({ action: "reject", link_id: l.id })) toast.undo("ปฏิเสธคำขอแล้ว", undo(l.id));
                  }}
                  className="h-8 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">ไม่ใช่ลูกค้า</button>
              </div>
            </>
          ) : <p className="text-[11px] text-amber-800">รอคนที่ตอบแชตได้กดยืนยันร้าน</p>}
        </div>
      )}
    </section>
  );
}
