import { describe, expect, it } from "vitest";
import { ACTION_GROUPS, actionGroupFilter, auditActionGroup, auditVerb, describeAudit, fmtAuditValue } from "@/lib/audit-format";
import { AUDIT_MODULES, auditModuleOf, moduleFilterMatches, moduleFilterOr } from "@/lib/audit-entities";
import { auditDiff, auditRecordLabel } from "@/lib/audit";
import { redactAuditMetadata } from "@/lib/audit-view-server";

/** entity_type ทั้งหมดที่มีใน audit_logs จริง ณ 2026-11-06 */
const REAL_TYPES = "creative_campaign,file,platform_email,erp_playground_stock_movement,creative_task,skus_v2,parent_skus_v2,purchase_requests_v2,design_sheet,mo,brand,supplier_items,asset,bom_labor_rate,marketing_skus,bom,mo_material,bom_piecework,erp_playground_so,marketing_work_jobs,product_highlight_items,mo_work_order,payroll_periods,attendance_import_batches,creative_content,purchase_orders_v2,store_listing,parent_sku,marketing_sku_variant_off,payroll_adjustments,carton_labels,sku,shop_field_map,china_bills,qc_warehouse_items,wo_submissions,erp_role_permission,employees,color_dictionary,creative_subtask,erp_playground_quote,subscriptions,manufacturing_orders,overtime_entries,product_materials,creative_option,product_families,attendance_entries,leave_entries,creative_trend,record_task,creative_template,subscription_invoices,subtask_type,shop_home_layout,shop_theme,erp_playground_billing_note,payroll_runs,design_price_items,platform_listing_draft,partners_v2,erp_playground_product,employee_recurring_pay_items,payment_batches,erp_modules,content_album,creative_knowledge,erp_playground_delivery_note,mo_plan_ot,erp_workflow_state,marketing_sku_badge_map,email_report,department,platform_account,employee_contracts,creative_board,china_transfers,ui_config,platform_catalog,user,platform_order_item,platform_category_mapping,sku_price,user_profile,payment_batch_lines,loan_contracts,erp_table_layout,product_fit_items,erp_menu_items,store_image_sets,product_family_groups,so_order,marketing_sku_labels,mo_material_line,purchase_vouchers_v2,store_page,subscription_invoice_skips,employee_portal_requests,creative_board_item,marketing_work_job_item,departments,pattern_tickets,ctw_bills,app_settings,collections,record_file,caption_prompt,design_sheet_comment,mo_group,pattern_ticket_types,taobao_products,mo_piecework,platform_credential,daily_rates,book_library,erp_playground_credit_note,attribute_definition,belt_logo,brand_subtask_prompt,loan_payments,employee_bank_accounts,design_sheet_summary,employee_payroll_settings,work_board,brand_theme,erp_saved_view,content_refresh_rules,storefront_video,user_profiles,belt_hole,purchase_delivery_bills,erp_playground_pr,subscription_streaming_services,china_balance,goods_receipts_v2,caption_templates,app_api,shop_site_info,subscription_chrome_profiles,belt_template,paid_service_settings,piecework_from_po,erp_nesting_jobs,creative_brand_platforms,product_spec,design_sheet_detail,asset_usages,belt_tails,ai_product_rule,loan_contract_fees,store_orders,store_new_drop,creative_hashtag,erp_playground_warehouse,material_groups,asset_collection,attribute_option,product_sku,store_customer,china_app_settings,defect_log,payroll_period_holidays,platform_field_mapping,erp_doc_stamps,purchase_order_captures,mo_dispatch_plan,marketing_content_plan_settings,loan_schedule_versions,line_config,material_slot,mo_delivery_plan,erp_report_template,platform_email_settings,creative_status,sku_swatches,book_stores,stock_locations,belt_size_cal,assets,size_template,platform_credentials,canvas_sketch,platform_category_options,erp_notification_rule,companies,erp_role_permissions,employee_warnings,freight_carriers,belt_loops,website_saved_theme,banks,stock_sync_channels,manufacturing_order,test_upload,test2,test3,marketing_imports,shop_settings,shop_shipping,product_costing,belt_width_size,payroll_employee,purchasing_enrich,creative_task_template,od_facilities,erp_role,loan_drawdowns,gmail_connections,sync_jobs,goals,platform_orders,design_sheet_line_inbox,discord_link,design_price_item,platform_import_profile,email_contact,marketplace_sku_mappings,creative_project,erp_app_groups,payroll_pnd3_recurring_items,r2_canvassketch,erp_lookup,configurator_models,report_layout_defaults,shop,payroll_holidays,erp_module_field,erp_module_fields,loan_charge_types,variant_preset,special_descriptions,erp_notifications,bom_headers,store_listings,partner,erp_playground_sales_orders,offer_sheets,store_product_groups,store_site_images".split(",");

describe("audit-entities — โมดูล", () => {
  it("ตัวกรองโมดูลฝั่ง API ให้ผลตรงกับป้ายโมดูลทุกชนิดที่มีจริง", () => {
    for (const t of REAL_TYPES) {
      const m = auditModuleOf(t);
      for (const mod of AUDIT_MODULES) expect([t, mod.key, moduleFilterMatches(mod.key, t)]).toEqual([t, mod.key, mod.key === m]);
    }
  });
  it("จัดโมดูลหลัก ๆ ถูก", () => {
    expect(auditModuleOf("purchase_requests_v2")).toBe("purchasing");
    expect(auditModuleOf("payroll_adjustments")).toBe("hr");
    expect(auditModuleOf("employee_bank_accounts")).toBe("hr");
    expect(auditModuleOf("marketing_skus")).toBe("marketing");
    expect(auditModuleOf("mo_material")).toBe("production");
    expect(auditModuleOf("erp_playground_billing_note")).toBe("sales");
    expect(auditModuleOf("brand_subtask_prompt")).toBe("creative");
    expect(auditModuleOf("test2")).toBe("files");
  });
  it("สร้างเงื่อนไข .or() ได้ทุกโมดูล (regex ครอบเครื่องหมายคำพูด)", () => {
    for (const m of AUDIT_MODULES) expect(moduleFilterOr(m.key)).toMatch(/^(entity_type\.in\.\(.+\),)?and\(/);
    expect(moduleFilterOr("files")).toContain('entity_type.match."(^file$|^assets?$|^asset_|record_file|test_upload|^test\\\\d*$)"');
  });
});

describe("audit-format — กลุ่มการกระทำ", () => {
  it("จัดกลุ่มตามลำดับ (ลบ > พิมพ์ > สถานะ > เพิ่ม > แก้ไข)", () => {
    expect(auditActionGroup("create")).toBe("create");
    expect(auditActionGroup("attachment:remove")).toBe("delete");
    expect(auditActionGroup("detach")).toBe("delete");
    expect(auditActionGroup("print_payslips")).toBe("output");
    expect(auditActionGroup("status:approved→done")).toBe("status");
    expect(auditActionGroup("subtask:approve")).toBe("status");
    expect(auditActionGroup("description_image_add")).toBe("create");
    expect(auditActionGroup("master.bulk_update")).toBe("update");
    expect(auditActionGroup("transfer")).toBe("update");
  });
  it("ตัวกรองกลุ่มฝั่ง API ไม่มี _ หรือ % (ตัวพิเศษของ LIKE)", () => {
    for (const g of ACTION_GROUPS) {
      const f = actionGroupFilter(g.key);
      expect(`${f.or ?? ""}${f.not.join("")}`).not.toMatch(/[_%]/);
    }
    expect(actionGroupFilter("update").or).toBeNull();
    expect(actionGroupFilter("delete").not).toEqual([]);
  });
  it("คำกริยาภาษาไทย", () => {
    expect(auditVerb("create")).toBe("เพิ่ม");
    expect(auditVerb("subtask:approve")).toBe("อนุมัติงานย่อย");
    expect(auditVerb("mo.increase_qty")).toBe("เพิ่มจำนวนใบสั่งผลิต");
    expect(auditVerb("weird_new_action")).toBe("weird new action");
  });
});

describe("audit-format — อ่าน metadata ทุกแบบ", () => {
  const row = (action: string, metadata: Record<string, unknown>, entity_type = "skus_v2") => ({ action, entity_type, entity_id: "02dcca48-3a02-4fa2-a34c-745e9b08cb44", metadata });

  it("ใบขอซื้อที่เพิ่ม: บอกเลขเอกสาร + ชื่อรายการ", () => {
    const v = describeAudit(row("create", { actor: "ลำปาง", pr_no: "PR-2026-00872", item_name: "[ZH-M-NO.5-N] หัวซิปฟันเหล็ก#5" }, "purchase_requests_v2"));
    expect(v.recordCode).toBe("PR-2026-00872");
    expect(v.recordName).toContain("หัวซิปฟันเหล็ก");
    expect(v.page).toBe("ใบขอซื้อ");
    expect(v.moduleLabel).toBe("จัดซื้อ");
    expect(v.group).toBe("create");
  });
  it("changes แบบรายการ {field,label,old,new}", () => {
    const v = describeAudit(row("update", { changes: [{ field: "sales_credit_term", label: "เครดิตลูกค้า", old: "days:45", new: "days:30" }] }));
    expect(v.changes).toEqual([{ field: "sales_credit_term", label: "เครดิตลูกค้า", hasOld: true, old: "days:45", new: "days:30" }]);
  });
  it("changes แบบก้อน {field:{from,to}} และค่าใหม่อย่างเดียว", () => {
    const v = describeAudit(row("update", { changes: { enabled: { from: false, to: true }, label_id: "c617267a-5a77-42a2-8bea-0336e58f1824" } }));
    expect(v.changes[0]).toMatchObject({ field: "enabled", hasOld: true, old: "ไม่ใช่", new: "ใช่" });
    expect(v.changes[1]).toMatchObject({ field: "label_id", hasOld: false, new: "รหัส …1824" });
  });
  it("before/after", () => {
    const v = describeAudit(row("update", { before: { name: "ก", list_price: 590, updated_at: "x" }, after: { name: "ก", list_price: 650, updated_at: "y" } }));
    expect(v.changes.map((c) => [c.field, c.old, c.new])).toEqual([["list_price", "590", "650"]]);
  });
  it("สถานะ: status_from/to และ action status:a→b", () => {
    expect(describeAudit(row("subtask:status", { status_from: "todo", status_to: "in_progress", changes: ["status", "config"] }, "creative_task")).changes[0])
      .toMatchObject({ field: "status", hasOld: true });
    const v = describeAudit(row("status:approved→done", { changes: ["status", "progress_percent"] }, "creative_task"));
    expect(v.changes[0].field).toBe("status");
    expect(v.fieldsOnly).toEqual(["ความคืบหน้า (%)"]);
  });
  it("รู้แค่ชื่อช่อง (changed_fields) → fieldsOnly", () => {
    const v = describeAudit(row("update", { entity: "parent-skus", changed_fields: ["name_th", "description"] }, "parent_skus_v2"), { fieldLabels: { description: "คำอธิบายสินค้า" } });
    expect(v.changes).toEqual([]);
    expect(v.fieldsOnly).toEqual(["ชื่อ (ไทย)", "คำอธิบายสินค้า"]);
  });
  it("from/to ใบงาน + รายละเอียดอื่น", () => {
    const v = describeAudit(row("pattern.cancel", { from: "new", to: "cancelled", note: "เปิดผิด", ticket_no: "PT-202611-0002" }, "pattern_tickets"));
    expect(v.changes[0]).toMatchObject({ field: "status", hasOld: true });
    expect(v.recordCode).toBe("PT-202611-0002");
    expect(v.extras).toEqual([{ label: "หมายเหตุ", value: "เปิดผิด" }]);
  });
  it("ซ่อนค่าตามสิทธิ์: ไม่มีค่าในผลลัพธ์", () => {
    const v = describeAudit(row("update", { changes: [{ field: "list_price", old: 590, new: 650 }], amount: 9000 }), { hiddenFields: new Set(["list_price", "amount"]) });
    expect(v.changes[0]).toEqual({ field: "list_price", label: "ราคาขาย", hasOld: true, hidden: true });
    expect(v.extras).toEqual([{ label: "ยอดเงิน", value: "", hidden: true }]);
  });
  it("บันทึกอัตโนมัติ = noise", () => {
    expect(describeAudit(row("canvas_update", { rev: 3 }, "creative_campaign")).noise).toBe(true);
    expect(describeAudit(row("upload", { size: 1 }, "file")).noise).toBe(true);
    expect(describeAudit(row("import", { actor: "สคริปต์ Gmail" }, "platform_email")).noise).toBe(true);
    expect(describeAudit(row("upload", { size: 1 }, "asset")).noise).toBe(false);
  });
  it("แสดงค่า: ว่าง/ตัวเลข/HTML/ค่ายาวที่ตัดไว้", () => {
    expect(fmtAuditValue(null)).toBe("ว่าง");
    expect(fmtAuditValue(1234.5)).toBe("1,234.5");
    expect(fmtAuditValue("<p>สวัสดี&nbsp;<b>ครับ</b></p>")).toBe("สวัสดี ครับ");
    expect(fmtAuditValue({ preview: "abc…" })).toBe("abc…");
    expect(fmtAuditValue("todo", "status")).toBe("ยังไม่เริ่ม");
    expect(fmtAuditValue("draft", "status")).toBe("ร่าง");          // จากทะเบียนสถานะกลาง
    expect(fmtAuditValue("weird_code", "status")).toBe("weird_code");
    expect(auditModuleOf("paid_service_settings")).toBe("settings");
  });
});

describe("lib/audit — auditDiff (ขั้น 2: จดค่าเดิม→ใหม่)", () => {
  it("จดเฉพาะช่องที่เปลี่ยนจริง (590 กับ \"590\" = เท่ากัน) และข้ามช่องระบบ", () => {
    const d = auditDiff({ name: "A", list_price: 590, note: null, updated_at: "1" }, { name: "B", list_price: "590", note: "", updated_at: "2" });
    expect(d).toEqual([{ field: "name", old: "A", new: "B" }]);
  });
  it("ไม่มีค่าเดิม = old เป็น null · ค่ายาวถูกตัด · ค่าความลับไม่จดค่า", () => {
    const long = "x".repeat(500);
    const d = auditDiff({}, { description: long, sval: { token: "abc" } }, { secret: ["sval"] });
    expect(d[0].old).toBeNull();
    expect(String(d[0].new).length).toBe(300);
    expect(d[1]).toEqual({ field: "sval", old: "(ค่าความลับ)", new: "(ค่าความลับ)" });
  });
  it("auditRecordLabel หยิบรหัส + ชื่อ", () => {
    expect(auditRecordLabel({ code: "TTM133", name_th: "กระเป๋า", list_price: 1 })).toEqual({ code: "TTM133", name: "กระเป๋า" });
    expect(auditRecordLabel(null)).toEqual({});
  });
});

describe("audit-view-server — ตัดค่าที่ซ่อนออกจาก metadata", () => {
  it("ตัดทั้งบนสุด / changes / before-after", () => {
    const m = { amount: 5, note: "ok", changes: [{ field: "amount", old: 1, new: 2 }, { field: "note", old: "a", new: "b" }], before: { amount: 1 }, after: { amount: 2 } };
    const r = redactAuditMetadata(m, new Set(["amount"]));
    expect(JSON.stringify(r)).not.toMatch(/"amount":\s*\d/);
    expect(r.note).toBe("ok");
    expect((r.changes as unknown[])[1]).toEqual({ field: "note", old: "a", new: "b" });
  });
});
