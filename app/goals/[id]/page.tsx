"use client";

// หน้ารายละเอียดเป้าหมาย (เฟส 2a) — ดึง/บันทึกผ่าน /api/goals จริง
// พระเอก: "เส้นทางสู่ความสำเร็จ" (GoalRoadmap) + ลูกเล่นเกม (เหรียญเด้ง) ยังใช้ player-store (localStorage) รอเฟส 2b
import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ERPModal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { GoalRoadmap, type RoadmapStep } from "@/components/goal-roadmap";
import {
  goalProgress, daysLeft, CATEGORY_LABEL, HEALTH_META, DEFAULT_REWARD,
  type Goal, type GoalHealth, type GoalStatus, type GoalPlan,
} from "../mock-data";
import { fetchGoal, updateStep, addCheckin, updateGoal, addExercise, addProgress } from "../api";
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
function monthYear(iso?: string): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  return y && m ? `${TH_MONTH[m - 1]} ${y}` : iso;
}

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
  const { can } = useAuth();
  const canEdit = can("goals.edit");

  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const { fx, burst } = useCoinFx();

  const load = useCallback(() => {
    setLoading(true);
    fetchGoal(id)
      .then((g) => { setGoal(g); setLoadError(null); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const progress = useMemo(() => (goal ? goalProgress(goal) : 0), [goal]);
  const reward = useMemo(
    () => ({ ...DEFAULT_REWARD, ...((goal?.reward as { per_step?: number; on_achieve?: number; units_per_coin?: number }) ?? {}) }),
    [goal],
  );

  if (loading) return <Center>กำลังโหลดเป้าหมาย…</Center>;
  if (loadError) return (
    <Center>
      <p className="text-slate-500 mb-3">{loadError}</p>
      <button onClick={load} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg">ลองใหม่</button>
    </Center>
  );
  if (!goal) return (
    <Center>
      <p className="text-slate-500 mb-3">ไม่พบเป้าหมายนี้</p>
      <Link href="/goals" className="text-violet-600 hover:underline">← กลับไปหน้ารายการ</Link>
    </Center>
  );

  const g = goal; // non-null alias
  const dl = daysLeft(g.target_date);
  const showMetric = g.measure_type !== "boolean" && g.target_value != null;
  const plan = (g.plan ?? {}) as GoalPlan;
  const isFinancial = plan.kind === "house" || plan.kind === "lump" || plan.kind === "dividend";

  async function toggleStep(stepId: string) {
    const step = g.steps.find((s) => s.id === stepId);
    if (!step) return;
    const becameDone = step.status !== "done";
    try {
      const updated = await updateStep(g.id, stepId, { status: becameDone ? "done" : "in_progress" });
      setGoal(updated);
      if (becameDone && (reward.per_step ?? 0) > 0) {
        awardCoins(reward.per_step!, `ทำขั้นบันไดเสร็จ · ${g.title}`);
        burst(reward.per_step!, "ทำขั้นเสร็จ");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปเดตขั้นบันไดไม่สำเร็จ");
    }
  }

  async function handleCheckin(input: { health: GoalHealth; current_value?: number; note: string }) {
    const oldVal = g.current_value;
    try {
      const updated = await addCheckin(g.id, { health: input.health, current_value: input.current_value ?? null, note: input.note });
      setGoal(updated);
      setCheckinOpen(false);
      let coins = 3;
      const parts = ["check-in"];
      const upc = reward.units_per_coin;
      if (upc && input.current_value != null && oldVal != null && input.current_value > oldVal) {
        const gained = Math.floor(input.current_value / upc) - Math.floor(oldVal / upc);
        if (gained > 0) { coins += gained; parts.push(`ทุก ${upc} หน่วย`); }
      }
      awardCoins(coins, `${parts.join(" + ")} · ${g.title}`);
      burst(coins, parts.join(" + "));
      toast.success("บันทึกความคืบหน้าแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function handleWorkout(input: { activity_type: string; title: string; quantity: number; unit: string }) {
    const oldVal = g.current_value ?? g.start_value ?? 0;
    try {
      const updated = await addExercise(g.id, input);
      setGoal(updated);
      setWorkoutOpen(false);
      let coins = 2;
      const parts = [input.title];
      const upc = reward.units_per_coin;
      const newVal = updated.current_value ?? oldVal;
      if (upc && newVal > oldVal) {
        const gained = Math.floor(newVal / upc) - Math.floor(oldVal / upc);
        if (gained > 0) { coins += gained; parts.push(`ทุก ${upc} หน่วย`); }
      }
      awardCoins(coins, `ออกกำลังกาย: ${input.title} · ${g.title}`);
      burst(coins, `${input.title} +${input.quantity}${input.unit ? " " + input.unit : ""}`);
      toast.success("บันทึกออกกำลังกายแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function handleDeposit(amount: number) {
    const oldVal = g.current_value ?? g.start_value ?? 0;
    try {
      const updated = await addProgress(g.id, amount, `💰 ฝากเงิน ${amount.toLocaleString("th-TH")} บาท`);
      setGoal(updated);
      setDepositOpen(false);
      let coins = 3;
      const upc = reward.units_per_coin;
      const newVal = updated.current_value ?? oldVal;
      if (upc && newVal > oldVal) {
        const gained = Math.floor(newVal / upc) - Math.floor(oldVal / upc);
        if (gained > 0) coins += gained;
      }
      awardCoins(coins, `ฝากเงิน · ${g.title}`);
      burst(coins, `ฝากเงิน +${amount.toLocaleString("th-TH")}`);
      toast.success("บันทึกเงินเก็บแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function changeStatus(sVal: GoalStatus) {
    const wasAchieved = g.status === "achieved";
    try {
      const updated = await updateGoal(g.id, { status: sVal });
      setGoal(updated);
      setStatusOpen(false);
      toast.success(`เปลี่ยนสถานะเป็น "${STATUS_OPTIONS.find((o) => o.value === sVal)?.label ?? sVal}"`);
      if (sVal === "achieved" && !wasAchieved && (reward.on_achieve ?? 0) > 0) {
        awardCoins(reward.on_achieve!, `เป้าสำเร็จ · ${g.title}`);
        burst(reward.on_achieve!, "เป้าสำเร็จ! 🎉");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ");
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
              <span className="font-mono text-xs text-slate-400">{g.goal_no}</span>
              <GoalStatusBadge status={g.status} />
              {g.status === "active" && <GoalHealthBadge health={g.health} />}
            </div>
            <h1 className="text-xl font-bold text-slate-900 leading-snug">{g.title}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-2">
              <span>👤 เจ้าของ: {g.owner || "—"}</span>
              <span>📅 เส้นตาย: {fmtDate(g.target_date)}{g.status === "active" && dl != null && dl >= 0 ? ` (เหลือ ${dl} วัน)` : ""}</span>
              <span>🏷️ {CATEGORY_LABEL[g.category] ?? g.category}{g.department ? ` · ${g.department}` : ""}</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ProgressRing pct={progress} />
            <span className="text-xs text-slate-400 mt-1">ความคืบหน้า</span>
          </div>
        </div>

        {/* Why */}
        {g.why && (
          <div className="bg-slate-50 rounded-lg px-4 py-3 mt-4 text-sm text-slate-600">
            <span className="text-slate-900 font-medium">🎯 ทำไมต้องทำ:</span> {g.why}
          </div>
        )}

        {/* ตัววัดผล */}
        {showMetric && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-500">ตัววัดผล{g.measure_unit ? ` (${g.measure_unit})` : ""}</span>
              <span><span className="font-semibold text-slate-900">{fmtNum(g.current_value)}</span> <span className="text-slate-400">/ เป้า {fmtNum(g.target_value)}</span></span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>เริ่ม {fmtNum(g.start_value)}</span><span>เป้า {fmtNum(g.target_value)}</span>
            </div>
          </div>
        )}

        {/* แผนเก็บเงิน (เป้าการเงิน) */}
        {isFinancial && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 mt-4 text-sm text-teal-900">
            <div className="font-medium mb-1">💰 แผนเก็บเงิน</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-teal-800">
              {plan.monthly ? <span>เก็บเดือนละ ~{fmtNum(plan.monthly)} บาท</span> : null}
              {plan.months ? <span>ใช้เวลา ~{plan.months} เดือน</span> : null}
              {plan.finish_date ? <span>ถึงเป้า ~{monthYear(plan.finish_date)}</span> : null}
              {(plan.kind === "house" || plan.kind === "dividend") && plan.mortgage_monthly ? <span>🏦 ผ่อนบ้าน ~{fmtNum(plan.mortgage_monthly)}/เดือน</span> : null}
              {plan.kind === "dividend" && plan.dividend_rate ? <span>📈 ปันผล {plan.dividend_rate}%/ปี → เงินก้อน {fmtNum(plan.required_deposit)}</span> : null}
            </div>
          </div>
        )}

        {/* กฎการได้เหรียญ (เกม) */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="text-xs text-slate-400">ได้เหรียญเมื่อ:</span>
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">🪙 ก้าวละ +{reward.per_step}</span>
          {reward.units_per_coin != null && (
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">🪙 ทุก {reward.units_per_coin} {g.measure_unit ?? "หน่วย"} = +1</span>
          )}
          <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-1">🏆 สำเร็จ +{reward.on_achieve}</span>
        </div>

        {/* เส้นทางสู่ความสำเร็จ */}
        <div className="border-t border-slate-100 mt-5 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900">🛤️ เส้นทางสู่ความสำเร็จ</h2>
            <span className="text-xs text-slate-400">แตะวงกลมเพื่อสลับเสร็จ/ยังไม่เสร็จ</span>
          </div>
          {g.steps.length === 0 ? (
            <p className="text-sm text-slate-400">ยังไม่มีขั้นบันได</p>
          ) : (
            <GoalRoadmap
              steps={g.steps as RoadmapStep[]}
              editable={canEdit}
              onToggleStep={toggleStep}
              onCreateTask={(st) => toast.success(`เฟส 3: จะสร้างงาน "${st.title}" ใน Task Manager แล้วผูกกลับมา`)}
            />
          )}
        </div>

        {/* ปุ่ม (เฉพาะผู้มีสิทธิ์แก้) */}
        {canEdit && (
          <div className="border-t border-slate-100 mt-5 pt-4 flex flex-wrap gap-2">
            {isFinancial && (
              <button onClick={() => setDepositOpen(true)} className="h-9 px-4 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700">
                💰 บันทึกเงินเก็บ
              </button>
            )}
            {g.category === "personal" && (
              <button onClick={() => setWorkoutOpen(true)} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                🏃 บันทึกออกกำลังกาย
              </button>
            )}
            <button onClick={() => setCheckinOpen(true)} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">
              🚩 อัปเดตความคืบหน้า
            </button>
            <button onClick={() => setStatusOpen(true)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
              ↻ เปลี่ยนสถานะ
            </button>
          </div>
        )}

        {/* ประวัติ check-in */}
        <div className="border-t border-slate-100 mt-5 pt-4">
          <h2 className="text-base font-semibold text-slate-900 mb-3">📈 ประวัติอัปเดตความคืบหน้า</h2>
          {g.checkins.length === 0 ? (
            <p className="text-sm text-slate-400">ยังไม่มีการอัปเดต — กด “อัปเดตความคืบหน้า” เพื่อบันทึกครั้งแรก</p>
          ) : (
            <div className="space-y-3">
              {g.checkins.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${HEALTH_META[c.health].dot}`} />
                  <div className="flex-1">
                    <div className="text-sm">
                      <span className="font-medium text-slate-900">{c.author}</span>
                      <span className="text-slate-400"> · {fmtDate(c.checkin_date)} · </span>
                      <span className={HEALTH_META[c.health].cls.split(" ").find((x) => x.startsWith("text-"))}>{HEALTH_META[c.health].label}</span>
                      {c.current_value != null && <span className="text-slate-400"> · {fmtNum(c.current_value)}{g.measure_unit ?? ""}</span>}
                    </div>
                    <div className="text-sm text-slate-600 mt-0.5">{c.note}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CheckinModal open={checkinOpen} onClose={() => setCheckinOpen(false)} goal={g} onSave={handleCheckin} />
      <StatusModal open={statusOpen} onClose={() => setStatusOpen(false)} current={g.status} onPick={changeStatus} />
      <WorkoutModal open={workoutOpen} onClose={() => setWorkoutOpen(false)} onSave={handleWorkout} />
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} onSave={handleDeposit} />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">{children}</div>;
}

// ---- Check-in modal ----
function CheckinModal({ open, onClose, goal, onSave }: {
  open: boolean; onClose: () => void; goal: Goal; onSave: (input: { health: GoalHealth; current_value?: number; note: string }) => void;
}) {
  const [health, setHealth] = useState<GoalHealth>(goal.health);
  const [note, setNote] = useState("");
  const [current, setCurrent] = useState("");
  const showValue = goal.measure_type !== "boolean";

  function submit() {
    onSave({
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
              ค่าปัจจุบัน{goal.measure_unit ? ` (${goal.measure_unit})` : ""}{goal.target_value != null ? ` — เป้า ${goal.target_value.toLocaleString("th-TH")}` : ""}
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

// ---- Workout log modal (ขั้น 1) ----
const WORKOUTS = [
  { value: "pushup", label: "วิดพื้น", unit: "ครั้ง", icon: "💪" },
  { value: "situp", label: "ซิทอัพ", unit: "ครั้ง", icon: "🤸" },
  { value: "run", label: "วิ่ง", unit: "กม.", icon: "🏃" },
  { value: "walk", label: "เดิน", unit: "นาที", icon: "🚶" },
  { value: "steps", label: "ก้าวเดิน", unit: "ก้าว", icon: "👣" },
  { value: "workout", label: "ออกกำลังกาย", unit: "นาที", icon: "🏋️" },
  { value: "custom", label: "อื่น ๆ", unit: "", icon: "➕" },
];

function WorkoutModal({ open, onClose, onSave }: {
  open: boolean; onClose: () => void; onSave: (input: { activity_type: string; title: string; quantity: number; unit: string }) => void;
}) {
  const [act, setAct] = useState("pushup");
  const [qty, setQty] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const preset = WORKOUTS.find((w) => w.value === act) ?? WORKOUTS[0];
  const isCustom = act === "custom";

  function submit() {
    const q = Number(qty);
    if (!q || q <= 0) return;
    const title = isCustom ? (customTitle.trim() || "กิจกรรม") : preset.label;
    const unit = isCustom ? customUnit.trim() : preset.unit;
    onSave({ activity_type: act, title, quantity: q, unit });
    setQty(""); setCustomTitle(""); setCustomUnit("");
  }

  return (
    <ERPModal open={open} onClose={onClose} title="🏃 บันทึกออกกำลังกาย" description="บันทึกแล้วบวกเข้าค่าเป้า + ได้เหรียญ" size="md"
      hasUnsavedChanges={qty.trim() !== ""}
      footer={
        <>
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={submit} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">ประเภท</label>
          <div className="flex flex-wrap gap-2">
            {WORKOUTS.map((w) => (
              <button key={w.value} onClick={() => setAct(w.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${act === w.value ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {w.icon} {w.label}
              </button>
            ))}
          </div>
        </div>

        {isCustom && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">ชื่อกิจกรรม</label>
              <input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="เช่น โยคะ"
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">หน่วย</label>
              <input value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="ครั้ง/นาที"
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            จำนวน{!isCustom && preset.unit ? ` (${preset.unit})` : ""}
          </label>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus placeholder="เช่น 20"
            className="w-full h-10 px-3 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>
    </ERPModal>
  );
}

// ---- Deposit modal (เป้าการเงิน) ----
function DepositModal({ open, onClose, onSave }: {
  open: boolean; onClose: () => void; onSave: (amount: number) => void;
}) {
  const [amt, setAmt] = useState("");
  const quick = [1000, 5000, 10000, 20000];
  function submit() { const a = Number(amt); if (!a || a <= 0) return; onSave(a); setAmt(""); }

  return (
    <ERPModal open={open} onClose={onClose} title="💰 บันทึกเงินเก็บ" description="ใส่จำนวนที่เก็บได้ → บวกเข้ายอด + ได้เหรียญ" size="sm"
      hasUnsavedChanges={amt.trim() !== ""}
      footer={
        <>
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={submit} className="h-9 px-4 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700">บันทึก</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">จำนวนเงิน (บาท)</label>
          <input type="number" autoFocus value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="เช่น 15000"
            className="w-full h-10 px-3 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {quick.map((q) => (
            <button key={q} onClick={() => setAmt(String(q))} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
              +{q.toLocaleString("th-TH")}
            </button>
          ))}
        </div>
      </div>
    </ERPModal>
  );
}
