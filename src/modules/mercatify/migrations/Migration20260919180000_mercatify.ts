import { Migration } from '@mikro-orm/migrations';

export class Migration20260919180000_mercatify extends Migration {

  override name = 'Migration20260919180000';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_cases" add "created_by_user_id" uuid null, add "submitted_at" timestamptz null;`);
    this.addSql(`create index "mercatify_interview_cases_org_tenant_owner_idx" on "mercatify_interview_cases" ("organization_id", "tenant_id", "created_by_user_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "mercatify_interview_cases_org_tenant_owner_idx";`);
    this.addSql(`alter table "mercatify_interview_cases" drop column "created_by_user_id", drop column "submitted_at";`);
  }

}
