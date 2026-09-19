import { Migration } from '@mikro-orm/migrations';

export class Migration20260919182225_mercatify extends Migration {

  override name = 'Migration20260919182225';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_cases" add "om_operating_cost" numeric(12,2) null, add "implementation_cost" numeric(12,2) null;`);

    this.addSql(`alter table "mercatify_mapping_rows" add "source" text not null default '';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_cases" drop column "om_operating_cost", drop column "implementation_cost";`);

    this.addSql(`alter table "mercatify_mapping_rows" drop column "source";`);
  }

}
