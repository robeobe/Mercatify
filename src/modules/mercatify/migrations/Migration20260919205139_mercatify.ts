import { Migration } from '@mikro-orm/migrations';

export class Migration20260919205139_mercatify extends Migration {

  override name = 'Migration20260919205139';

  override up(): void | Promise<void> {
    this.addSql(`create table "mercatify_case_reports" ("id" uuid not null default gen_random_uuid(), "case_id" uuid not null, "headline" text null, "notes" text null, "analyst" text null, "open_questions" text null, "hourly_rate" numeric(12,2) null, "implementation_months" int null, "build_estimates" jsonb not null, "sent_at" timestamptz null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "mercatify_case_reports_org_tenant_case_idx" on "mercatify_case_reports" ("organization_id", "tenant_id", "case_id");`);
  }

}
