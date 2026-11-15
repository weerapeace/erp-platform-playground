"use client";
/**
 * ห้องแชทรวม — ช่องขวา: ลูกค้า · แบรนด์ · มอบหมาย (UserPicker กลาง) · จบห้อง/เปิดกลับ · สต็อกสินค้าที่คุย · ออเดอร์ (เฟส 3)
 * ของกลาง: UserPicker · Icon · useToast
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { UserPicker, type UserPickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { CHAT_CHANNEL_INFO, isUnanswered, waitingText } from "@/lib/chat/rules";
import { ChannelIcon, CustomerAvatar, customerLabel, timeShort, type ChatDetail } from "./shared";

export function CustomerPanel({ detail, canAssign, onChanged, onClose }: {
  detail: ChatDetail;
  canAssign: boolean;
  onChanged: () => void;
  onClose?: () => void;
}) {
  const c = detail.conversation;
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/chat/conversations/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string | null };
      if (j.ok) { toast.success(ok); onChanged(); } else toast.error(j.error || "บันทึกไม่สำเร็จ");
    } catch { toast.error("บันทึกไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่"); }
    finally { setBusy(false); }
  };

  const assigned: UserPickerValue | null = c.assigned_to ? { id: c.assigned_to, code: null, name: c.assigned_name ?? "ผู้ใช้" } : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-white">
      <div className="flex items-start gap-3 border-b border-slate-100 p-4">
        <CustomerAvatar name={c.customer_name} src={c.customer_avatar} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-800">{customerLabel(c)}</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><ChannelIcon channel={c.channel} size={12} /> {CHAT_CHANNEL_INFO[c.channel].label}</div>
          <div className="text-xs text-slate-500">แบรนด์: {c.brand_name ?? "ยังไม่ระบุ"}</div>
          <div className="text-[11px] text-slate-400">ทักครั้งแรก {timeShort(c.created_at)}</div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 xl:hidden" title="ปิด"><Icon value="i:x" /></button>
        )}
      </div>

      <section className="space-y-2 border-b border-slate-100 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">สถานะ</h3>
          {isUnanswered(c)
            ? <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">{waitingText(c.waiting_since)}</span>
            : c.status === "done" ? <span className="rounded bg-emerald-100 px-1.5 text-[11px] text-emerald-800">จบแล้ว</span>
              : <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">ตอบแล้ว</span>}
        </div>
        {canAssign ? (
          <>
            <div>
              <div className="mb-1 text-xs text-slate-600">คนรับผิดชอบ</div>
              <UserPicker value={assigned} disabled={busy} placeholder="ยังไม่มีคนรับ — เลือก…" disableCreate
                onChange={(v) => void patch({ action: "assign", user_id: v?.id ?? null }, v ? `มอบให้ ${v.name} แล้ว` : "เอาคนรับผิดชอบออกแล้ว")} />
            </div>
            {c.status === "open"
              ? <button type="button" disabled={busy} onClick={() => void patch({ action: "status", status: "done" }, "จบห้องนี้แล้ว")}
                  className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  <Icon value="i:circle-check" /> จบแล้ว (ไม่ต้องตอบต่อ)
                </button>
              : <button type="button" disabled={busy} onClick={() => void patch({ action: "status", status: "open" }, "เปิดห้องกลับแล้ว")}
                  className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  <Icon value="i:refresh" /> เปิดห้องกลับ
                </button>}
            <p className="text-[11px] text-slate-400">ลูกค้าทักใหม่ = ห้องเปิดกลับเอง</p>
          </>
        ) : (
          <div className="text-xs text-slate-500">คนรับผิดชอบ: {c.assigned_name ?? "ยังไม่มี"}</div>
        )}
      </section>

      <section className="space-y-2 border-b border-slate-100 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">สินค้าที่คุยในห้องนี้</h3>
        {detail.products.length === 0
          ? <p className="text-xs text-slate-400">ส่งการ์ดสินค้าในห้อง แล้วสต็อกจะขึ้นที่นี่</p>
          : <ul className="space-y-1.5">
            {detail.products.map((p) => (
              <li key={p.sku_id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-slate-700"><b className="font-medium">{p.code}</b> {p.name}</span>
                <span className={`shrink-0 rounded px-1.5 ${p.on_hand == null ? "bg-slate-100 text-slate-500" : p.on_hand > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {p.on_hand == null ? "ไม่รู้สต็อก" : p.on_hand > 0 ? `เหลือ ${p.on_hand.toLocaleString("th-TH")}` : "หมด"}
                </span>
              </li>
            ))}
          </ul>}
      </section>

      <section className="space-y-1 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">ออเดอร์ล่าสุด</h3>
        <p className="text-xs text-slate-400">ยังไม่รู้ว่าลูกค้าคนนี้คือใครในระบบออเดอร์ — การผูกแชทกับออเดอร์อยู่ในเฟส 3</p>
      </section>
    </div>
  );
}
