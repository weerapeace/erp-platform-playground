-- แคมเปญ: เพิ่มช่องรายละเอียดแบบ HTML (จัดรูปแบบได้) สำหรับ CampaignDrawer โหมดแก้ไข
alter table erp_creative_campaigns add column if not exists detail_html text;
