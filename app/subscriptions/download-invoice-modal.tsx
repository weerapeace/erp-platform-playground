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

function sanitizeName(n: string): string {
  return (n || "subscription").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 40) || "subscription";
}
// ไฟล์ .bat (Windows) เปิด Chrome โปรไฟล์ที่ระบุ + หน้าบิล — ดับเบิลคลิกเพื่อรัน
function makeBat(profileDir: string, url: string): string {
  const safeUrl = url.replace(/%/g, "%%"); // escape % สำหรับ batch
  return `@echo off\r\nstart "" chrome --profile-directory="${profileDir}" "${safeUrl}"\r\n`;
}
function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(href);
}

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
  const canBat = !!(sub?.chrome_profile_dir && invLink);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`คัดลอก${what}แล้ว`); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  };

  const genBat = () => {
    if (!sub || !invLink || !sub.chrome_profile_dir) return;
    downloadTextFile(`chrome-${sanitizeName(sub.name)}.bat`, makeBat(sub.chrome_profile_dir, invLink));
    toast.success("ดาวน์โหลดไฟล์แล้ว — ดับเบิลคลิกเพื่อเปิด Chrome");
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

          {/* เปิดใน Chrome โปรไฟล์ที่ถูก (ไฟล์ลัด .bat) */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="text-xs font-medium text-slate-600">🖥️ เปิดใน Chrome โปรไฟล์ที่ถูก (ไฟล์ลัด)</div>
            {canBat ? (
              <>
                <button onClick={genBat}
                  className="h-9 w-full rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900">
                  ⬇️ ดาวน์โหลดไฟล์เปิด Chrome (.bat)
                </button>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ดับเบิลคลิกไฟล์ที่โหลด → Chrome เปิดโปรไฟล์ <b>{sub.chrome_profile_dir}</b> + หน้าบิลให้เลย
                  <br />ครั้งแรกถ้า Windows เตือน กด &ldquo;More info &rarr; Run anyway&rdquo;
                </p>
              </>
            ) : (
              <p className="text-[11px] text-amber-600">
                ต้องมีทั้ง <b>ลิงก์หน้าบิล</b> และ <b>โฟลเดอร์โปรไฟล์ Chrome</b> ก่อน{canEdit && " — กด ✎ แก้ไขเพื่อเพิ่ม"}
              </p>
            )}
          </div>

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
