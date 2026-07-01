"use client";

// หน้ารายละเอียดเป้าหมาย (เฟส 1 mock) — พระเอกคือ "เส้นทางสู่ความสำเร็จ" (GoalRoadmap กลาง)
// กดขั้นบันไดสลับเสร็จ/ยังไม่เสร็จ → วง% เดินเอง · Check-in / เปลี่ยนสถานะ ผ่าน ERPModal กลาง
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ERPModal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { GoalRoadmap, type RoadmapStep } from "@/components/goal-roadmap";
import {
  findGoal, goalProgress, daysLeft, CATEGORY_LABEL, HEALTH_META, DEFAULT_REWARD,
  type Goal, type GoalHealth, type GoalStatus, type GoalCheckin,
} from "../mock-data";
import { GoalStatusBadge, GoalHealthBadge, ProgressRing } from "../goal-badges";
import { GameBar } from "../game-bar";
import { useCoinFx } from "../coin-fx";
import { awardCoins } from "../player-store";

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${TH_MONTH[m - 1]} ${y}` : iso;
}
const fmtNum = (n?: number) => (n == null ? "—" : n.toLocaleString("th-TH"));

const HEALTH_OPTIONS = [
  { value: "on_track", label: "🟢 ตามแผน" },
  { value: "at_risk", label: "🟡 เริ่มเสี่ยง" },
  { value: "off_track", label: "🔴 หลุดเป้า" },
];
const STATUS_OPTIONS: { value: GoalStatus; label: string; cls: string }[] = [
  { value: "active", label: "กำลังทำ", cls: "text-blue-700 border-blue-200 hover:bg-blue-50" },
  { value: "paused", label: "พักไว้", cls: "text-amber-700 border-amber-200 hover:bg-amber-50" },
  { value: "achieved", label: "สำเร็จ 🎉", cls: "text-emerald-700 border-emerald-200 hover:bg-emerald-50" },
  { value: "cancelled", label: "ยกเลิก", cls: "text-slate-600 border-slate-200 hover:bg-slate-50" },
];

export default function GoalDetailPage() {
  const id = String(useParams().id ?? "");
  const toast = useToast();
  const { user } = useAuth();
  const myName = user?.name ?? "อีวา";

  const [goal, setGoal] = useState<Goal | undefined>(() => {
    const g = findGoal(id);
    return g ? (JSON.parse(JSON.stringify(g)) as Goal) : undefined;
  });
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const { fx, burst } = useCoinFx();

  const progress = useMemo(() => (goal ? goalProgress(goal) : 0), [goal]);

  if (!goal) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-500 mb-3">ไม่พบเป้าหมายนี้</p>
        <Link href="/goals" className="text-violet-600 hover:underline">← กลับไปหน้ารายการ</Link>
      </div>
    );
  }

  const dl = daysLeft(goal.target_date);
  const showMetric = goal.measure_type !== "boolean" && goal.target_value != null;
  const reward = { ...DEFAULT_REWARD, ...(goal.reward ?? {}) };

  function toggleStep(stepId: string) {
    const step = goal.steps.find((s) => s.id === stepId);
    if (!step) return;
    const becameDone = step.status !== "done";
    setGoal((prev) =>
      prev
        ? {
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === stepId ? { ...s, status: becameDone ? ("done" as const) : ("in_progress" as const) } : s,
            ),
          }
        : prev,
    );
    // เหรียญ: ทำขั้นบันไดเสร็จ (ไม่หักคืนตอนกดกลับ — ให้กำลังใจ)
    if (becameDone && (reward.per_step ?? 0) > 0) {
      awardCoins(reward.per_step!, `ทำขั้นบันไดเสร็จ · ${goal.title}`);
      burst(reward.per_step!, "ทำขั้นเสร็จ");
    }
  }

  function addCheckin(c: GoalCheckin) {
    const oldVal = goal.current_value;
    setGoal((prev) =>
      prev ? { ...prev, health: c.health, current_value: c.current_value ?? prev.current_value, checkins: [c, ...prev.checkins] } : prev,
    );
    setCheckinOpen(false);
    // เหรียญ: check-in สม่ำเสมอ (+3) + ทุก X หน่วย (แบบวิดพื้น)
    let coins = 3;
    const parts = ["check-in"];
    const upc = reward.units_per_coin;
    if (upc && c.current_value != null && oldVal != null && c.current_value > oldVal) {
      const gained = Math.floor(c.current_value / upc) - Math.floor(oldVal / upc);
      if (gained > 0) { coins += gained; parts.push(`ทุก ${upc} หน่วย`); }
    }
    awardCoins(coins, `${parts.join(" + ")} · ${goal.title}`);
    burst(coins, parts.join(" + "));
    toast.success("บันทึกความคืบหน้าแล้ว");
  }

  function changeStatus(s: GoalStatus) {
    const wasAchieved = goal.status === "achieved";
    setGoal((prev) => (prev ? { ...prev, status: s } : prev));
    setStatusOpen(false);
    toast.success(`เปลี่ยนสถานะเป็น "${STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s}"`);
    if (s === "achieved" && !wasAchieved && (reward.on_achieve ?? 0) > 0) {
      awardCoins(reward.on_achieve!, `เป้าสำเร็จ · ${goal.title}`);
      burst(reward.on_achieve!, "เป้าสำเร็จ! 🎉");
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
      {fx}
      <div className="flex items-center justify-between gap-2 mb-3">
        <Link href="/goals" className="text-sm text-slate-500 hover:text-violet-600 inline-flex items-center gap-1">← กลับไปรายการเป้าหมาย</Link>
        <GameBar compact />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap justify-between gap-4">
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="font-mono text-xs text-slate-400">{goal.goal_no}</span>
              <GoalStatusBadge status={goal.status} />
              {goal.status === "active" && <GoalHealthBadge health={goal.health} />}
            </div>
            <h1 className="text-xl font-bold text-slate-900 leading-snug">{goal.title}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-2">
              <span>👤 เจ้าของ: {goal.owner}</span>
              <span>📅 เส้นตาย: {fmtDate(goal.target_date)}{goal.status === "active" && dl != null && dl >= 0 ? ` (เหลือ ${dl} วัน)` : ""}</span>
              <span>🏷️ {CATEGORY_LABEL[goal.category] ?? goal.category}{goal.department ? ` · ${goal.department}` : ""}</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ProgressRing pct={progress} />
            <span className="text-xs text-slate-400 mt-1">ความคืบหน้า</span>
          </div>
        </div>

        {/* Why */}
        {goal.why && (
          <div className="bg-slate-50 rounded-lg px-4 py-3 mt-4 text-sm text-slate-600">
            <span className="text-slate-900 font-medium">🎯 ทำไมต้องทำ:</span> {goal.why}
          </div>
        )}

        {/* ตัววัดผล */}
        {showMetric && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-500">ตัววัดผล{goal.measure_unit ? ` (${goal.measure_unit})` : ""}</span>
              <span><span className="font-semibold text-slate-900">{fmtNum(goal.current_value)}</span> <span className="text-slate-400">/ เป้า {fmtNum(goal.target_value)}</span></span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>เริ่ม {fmtNum(goal.start_value)}</span><span>เป้า {fmtNum(goal.target_value)}</span>
            </div>
          </div>
        )}

        {/* กฎการได้เหรียญ (เกม) */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="text-xs text-slate-400">ได้เหรียญเมื่อ:</span>
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">🪙 ก้าวละ +{reward.per_step}</span>
          {reward.units_per_coin != null && (
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">🪙 ทุก {reward.units_per_coin} {goal.measure_unit ?? "หน่วย"} = +1</span>
          )}
          <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-1">🏆 สำเร็จ +{reward.on_achieve}</span>
        </div>

        {/* เส้นทางสู่ความสำเร็จ */}
        <div className="border-t border-slate-100 mt-5 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900">🛤️ เส้นทางสู่ความสำเร็จ</h2>
            <span className="text-xs text-slate-400">แตะวงกลมเพื่อสลับเสร็จ/ยังไม่เสร็จ</span>
          </div>
          <GoalRoadmap
            steps={goal.steps as RoadmapStep[]}
            editable
            onToggleStep={toggleStep}
            onAddStep={() => toast.success("เฟส 2: เพิ่มขั้นบันไดจะบันทึกลงฐานข้อมูลจริง")}
            onCreateTask={(s) => toast.success(`เฟส 3: จะสร้างงาน "${s.title}" ใน Task Manager แล้วผูกกลับมา`)}
          />
        </div>

        {/* ปุ่ม */}
        <div className="border-t border-slate-100 mt-5 pt-4 flex flex-wrap gap-2">
          <button onClick={() => setCheckinOpen(true)} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">
            🚩 อัปเดตความคืบหน้า
          </button>
          <button onClick={() => setStatusOpen(true)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
            ↻ เปลี่ยนสถานะ
          </button>
          <button onClick={() => toast.success("เฟส 2: แก้ไขเป้าหมายผ่านฟอร์มกลาง")} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
            ✎ แก้ไข
          </button>
        </div>

        {/* ประวัติ check-in */}
        <div className="border-t border-slate-100 mt-5 pt-4">
          <h2 className="text-base font-semibold text-slate-900 mb-3">📈 ประวัติอัปเดตความคืบหน้า</h2>
          {goal.checkins.length === 0 ? (
            <p className="text-sm text-slate-400">ยังไม่มีการอัปเดต — กด “อัปเดตความคืบหน้า” เพื่อบันทึกครั้งแรก</p>
          ) : (
            <div className="space-y-3">
              {goal.checkins.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${HEALTH_META[c.health].dot}`} />
                  <div className="flex-1">
                    <div className="text-sm">
                      <span className="font-medium text-slate-900">{c.author}</span>
                      <span className="text-slate-400"> · {fmtDate(c.checkin_date)} · </span>
                      <span className={HEALTH_META[c.health].cls.split(" ").find((x) => x.startsWith("text-"))}>{HEALTH_META[c.health].label}</span>
                      {c.current_value != null && <span className="text-slate-400"> · {fmtNum(c.current_value)}{goal.measure_unit ?? ""}</span>}
                    </div>
                    <div className="text-sm text-slate-600 mt-0.5">{c.note}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CheckinModal open={checkinOpen} onClose={() => setCheckinOpen(false)} goal={goal} author={myName} onSave={addCheckin} />
      <StatusModal open={statusOpen} onClose={() => setStatusOpen(false)} current={goal.status} onPick={changeStatus} />
    </div>
  );
}

// ---- Check-in modal ----
function CheckinModal({ open, onClose, goal, author, onSave }: {
  open: boolean; onClose: () => void; goal: Goal; author: string; onSave: (c: GoalCheckin) => void;
}) {
  const [health, setHealth] = useState<GoalHealth>(goal.health);
  const [note, setNote] = useState("");
  const [current, setCurrent] = useState("");
  const showValue = goal.measure_type !== "boolean";

  function submit() {
    onSave({
      id: `c-${Date.now()}`,
      author,
      checkin_date: "2026-07-01",
      health,
      current_value: current.trim() === "" ? undefined : Number(current),
      note: note.trim() || "(ไม่มีโน้ต)",
    });
    setNote(""); setCurrent("");
  }

  return (
    <ERPModal
      open={open} onClose={onClose} title="อัปเดตความคืบหน้า (Check-in)" size="md"
      hasUnsavedChanges={note.trim() !== "" || current.trim() !== ""}
      footer={
        <>
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={submit} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">สุขภาพเป้าหมายตอนนี้</label>
          <SearchableSelect value={health} options={HEALTH_OPTIONS} onChange={(v) => setHealth(v as GoalHealth)} />
        </div>
        {showValue && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              ค่าปัจจุบัน{goal.measure_unit ? ` (${goal.measure_unit})` : ""} — เป้า {goal.target_value?.toLocaleString("th-TH")}
            </label>
            <input type="number" value={current} onChange={(e) => setCurrent(e.target.value)}
              placeholder={String(goal.current_value ?? "")}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">โน้ต / สิ่งที่ติดขัด</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="เช่น ซัพพลายเออร์ส่งช้า อาจเลื่อน 1 สัปดาห์..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
        </div>
      </div>
    </ERPModal>
  );
}

// ---- Status change modal ----
function StatusModal({ open, onClose, current, onPick }: {
  open: boolean; onClose: () => void; current: GoalStatus; onPick: (s: GoalStatus) => void;
}) {
  return (
    <ERPModal open={open} onClose={onClose} title="เปลี่ยนสถานะเป้าหมาย" size="sm">
      <div className="grid grid-cols-2 gap-2">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            disabled={o.value === current}
            onClick={() => onPick(o.value)}
            className={`h-11 text-sm font-medium border rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${o.cls}`}
          >
            {o.label}{o.value === current ? " (ปัจจุบัน)" : ""}
          </button>
        ))}
      </div>
    </ERPModal>
  );
}
