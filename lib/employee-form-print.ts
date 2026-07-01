// ใบกรอกประวัติพนักงาน (Employee Information Form) — ฟอร์มเปล่า A4 พิมพ์/บันทึก PDF
// 3 ภาษา: ไทย / English / พม่า — ทุกป้ายมีภาษาอังกฤษกำกับเสมอ (ยกเว้นโหมด en ที่เป็นอังกฤษล้วน)
// ⚠️ คำแปลพม่าเป็นค่าตั้งต้น ควรให้พนักงานพม่าช่วยตรวจสำนวนอีกครั้ง
// โครงตามดีไซน์ที่เจ้าของเลือก: ข้อมูลส่วนตัว / ผู้ติดต่อฉุกเฉิน / บัญชีธนาคาร / เอกสารแนบ / ข้อมูลเพิ่มเติม / คำรับรอง
// (ตัดออกตามที่สั่ง: ที่อยู่ตามทะเบียนบ้าน, ประวัติการศึกษา, ประวัติการทำงาน, ข้อมูลสำหรับงาน)

export type EmployeeFormLang = "th" | "en" | "my";
// รายการทักษะที่ตั้งค่าได้ (3 ภาษา) — มาจาก erp_lookups type=employee_skill
export type SkillOption = { th: string; en: string; my: string };

type L = { th: string; en: string; my: string };

const COMPANY_NAME = "หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)";

const TITLE: L = { th: "แบบฟอร์มประวัติพนักงาน", en: "Employee Information Form", my: "ဝန်ထမ်း အချက်အလက် ပုံစံ" };
const TITLE_SUB = "EMPLOYEE INFORMATION FORM";
const PHOTO: L = { th: "ติดรูปถ่าย 1 นิ้ว", en: "Attach 1-inch photo", my: "၁ လက်မ ဓာတ်ပုံ ကပ်ပါ" };

// ช่องสำหรับบริษัทกรอก (มุมขวาบน)
const CORP: L[] = [
  { th: "รหัสพนักงาน (สำหรับบริษัท)", en: "Employee ID (office use)", my: "ဝန်ထမ်း ID (ရုံးသုံး)" },
  { th: "วันที่กรอกข้อมูล", en: "Date filled", my: "ဖြည့်သည့်ရက်" },
  { th: "ตำแหน่งที่สมัคร", en: "Position applied", my: "လျှောက်ထားသည့်ရာထူး" },
];

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ป้าย: โหมด en = อังกฤษล้วน · โหมดอื่น = "ภาษาหลัก / English"
function lab(l: L, lang: EmployeeFormLang): string {
  if (lang === "en") return esc(l.en);
  const primary = lang === "my" ? l.my : l.th;
  return primary === l.en ? esc(l.en) : `${esc(primary)} <span class="en">/ ${esc(l.en)}</span>`;
}

// ป้ายแบบสั้น (สำหรับ checkbox/หัวตาราง) — โครงเดียวกับ lab()
const opt = lab;

// ---- ตัวช่วยสร้าง cell ----
type Cell = { label?: L; grow?: number; basis?: string };

// ช่องเขียน (มีเส้นใต้)
function tcell(label: L, lang: EmployeeFormLang, basis = "42mm", grow = 1): string {
  return `<div class="cell" style="flex:${grow} 1 ${basis};min-width:${basis}"><span class="lab">${lab(label, lang)}</span></div>`;
}
// ช่องเขียนเต็มแถว
function fcell(label: L, lang: EmployeeFormLang): string {
  return `<div class="cell" style="flex:1 1 100%"><span class="lab">${lab(label, lang)}</span></div>`;
}
// ช่อง checkbox (ไม่มีเส้นใต้) + ตัวเลือก + ตัวเลือก "อื่นๆ (___)"
function ccell(label: L | null, opts: L[], lang: EmployeeFormLang, o: { other?: L; grow?: number; basis?: string } = {}): string {
  const grow = o.grow ?? 1, basis = o.basis ?? "60mm";
  const boxes = opts.map((x) => `<span class="cb">&#9744; ${opt(x, lang)}</span>`).join("");
  const other = o.other ? `<span class="cb">&#9744; ${opt(o.other, lang)} <span class="tail"></span></span>` : "";
  const head = label ? `<span class="lab">${lab(label, lang)}</span>` : "";
  return `<div class="cell nb" style="flex:${grow} 1 ${basis};min-width:${basis}">${head}<span class="checks">${boxes}${other}</span></div>`;
}
// ช่องกล่องตัวเลข (เลขบัตร/เลขบัญชี) จัดกลุ่มด้วยขีด
function dcell(label: L, groups: number[], lang: EmployeeFormLang, basis = "85mm", grow = 2): string {
  const g = groups
    .map((n) => `<span class="dgrp">${'<span class="dbox"></span>'.repeat(n)}</span>`)
    .join('<span class="dsep">-</span>');
  return `<div class="cell nb" style="flex:${grow} 1 ${basis};min-width:${basis}"><span class="lab">${lab(label, lang)}</span><span class="digits">${g}</span></div>`;
}
function frow(cells: string[]): string {
  return `<div class="fields">${cells.join("")}</div>`;
}
function subhead(label: L, lang: EmployeeFormLang): string {
  return `<div class="subhead">${lab(label, lang)}</div>`;
}
function secHead(n: number, title: L, lang: EmployeeFormLang, note?: L): string {
  const noteHtml = note ? ` <span class="snote">${lab(note, lang)}</span>` : "";
  return `<div class="sec"><span class="num">${n}</span><span>${lab(title, lang)}${noteHtml}</span></div>`;
}

// ---- เนื้อหาแต่ละหมวด ----
function personalSection(lang: EmployeeFormLang): string {
  const T = (th: string, en: string, my: string): L => ({ th, en, my });
  const cn = "ข้อมูลส่วนตัว";
  const rows = [
    frow([ccell(T("คำนำหน้า", "Title", "အမည်ရှေ့ဆက်"), [
      T("นาย", "Mr.", "ဦး"), T("นาง", "Mrs.", "ဒေါ်"), T("นางสาว", "Ms.", "မ"),
    ], lang, { other: T("อื่นๆ", "Other", "အခြား"), grow: 1, basis: "100%" })]),
    frow([
      tcell(T("ชื่อ-นามสกุล (ไทย)", "Full name (Thai)", "အမည် (ထိုင်း)"), lang, "95mm", 3),
      tcell(T("ชื่อเล่น", "Nickname", "နာမည်ပြောင်"), lang, "32mm", 1),
    ]),
    frow([fcell(T("ชื่อ-นามสกุล (อังกฤษ)", "Full name (English)", "အမည် (အင်္ဂလိပ်)"), lang)]),
    frow([
      ccell(T("เพศ", "Gender", "ကျား/မ"), [
        T("ชาย", "Male", "ကျား"), T("หญิง", "Female", "မ"), T("ไม่ระบุ", "N/A", "မဖော်ပြ"),
      ], lang, { grow: 1, basis: "52mm" }),
      tcell(T("วัน/เดือน/ปีเกิด", "Date of birth", "မွေးသက္ကရာဇ်"), lang, "38mm", 1),
      tcell(T("อายุ (ปี)", "Age (yrs)", "အသက်"), lang, "24mm", 1),
    ]),
    frow([
      tcell(T("สัญชาติ", "Nationality", "နိုင်ငံသား"), lang, "36mm", 1),
      tcell(T("ศาสนา", "Religion", "ဘာသာ"), lang, "36mm", 1),
      ccell(T("สถานภาพ", "Marital status", "အိမ်ထောင်ရေး"), [
        T("โสด", "Single", "လူပျို"), T("สมรส", "Married", "အိမ်ထောင်ရှိ"),
        T("หย่า", "Divorced", "ကွာရှင်း"), T("หม้าย", "Widowed", "မုဆိုးမ/ဖို"),
      ], lang, { grow: 2, basis: "72mm" }),
    ]),
    frow([dcell(T("เลขบัตรประชาชน", "National ID no.", "မှတ်ပုံတင်အမှတ်"), [1, 4, 5, 2, 1], lang, "88mm", 2)]),
    frow([
      tcell(T("เลขที่เอกสารอื่นๆ (พาสปอร์ต/ใบต่างด้าว)", "Other doc no. (passport/work permit)", "အခြားစာရွက်အမှတ်"), lang, "60mm", 2),
      tcell(T("ออกให้โดย", "Issued by", "ထုတ်ပေးသူ"), lang, "36mm", 1),
      tcell(T("วันหมดอายุ", "Expiry date", "သက်တမ်းကုန်ရက်"), lang, "32mm", 1),
    ]),
    frow([
      tcell(T("กรุ๊ปเลือด", "Blood type", "သွေးအုပ်စု"), lang, "26mm", 1),
      tcell(T("ส่วนสูง (ซม.)", "Height (cm)", "အရပ် (စမ)"), lang, "28mm", 1),
      tcell(T("น้ำหนัก (กก.)", "Weight (kg)", "ကိုယ်အလေးချိန် (ကီလို)"), lang, "28mm", 1),
      tcell(T("โรคประจำตัว (ถ้ามี)", "Chronic illness (if any)", "နာတာရှည်ရောဂါ"), lang, "48mm", 2),
    ]),
    frow([
      tcell(T("แพ้ยา (ถ้ามี)", "Drug allergy (if any)", "ဆေးမတည့်မှု"), lang, "58mm", 1),
      tcell(T("แพ้อาหาร (ถ้ามี)", "Food allergy (if any)", "အစားအစာမတည့်မှု"), lang, "58mm", 1),
    ]),
    subhead(T("ที่อยู่ปัจจุบัน (ที่ติดต่อได้)", "Current address (contactable)", "လက်ရှိနေရပ်လိပ်စာ"), lang),
    frow([
      tcell(T("บ้านเลขที่", "House no.", "အိမ်အမှတ်"), lang, "28mm", 1),
      tcell(T("หมู่", "Village", "အုပ်စု"), lang, "20mm", 1),
      tcell(T("ซอย", "Soi", "လမ်းသွယ်"), lang, "34mm", 1),
      tcell(T("ถนน", "Road", "လမ်း"), lang, "40mm", 1),
    ]),
    frow([
      tcell(T("ตำบล/แขวง", "Sub-district", "ကျေးရွာ/ရပ်ကွက်"), lang, "40mm", 1),
      tcell(T("อำเภอ/เขต", "District", "မြို့နယ်"), lang, "40mm", 1),
      tcell(T("จังหวัด", "Province", "ခရိုင်/ပြည်နယ်"), lang, "40mm", 1),
      tcell(T("รหัสไปรษณีย์", "Postal code", "စာတိုက်သင်္ကေတ"), lang, "28mm", 1),
    ]),
    frow([
      tcell(T("เบอร์โทรศัพท์", "Telephone", "ဖုန်းနံပါတ်"), lang, "38mm", 1),
      tcell(T("มือถือ", "Mobile", "မိုဘိုင်း"), lang, "38mm", 1),
      tcell(T("E-mail", "E-mail", "အီးမေးလ်"), lang, "52mm", 2),
    ]),
    frow([
      tcell(T("Line ID", "Line ID", "Line ID"), lang, "44mm", 1),
      tcell(T("Facebook (ถ้ามี)", "Facebook (if any)", "Facebook"), lang, "56mm", 2),
    ]),
  ].join("");
  return secHead(1, { th: cn, en: "Personal information", my: "ကိုယ်ရေးအချက်အလက်" }, lang) + rows;
}

function emergencySection(n: number, lang: EmployeeFormLang): string {
  const T = (th: string, en: string, my: string): L => ({ th, en, my });
  const head = secHead(n, { th: "ผู้ติดต่อกรณีฉุกเฉิน", en: "Emergency contact", my: "အရေးပေါ်ဆက်သွယ်ရန်" }, lang,
    { th: "(อย่างน้อย 1 ท่าน)", en: "(at least 1)", my: "(အနည်းဆုံး ၁ ဦး)" });
  const cols = [
    T("ลำดับ", "No.", "စဉ်"), T("ชื่อ-นามสกุล", "Full name", "အမည်"),
    T("ความสัมพันธ์", "Relationship", "တော်စပ်ပုံ"), T("เบอร์โทรศัพท์", "Phone", "ဖုန်း"),
  ];
  const th = `<tr>${cols.map((c, i) => `<th${i === 0 ? ' class="ord"' : ""}>${lab(c, lang)}</th>`).join("")}</tr>`;
  const body = [1, 2].map((i) => `<tr><td class="ord">${i}</td><td></td><td></td><td></td></tr>`).join("");
  return head + `<table class="tbl">${th}${body}</table>`;
}

function bankSection(n: number, lang: EmployeeFormLang): string {
  const T = (th: string, en: string, my: string): L => ({ th, en, my });
  const head = secHead(n, { th: "ข้อมูลบัญชีธนาคาร", en: "Bank account", my: "ဘဏ်အကောင့်" }, lang,
    { th: "(สำหรับรับเงินเดือน)", en: "(for salary)", my: "(လစာအတွက်)" });
  const rows = [
    frow([
      tcell(T("ชื่อธนาคาร", "Bank name", "ဘဏ်အမည်"), lang, "55mm", 2),
      tcell(T("สาขา", "Branch", "ဘဏ်ခွဲ"), lang, "40mm", 1),
    ]),
    frow([
      dcell(T("เลขที่บัญชี", "Account no.", "အကောင့်နံပါတ်"), [10], lang, "72mm", 2),
      tcell(T("ชื่อบัญชี", "Account name", "အကောင့်အမည်"), lang, "55mm", 2),
    ]),
    frow([ccell(null, [T("แนบสำเนาหน้าสมุดบัญชีแล้ว", "Bank book copy attached", "ဘဏ်စာအုပ်မိတ္တူ ပူးတွဲပြီး")], lang, { grow: 1, basis: "100%" })]),
  ].join("");
  return head + rows;
}

// ความสามารถพิเศษ / ทักษะ — รายการ checkbox ที่ตั้งค่าได้ (เก็บใน erp_lookups type=employee_skill)
// skills = รายการที่ตั้งค่าไว้; ถ้าไม่มี → เว้นช่องว่างให้เขียนเอง
function skillsSection(n: number, lang: EmployeeFormLang, skills: SkillOption[]): string {
  const T = (th: string, en: string, my: string): L => ({ th, en, my });
  const head = secHead(n, { th: "ความสามารถพิเศษ / ทักษะ", en: "Special skills", my: "အထူးကျွမ်းကျင်မှု" }, lang,
    { th: "(ติ๊กที่มี)", en: "(tick those you have)", my: "(ရှိသည်များ အမှန်ခြစ်ပါ)" });
  if (!skills.length) {
    const blank = [frow([fcell(T("ระบุความสามารถพิเศษ / ทักษะ", "Specify skills", "ကျွမ်းကျင်မှု ဖော်ပြပါ"), lang)]),
      frow([fcell({ th: "", en: "", my: "" }, lang)])].join("");
    return head + blank;
  }
  const grid = skills
    .map((s) => `<span class="cb">&#9744; ${lab({ th: s.th, en: s.en || s.th, my: s.my || s.th }, lang)}</span>`).join("")
    + `<span class="cb">&#9744; ${lab(T("อื่นๆ", "Other", "အခြား"), lang)} <span class="tail" style="width:40mm"></span></span>`;
  return head + `<div class="checklist skills">${grid}</div>`;
}

function declarationSection(n: number, lang: EmployeeFormLang): string {
  const decl: L = {
    th: "ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นเป็นความจริงทุกประการ หากบริษัทตรวจสอบพบว่าข้อมูลไม่เป็นความจริง บริษัทมีสิทธิพิจารณาเลิกจ้างได้ทันที",
    en: "I certify that all information above is true and correct. Should the company find any false information, it reserves the right to terminate employment immediately.",
    my: "အထက်ဖော်ပြပါ အချက်အလက်အားလုံး မှန်ကန်ကြောင်း ကျွန်ုပ်အာမခံပါသည်။ ကုမ္ပဏီမှ မမှန်ကန်သော အချက်အလက် တွေ့ရှိပါက ချက်ချင်း အလုပ်မှ ထုတ်ပယ်ပိုင်ခွင့်ရှိသည်။",
  };
  const head = secHead(n, { th: "คำรับรอง", en: "Declaration", my: "အာမခံချက်" }, lang);
  let body: string;
  if (lang === "en") body = esc(decl.en);
  else body = `${esc(lang === "my" ? decl.my : decl.th)}<br><span class="en">${esc(decl.en)}</span>`;
  const sign = `<div class="sign">
    <div class="col"><div class="sline">${lab({ th: "ลงชื่อผู้กรอกข้อมูล", en: "Applicant signature", my: "ဖြည့်သွင်းသူ လက်မှတ်" }, lang)}</div></div>
    <div class="col"><div class="sline">${lab({ th: "วันที่", en: "Date", my: "ရက်စွဲ" }, lang)}</div></div>
  </div>`;
  return head + `<div class="decl">${body}</div>${sign}`;
}

export function buildEmployeeFormHtml(lang: EmployeeFormLang = "th", skills: SkillOption[] = []): string {
  const corpHtml = CORP.map((c) => `<div class="cr"><span class="cl">${lab(c, lang)}</span><span class="cv"></span></div>`).join("");
  const body = [
    personalSection(lang),
    emergencySection(2, lang),
    bankSection(3, lang),
    skillsSection(4, lang, skills),
    declarationSection(5, lang),
  ].join("");

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&family=Noto+Sans+Myanmar:wght@400;600&display=swap');
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f1f1; color: #111; font-family: "Sarabun", "Noto Sans Myanmar", Tahoma, "Myanmar Text", Arial, sans-serif; font-size: 10px; line-height: 1.15; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 7mm 9mm; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.18); }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; border-bottom: 1.2px solid #1f4e79; padding-bottom: 3px; margin-bottom: 3px; }
    .photo { width: 21mm; height: 25mm; border: 0.6px solid #b3b3b3; border-radius: 2px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7.5px; color: #777; flex: none; padding: 2px; line-height: 1.25; }
    .title-wrap { flex: 1; text-align: center; padding-top: 0.5mm; }
    .form-title { font-size: 17px; font-weight: 700; color: #1f2937; }
    .form-sub { font-size: 8.5px; color: #6b7280; letter-spacing: 1px; margin-top: 1px; }
    .company { font-size: 9px; color: #374151; margin-top: 1px; }
    .corp { width: 62mm; flex: none; font-size: 8px; }
    .corp .cr { display: flex; align-items: flex-end; gap: 4px; margin-bottom: 2px; }
    .corp .cr .cl { color: #444; flex: none; max-width: 30mm; line-height: 1.1; }
    .corp .cr .cv { flex: 1; border-bottom: 0.6px solid #888; min-height: 11px; }
    .sec { display: flex; align-items: center; gap: 6px; margin: 4px 0 2px; font-weight: 600; font-size: 11.5px; background: #eef2f7; border-left: 2px solid #1f4e79; padding: 2px 6px; break-inside: avoid; }
    .sec .num { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: #1f4e79; color: #fff; font-size: 9.5px; font-weight: 700; flex: none; }
    .sec .snote { font-weight: 400; font-size: 9px; color: #6b7280; }
    .sec .en, .lab .en, .cb .en, .decl .en, .corp .en { font-weight: 400; color: #6b7280; }
    .subhead { font-size: 9px; font-weight: 600; color: #1f4e79; margin: 1px 0 0; }
    .fields { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 14px; margin-bottom: 0; break-inside: avoid; }
    .cell { border-bottom: 0.6px solid #888; min-height: 6.8mm; padding-top: 0; }
    .cell.nb { border-bottom: none; min-height: auto; padding-bottom: 1px; }
    .lab { display: block; font-size: 8px; color: #444; line-height: 1.1; }
    .checks { display: flex; flex-wrap: wrap; gap: 2px 12px; margin-top: 1px; }
    .cb { white-space: nowrap; font-size: 9px; line-height: 1.25; }
    .tail { display: inline-block; width: 26mm; border-bottom: 0.6px solid #888; vertical-align: bottom; }
    .digits { display: flex; align-items: center; gap: 4px; margin-top: 1px; }
    .dgrp { display: flex; gap: 2px; }
    .dbox { width: 4.6mm; height: 5.2mm; border: 0.6px solid #777; border-radius: 1px; display: inline-block; }
    .dsep { color: #777; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 1px; break-inside: avoid; }
    .tbl th, .tbl td { border: 0.6px solid #999; padding: 2px 5px; }
    .tbl th { background: #eef2f7; font-weight: 600; text-align: left; }
    .tbl td { height: 6.5mm; }
    .tbl .ord { width: 12mm; text-align: center; }
    .checklist { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; font-size: 9px; padding: 1px 0; break-inside: avoid; }
    .checklist.skills { grid-template-columns: repeat(3, 1fr); gap: 3px 14px; }
    .checklist.skills .cb { white-space: normal; }
    .decl { font-size: 9px; line-height: 1.3; margin: 1px 0 0; break-inside: avoid; }
    .sign { display: flex; gap: 20mm; margin-top: 4mm; padding: 0 6mm; break-inside: avoid; }
    .sign .col { flex: 1; text-align: center; }
    .sign .sline { border-top: 0.6px solid #888; padding-top: 3px; font-size: 9.5px; color: #333; }
    @media print { body { background: #fff; } .page { box-shadow: none; margin: 0; min-height: 0; padding: 5mm 9mm; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <main class="page">
    <div class="head">
      <div class="photo">${lab(PHOTO, lang)}</div>
      <div class="title-wrap">
        <div class="form-title">${lab(TITLE, lang)}</div>
        <div class="form-sub">(${TITLE_SUB})</div>
        <div class="company">${esc(COMPANY_NAME)}</div>
      </div>
      <div class="corp">${corpHtml}</div>
    </div>
    ${body}
  </main>
</body>
</html>`;
}
