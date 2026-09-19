import { Migration } from '@mikro-orm/migrations';

export class Migration20260919184316_mercatify extends Migration {

  override name = 'Migration20260919184316';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_cases" add "handoff_document" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_cases" drop column "handoff_document";`);
  }

}
