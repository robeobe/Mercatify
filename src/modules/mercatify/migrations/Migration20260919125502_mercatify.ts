import { Migration } from '@mikro-orm/migrations';

export class Migration20260919125502_mercatify extends Migration {

  override name = 'Migration20260919125502';

  override up(): void | Promise<void> {
    this.addSql(`create table "mercatify_interview_cases" ("id" uuid not null default gen_random_uuid(), "title" text not null, "status" text not null default 'draft', "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "mercatify_interview_cases_org_tenant_idx" on "mercatify_interview_cases" ("organization_id", "tenant_id");`);
  }

}
