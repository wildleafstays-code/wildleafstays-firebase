import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table homepage_hero_slides
      add column placement text not null default 'HOME'
      check (placement in ('HOME', 'ENTIRE_PROPERTY'))
  `.execute(db);

  await sql`
    create index homepage_hero_slides_placement_public_idx
      on homepage_hero_slides (
        placement,
        status,
        enabled,
        sort_order,
        starts_at,
        ends_at
      )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists homepage_hero_slides_placement_public_idx`.execute(db);
  await sql`
    alter table homepage_hero_slides
      drop column if exists placement
  `.execute(db);
}
