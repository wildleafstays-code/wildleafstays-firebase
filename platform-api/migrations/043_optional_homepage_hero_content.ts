import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table homepage_hero_slides
      drop constraint if exists homepage_hero_slides_headline_check
  `.execute(db);

  await sql`
    alter table homepage_hero_slides
      add constraint homepage_hero_slides_headline_check
      check (char_length(btrim(headline)) <= 160)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table homepage_hero_slides
      drop constraint if exists homepage_hero_slides_headline_check
  `.execute(db);

  await sql`
    alter table homepage_hero_slides
      add constraint homepage_hero_slides_headline_check
      check (char_length(btrim(headline)) between 1 and 160)
  `.execute(db);
}
