"use client";

/**
 * ⚙ ตั้งค่าภาษาที่แสดง — ปุ่มท้ายแถบภาษาในลิ้นชัก/ฟอร์มกลาง (MasterCRUD) · กติกา: lib/form-lang-prefs
 *   • ติ๊กภาษาที่อยากเห็น (ไทยเปิดตลอด) → เปลี่ยนทันที + จำไว้กับบัญชี (ทุกเครื่อง)
 *   • ปิดแค่ซ่อน คำแปลไม่หาย · "คืนค่าเริ่มต้น" = กลับไปใช้ค่าที่แอดมินตั้ง (หรือทุกภาษา)
 *   • แอดมิน (admin.users) ตั้ง "ค่าเริ่มต้นของทุกคน" ได้ในแผงเดียวกัน — บันทึกที่ ui_config (audit ที่ API)
 */
import { Popover } from "@/components/popover";
import { Icon } from "@/components/icon";
import { tr } from "@/lib/lang";

export function LangSettingsButton({ langs, shown, isMine, onToggle, onReset, team, canTeam, onTeamToggle, onTeamClear, teamSaving, label }: {
  /** ภาษาอื่นที่ฟอร์มนี้มี (ไม่รวมไทย) */
  langs: string[];
  shown: string[];
  /** ตั้งค่าเองแล้ว (ไม่ได้ใช้ค่าเริ่มต้น) */
  isMine: boolean;
  onToggle: (lang: string) => void;
  onReset: () => void;
  /** ค่าเริ่มต้นของทีม (null = ยังไม่ตั้ง = ทุกภาษา) */
  team: string[] | null;
  canTeam: boolean;
  onTeamToggle: (lang: string) => void;
  onTeamClear: () => void;
  teamSaving: boolean;
  label: (code: string) => string;
}) {
  const teamShown = team ?? langs;
  return (
    <Popover align="left" panelClassName="w-72 p-3 rounded-lg border border-slate-200 bg-white shadow-lg overflow-y-auto"
      trigger={(toggle, open) => (
        <button type="button" onClick={toggle} aria-label={tr("ตั้งค่าภาษาที่แสดง", "Choose languages to show")} aria-expanded={open}
          title={tr("ตั้งค่าภาษาที่แสดง — ซ่อนภาษาที่ไม่ใช้ จะได้ดูไม่รก", "Choose which languages to show")}
          className={`h-8 w-8 inline-flex items-center justify-center rounded-lg border ${open ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          <Icon name="settings" size={15} />
        </button>
      )}>
      {() => (
        <div className="text-[13px] text-slate-700">
          <div className="font-semibold mb-1.5">{tr("ภาษาที่แสดง (ของฉัน)", "Languages I see")}</div>
          <label className="flex items-center gap-2 py-1 text-slate-400">
            <input type="checkbox" checked disabled /> {tr("ไทย", "Thai")} <span className="text-[11px]">{tr("(ภาษาหลัก แสดงเสมอ)", "(main, always shown)")}</span>
          </label>
          {langs.map((l) => (
            <label key={l} className="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={shown.includes(l)} onChange={() => onToggle(l)} /> {label(l)}
            </label>
          ))}
          <p className="mt-1.5 text-[11.5px] text-slate-500">{tr("ปิดแล้วแค่ซ่อน คำแปลที่บันทึกไว้ไม่หาย · จำไว้กับบัญชี ใช้ได้ทุกเครื่อง", "Hiding never deletes translations · saved to your account")}</p>
          {isMine && (
            <button type="button" onClick={onReset} className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50">
              <Icon name="refresh" size={13} />{tr("คืนค่าเริ่มต้น", "Reset to default")}
            </button>
          )}
          {canTeam && (
            <div className="mt-3 border-t border-slate-100 pt-2.5">
              <div className="font-semibold mb-0.5">{tr("ค่าเริ่มต้นของทุกคน", "Default for everyone")} <span className="text-[11px] font-normal text-slate-400">{tr("(แอดมิน)", "(admin)")}</span></div>
              <p className="text-[11.5px] text-slate-500 mb-1">{tr("คนที่ยังไม่เคยตั้งเองจะเห็นตามนี้", "People who haven't chosen their own see this")}</p>
              {langs.map((l) => (
                <label key={l} className={`flex items-center gap-2 py-1 ${teamSaving ? "opacity-60" : "cursor-pointer"}`}>
                  <input type="checkbox" disabled={teamSaving} checked={teamShown.includes(l)} onChange={() => onTeamToggle(l)} /> {label(l)}
                </label>
              ))}
              {team && (
                <button type="button" disabled={teamSaving} onClick={onTeamClear} className="mt-1 text-[12px] text-slate-500 underline hover:text-slate-700 disabled:opacity-50">
                  {tr("ล้างค่าเริ่มต้น (ให้ทุกคนเห็นทุกภาษา)", "Clear default (everyone sees all)")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
