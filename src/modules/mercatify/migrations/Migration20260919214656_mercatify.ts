import { Migration } from '@mikro-orm/migrations';

export class Migration20260919214656_mercatify extends Migration {

  override name = 'Migration20260919214656';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_cases" add "lab_handoff_status" text null, add "lab_handoff_document" text null, add "lab_handoff_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_cases" drop column "lab_handoff_status", drop column "lab_handoff_document", drop column "lab_handoff_at";`);
  }

}
