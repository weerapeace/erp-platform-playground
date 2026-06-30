// ใบกรอกประวัติพนักงาน (Employee Information Form) — ฟอร์มเปล่า A4 พิมพ์/บันทึก PDF
// 3 ภาษา: ไทย / English / พม่า — ทุกป้ายมีภาษาอังกฤษกำกับเสมอ (ยกเว้นโหมด en ที่เป็นอังกฤษล้วน)
// ⚠️ คำแปลพม่าเป็นค่าตั้งต้น ควรให้พนักงานพม่าช่วยตรวจสำนวนอีกครั้ง

export type EmployeeFormLang = "th" | "en" | "my";

type L = { th: string; en: string; my: string };

const COMPANY_NAME = "หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)";
const COMPANY_ADDRESS = "41/243, 41/244 ถนนกัลปพฤกษ์ แขวงบางแค เขตบางแค กรุงเทพฯ 10160";

const TITLE: L = { th: "ใบกรอกประวัติพนักงาน", en: "Employee Information Form", my: "ဝန်ထမ်း အချက်အလက် ပုံစံ" };
const PHOTO: L = { th: "ติดรูปถ่าย", en: "Photo", my: "ဓာတ်ပုံ" };

type Field = { label: L; grow?: number };
type Section = { title: L; fields?: Field[]; full?: Field[] };

const SECTIONS: Section[] = [
  {
    title: { th: "ข้อมูลส่วนตัว", en: "Personal information", my: "ကိုယ်ရေးအချက်အလက်" },
    fields: [
      { label: { th: "ชื่อ-นามสกุล (ไทย)", en: "Full name (Thai)", my: "အမည် (ထိုင်း)" }, grow: 2 },
      { label: { th: "ชื่อ-นามสกุล (อังกฤษ)", en: "Full name (English)", my: "အမည် (အင်္ဂလိပ်)" }, grow: 2 },
      { label: { th: "ชื่อเล่น", en: "Nickname", my: "အလွယ်ခေါ်အမည်" }, grow: 1 },
      { label: { th: "เลขบัตรประชาชน / พาสปอร์ต", en: "ID / Passport no.", my: "မှတ်ပုံတင် / ပတ်စ်ပို့နံပါတ်" }, grow: 2 },
      { label: { th: "วัน/เดือน/ปีเกิด", en: "Date of birth", my: "မွေးနေ့" }, grow: 1 },
      { label: { th: "อายุ", en: "Age", my: "အသက်" }, grow: 1 },
      { label: { th: "เพศ", en: "Gender", my: "ကျား/မ" }, grow: 1 },
      { label: { th: "สัญชาติ", en: "Nationality", my: "နိုင်ငံသား" }, grow: 1 },
      { label: { th: "ศาสนา", en: "Religion", my: "ဘာသာ" }, grow: 1 },
      { label: { th: "หมู่เลือด", en: "Blood type", my: "သွေးအုပ်စု" }, grow: 1 },
    ],
  },
  {
    title: { th: "ข้อมูลการจ้างงาน", en: "Employment", my: "အလုပ်အကိုင်အချက်အလက်" },
    fields: [
      { label: { th: "ตำแหน่ง", en: "Position", my: "ရာထူး" }, grow: 1 },
      { label: { th: "แผนก", en: "Department", my: "ဌာန" }, grow: 1 },
      { label: { th: "วันเริ่มงาน", en: "Start date", my: "အလုပ်စတင်သည့်ရက်" }, grow: 1 },
    ],
  },
  {
    title: { th: "ที่อยู่ และการติดต่อ", en: "Address & contact", my: "နေရပ်လိပ်စာ နှင့် ဆက်သွယ်ရန်" },
    full: [{ label: { th: "ที่อยู่ปัจจุบัน", en: "Current address", my: "လက်ရှိနေရပ်လိပ်စာ" } }],
    fields: [
      { label: { th: "เบอร์โทรศัพท์", en: "Phone", my: "ဖုန်းနံပါတ်" }, grow: 1 },
      { label: { th: "LINE ID", en: "LINE ID", my: "LINE ID" }, grow: 1 },
      { label: { th: "อีเมล", en: "Email", my: "အီးမေးလ်" }, grow: 1 },
    ],
  },
  {
    title: { th: "ผู้ติดต่อกรณีฉุกเฉิน", en: "Emergency contact", my: "အရေးပေါ်ဆက်သွယ်ရန်" },
    fields: [
      { label: { th: "ชื่อ-นามสกุล", en: "Full name", my: "အမည်" }, grow: 2 },
      { label: { th: "ความสัมพันธ์", en: "Relationship", my: "တော်စပ်ပုံ" }, grow: 1 },
      { label: { th: "เบอร์โทร", en: "Phone", my: "ဖုန်းနံပါတ်" }, grow: 1 },
    ],
  },
  {
    title: { th: "บัญชีรับเงินเดือน", en: "Salary bank account", my: "လစာလက်ခံဘဏ်အကောင့်" },
    fields: [
      { label: { th: "ธนาคาร", en: "Bank", my: "ဘဏ်" }, grow: 1 },
      { label: { th: "เลขที่บัญชี", en: "Account no.", my: "အကောင့်နံပါတ်" }, grow: 1 },
      { label: { th: "ชื่อบัญชี", en: "Account name", my: "အကောင့်အမည်" }, grow: 1 },
    ],
  },
  {
    title: { th: "ครอบครัว / ลดหย่อนภาษี", en: "Family / tax allowance", my: "မိသားစု / အခွန်လျှော့ပေါ့" },
    fields: [
      { label: { th: "สถานภาพสมรส", en: "Marital status", my: "အိမ်ထောင်ရေးအခြေအနေ" }, grow: 1 },
      { label: { th: "ชื่อคู่สมรส", en: "Spouse name", my: "အိမ်ထောင်ဖက်အမည်" }, grow: 1 },
      { label: { th: "จำนวนบุตร", en: "No. of children", my: "သားသမီးအရေအတွက်" }, grow: 1 },
    ],
  },
];

const ATTACHMENTS: L[] = [
  { th: "สำเนาบัตรประชาชน / พาสปอร์ต", en: "Copy of ID / passport", my: "မှတ်ပုံတင် / ပတ်စ်ပို့မိတ္တူ" },
  { th: "สำเนาทะเบียนบ้าน", en: "Copy of house registration", my: "အိမ်ထောင်စုစာရင်းမိတ္တူ" },
  { th: "สำเนาสมุดบัญชีธนาคาร", en: "Copy of bank book", my: "ဘဏ်စာအုပ်မိတ္တူ" },
  { th: "วุฒิการศึกษา", en: "Education certificate", my: "ပညာအရည်အချင်းလက်မှတ်" },
  { th: "รูปถ่าย", en: "Photo", my: "ဓာတ်ပုံ" },
];

const ATTACH_TITLE: L = { th: "เอกสารแนบ", en: "Attachments", my: "ပူးတွဲစာရွက်စာတမ်း" };
const SIGN_EMP: L = { th: "ลงชื่อพนักงาน / วันที่", en: "Employee signature / date", my: "ဝန်ထမ်းလက်မှတ် / ရက်စွဲ" };
const SIGN_HR: L = { th: "ลงชื่อเจ้าหน้าที่ HR / วันที่", en: "HR signature / date", my: "HR ဝန်ထမ်းလက်မှတ် / ရက်စွဲ" };

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ป้าย: โหมด en = อังกฤษล้วน · โหมดอื่น = "ภาษาหลัก / English"
function lab(l: L, lang: EmployeeFormLang): string {
  if (lang === "en") return esc(l.en);
  const primary = lang === "my" ? l.my : l.th;
  return primary === l.en ? esc(l.en) : `${esc(primary)} <span class="en">/ ${esc(l.en)}</span>`;
}

function cell(f: Field, lang: EmployeeFormLang): string {
  // ความกว้างขั้นต่ำตามขนาดช่อง → ตัดขึ้นบรรทัดใหม่อัตโนมัติ (~3-4 ช่อง/แถว) ไม่แน่นเกินไป
  const grow = f.grow ?? 1;
  const basis = grow >= 2 ? "58mm" : "40mm";
  return `<div class="cell" style="flex:${grow} 1 ${basis}; min-width:${basis}"><div class="lab">${lab(f.label, lang)}</div></div>`;
}

export function buildEmployeeFormHtml(lang: EmployeeFormLang = "th"): string {
  const sectionsHtml = SECTIONS.map((s, i) => {
    const fullHtml = (s.full ?? []).map((f) => `<div class="row"><div class="cell" style="flex:1"><div class="lab">${lab(f.label, lang)}</div></div></div>`).join("");
    const fieldsHtml = (s.fields ?? []).length
      ? `<div class="fields">${(s.fields ?? []).map((f) => cell(f, lang)).join("")}</div>`
      : "";
    return `<div class="sec"><span class="num">${i + 1}</span>${lab(s.title, lang)}</div>${fullHtml}${fieldsHtml}`;
  }).join("");

  const attachHtml = ATTACHMENTS.map((a) => `<span class="chk">&#9744; ${lab(a, lang)}</span>`).join("");

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&family=Noto+Sans+Myanmar:wght@400;600&display=swap');
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #000; font-family: "Sarabun", "Noto Sans Myanmar", Tahoma, "Myanmar Text", Arial, sans-serif; font-size: 11px; }
    .page { width: 210mm; min-height: 297mm; padding: 12mm 12mm 10mm; margin: 0 auto; background: #fff; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
    .company { font-size: 14px; font-weight: 600; }
    .company-sub { font-size: 9px; color: #333; margin-top: 1px; }
    .form-title { font-size: 17px; font-weight: 600; margin-top: 4px; }
    .photo { width: 26mm; height: 32mm; border: 1px dashed #888; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 9px; color: #777; }
    .sec { display: flex; align-items: center; gap: 6px; margin: 11px 0 7px; font-weight: 600; font-size: 12px; }
    .sec .num { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: #1f4e79; color: #fff; font-size: 10px; font-weight: 600; flex: none; }
    .sec .en, .lab .en { font-weight: 400; color: #666; }
    .row { display: flex; gap: 14px; margin-bottom: 4px; }
    .fields { display: flex; flex-wrap: wrap; gap: 13px 16px; margin-bottom: 4px; }
    .cell { border-bottom: 1px solid #000; min-height: 11mm; padding-top: 2px; }
    .lab { font-size: 9.5px; color: #444; line-height: 1.25; min-height: 22px; }
    .attach { display: flex; flex-wrap: wrap; gap: 5px 16px; font-size: 10px; }
    .chk { white-space: nowrap; }
    .sign { display: flex; gap: 22mm; margin-top: 10mm; padding: 0 8mm; }
    .sign .col { flex: 1; text-align: center; padding-top: 14mm; }
    .sign .sline { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; color: #333; }
    @media print { .page { box-shadow: none; margin: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <div class="head">
      <div>
        <div class="company">${esc(COMPANY_NAME)}</div>
        <div class="company-sub">${esc(COMPANY_ADDRESS)}</div>
        <div class="form-title">${lab(TITLE, lang)}</div>
      </div>
      <div class="photo">${lab(PHOTO, lang)}<br>1-2"</div>
    </div>
    ${sectionsHtml}
    <div class="sec"><span class="num">${SECTIONS.length + 1}</span>${lab(ATTACH_TITLE, lang)}</div>
    <div class="attach">${attachHtml}</div>
    <div class="sign">
      <div class="col"><div class="sline">${lab(SIGN_EMP, lang)}</div></div>
      <div class="col"><div class="sline">${lab(SIGN_HR, lang)}</div></div>
    </div>
  </main>
</body>
</html>`;
}
