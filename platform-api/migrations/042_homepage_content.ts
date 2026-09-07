import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table homepage_hero_slides (
      id uuid primary key default gen_random_uuid(),
      headline text not null
        check (char_length(btrim(headline)) between 1 and 160),
      subtitle text
        check (subtitle is null or char_length(subtitle) <= 300),
      offer_label text
        check (offer_label is null or char_length(offer_label) <= 80),
      cta_label text
        check (cta_label is null or char_length(cta_label) <= 60),
      cta_href text
        check (cta_href is null or char_length(cta_href) <= 500),
      storage_provider text not null check (
        storage_provider in ('FIREBASE', 'GCS', 'OTHER')
      ),
      storage_key text not null,
      mime_type text,
      alt_text text
        check (alt_text is null or char_length(alt_text) <= 500),
      focal_x_percent integer not null default 50
        check (focal_x_percent between 0 and 100),
      focal_y_percent integer not null default 50
        check (focal_y_percent between 0 and 100),
      sort_order integer not null default 0 check (sort_order >= 0),
      enabled boolean not null default false,
      starts_at timestamptz,
      ends_at timestamptz,
      status text not null default 'ACTIVE'
        check (status in ('ACTIVE', 'ARCHIVED')),
      version integer not null default 1 check (version > 0),
      created_by_user_id uuid not null references users(id) on delete restrict,
      updated_by_user_id uuid not null references users(id) on delete restrict,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (storage_provider, storage_key),
      check (
        (cta_label is null and cta_href is null)
        or
        (cta_label is not null and cta_href is not null)
      ),
      check (
        starts_at is null
        or ends_at is null
        or ends_at > starts_at
      )
    )
  `.execute(db);

  await sql`
    create index homepage_hero_slides_public_idx
      on homepage_hero_slides (
        status,
        enabled,
        sort_order,
        starts_at,
        ends_at
      )
  `.execute(db);

  await sql`
    create table homepage_destination_images (
      id uuid primary key default gen_random_uuid(),
      city text not null
        check (char_length(btrim(city)) between 1 and 150),
      state_region text
        check (state_region is null or char_length(state_region) <= 150),
      country_code char(2) not null
        check (country_code ~ '^[A-Z]{2}$'),
      storage_provider text not null check (
        storage_provider in ('FIREBASE', 'GCS', 'OTHER')
      ),
      storage_key text not null,
      mime_type text,
      alt_text text
        check (alt_text is null or char_length(alt_text) <= 500),
      sort_order integer not null default 0 check (sort_order >= 0),
      enabled boolean not null default true,
      status text not null default 'ACTIVE'
        check (status in ('ACTIVE', 'ARCHIVED')),
      version integer not null default 1 check (version > 0),
      created_by_user_id uuid not null references users(id) on delete restrict,
      updated_by_user_id uuid not null references users(id) on delete restrict,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (storage_provider, storage_key)
    )
  `.execute(db);

  await sql`
    create unique index homepage_destination_images_identity_unique
      on homepage_destination_images (
        lower(btrim(city)),
        lower(btrim(coalesce(state_region, ''))),
        country_code
      )
      where status = 'ACTIVE'
  `.execute(db);

  await sql`
    create index homepage_destination_images_public_idx
      on homepage_destination_images (status, enabled, sort_order, city)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists homepage_destination_images`.execute(db);
  await sql`drop table if exists homepage_hero_slides`.execute(db);
}
