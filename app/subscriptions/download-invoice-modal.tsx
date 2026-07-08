"use client";

/**
 * ป๊อปอัปช่วยดาวน์โหลดใบเสร็จ — แก้ปัญหา "แต่ละรายการใช้คนละเมล"
 * โชว์: อีเมล + Chrome profile ที่ผูกกับรายการ (คัดลอกเมลได้) + ปุ่มเปิดหน้าบิลของร้าน
 * เตือนให้เปิดลิงก์ใน Chrome profile ที่ล็อกอินเมลนั้นไว้ → โหลดใบเสร็จได้เลย
 */
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { Subscription } from "@/lib/subscriptions";

const normUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export function DownloadInvoiceModal({ sub, canEdit, onClose, onEdit }: {
  sub: Subscription | null;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (s: Subscription) => void;
}) {
  const toast = useToast();
  const open = !!sub;
  const invLink = sub?.invoice_url ? normUrl(sub.invoice_url) : null;
  const profileLink = sub?.chrome_profile_url ? normUrl(sub.chrome_profile_url) : null;

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`คัดลอก${what}แล้ว`); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="sm"
      title="⬇️ ดาวน์โหลดใบเสร็จ" description={sub?.name}
      footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>}>
      {sub && (
        <div className="space-y-4">
          {/* บัญชีที่ใช้ */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
            <div className="text-xs font-medium text-slate-500">บัญชีที่ผูกกับรายการนี้</div>
            <Field label="อีเมล" value={sub.account_email} onCopy={sub.account_email ? () => copy(sub.account_email, "อีเมล") : undefined} />
            <Field label="Chrome profile" value={sub.chrome_profile} />
          </div>

          {(sub.account_email || sub.chrome_profile) && (
            <p className="text-xs text-slate-500 bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2">
              💡 เปิดลิงก์ด้านล่างใน <b>Chrome ที่ล็อกอินอีเมลนี้ไว้</b>
              {sub.chrome_profile ? <> (โปรไฟล์ <b>{sub.chrome_profile}</b>)</> : null} แล้วกดโหลดใบเสร็จได้เลย
            </p>
          )}

          {/* ปุ่มเปิดหน้าบิล */}
          {invLink ? (
            <a href={invLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-11 w-full rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
              🔗 เปิดหน้าบิล/ใบเสร็จของร้าน
            </a>
          ) : (
            <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-3 py-3 text-center">
              <p className="text-xs text-amber-700">ยังไม่ได้ใส่ลิงก์หน้าบิลของร้าน</p>
              {canEdit && (
                <button onClick={() => onEdit(sub)} className="mt-2 h-9 px-4 text-sm font-medium bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50">
                  ✎ ใส่ลิงก์หน้าบิล
                </button>
              )}
            </div>
          )}

          {profileLink && (
            <a href={profileLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-9 w-full rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">
              🌐 เปิดหน้าโปรไฟล์/แดชบอร์ด
            </a>
          )}
        </div>
      )}
    </ERPModal>
  );
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-24 flex-shrink-0">{label}</span>
      <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{value || <span className="text-slate-300">—</span>}</span>
      {onCopy && (
        <button onClick={onCopy} title="คัดลอก" className="h-7 px-2 text-xs rounded-md border border-slate-200 text-slate-500 hover:bg-white flex-shrink-0">📋 คัดลอก</button>
      )}
    </div>
  );
}
