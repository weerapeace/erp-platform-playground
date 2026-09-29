export type ResignationAction = "approve" | "reject" | "cancel";
/** ย้อนการอนุมัติ (อนุมัติผิดคน / พนักงานเปลี่ยนใจ) — แยกจาก action ปกติ เพราะใช้กับคำขอที่ "อนุมัติแล้ว" */
export type ResignationPageAction = ResignationAction | "revert";

export type ResignationTransitionCopy = {
  title: string;
  confirmText: string;
  successMessage: string;
  description: string;
  impactItems: string[];
  destructive: boolean;
};

export function getResignationTransitionCopy(action: ResignationPageAction): ResignationTransitionCopy {
  if (action === "revert") {
    return {
      title: "ย้อนการอนุมัติลาออก",
      confirmText: "ย้อนการอนุมัติ",
      successMessage: "ย้อนการอนุมัติแล้ว — พนักงานกลับมาเป็นสถานะทำงาน",
      description: "ใช้เมื่ออนุมัติผิดคน หรือพนักงานเปลี่ยนใจไม่ลาออก",
      impactItems: [
        "เปลี่ยนสถานะพนักงานกลับเป็นทำงาน และล้างวันลาออก",
        "เปิดสัญญาจ้างที่ถูกปิดตอนอนุมัติ กลับมาใช้ต่อ",
        "บัญชีเข้าระบบของพนักงานไม่ถูกเปิดคืนอัตโนมัติ — แอดมินต้องเปิดเองที่หน้าผู้ใช้",
        "คำขอนี้จะถูกปิดเป็นยกเลิก และบันทึกประวัติไว้ใน audit log",
      ],
      destructive: true,
    };
  }

  if (action === "approve") {
    return {
      title: "อนุมัติการลาออก",
      confirmText: "อนุมัติ",
      successMessage: "อนุมัติแจ้งลาออกแล้ว",
      description: "หลังยืนยัน ระบบจะอัปเดตข้อมูลพนักงานจริงทันที",
      impactItems: [
        "เปลี่ยนสถานะพนักงานเป็นลาออก",
        "ปิดสัญญาจ้างปัจจุบันด้วยวันทำงานวันสุดท้าย",
        "บันทึกประวัติการดำเนินการไว้ใน audit log",
      ],
      destructive: false,
    };
  }

  if (action === "reject") {
    return {
      title: "ปฏิเสธคำขอแจ้งลาออก",
      confirmText: "ปฏิเสธ",
      successMessage: "ปฏิเสธคำขอแจ้งลาออกแล้ว",
      description: "คำขอจะถูกปิดเป็นปฏิเสธ แต่ข้อมูลพนักงานยังเหมือนเดิม",
      impactItems: [
        "ไม่เปลี่ยนสถานะพนักงานหรือสัญญาจ้าง",
        "เก็บเหตุผล/หมายเหตุ HR ไว้กับคำขอ",
        "บันทึกประวัติการดำเนินการไว้ใน audit log",
      ],
      destructive: true,
    };
  }

  return {
    title: "ยกเลิกคำขอแจ้งลาออก",
    confirmText: "ยกเลิกคำขอ",
    successMessage: "ยกเลิกคำขอแจ้งลาออกแล้ว",
    description: "ใช้กรณีสร้างคำขอผิดหรือไม่ต้องการดำเนินการต่อ",
    impactItems: [
      "ไม่เปลี่ยนสถานะพนักงานหรือสัญญาจ้าง",
      "คำขอจะถูกปิดเป็นยกเลิก",
      "บันทึกประวัติการดำเนินการไว้ใน audit log",
    ],
    destructive: true,
  };
}
