import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table property_categories (
      id uuid primary key default gen_random_uuid(),
      code text not null,
      name text not null,
      homepage_heading text not null,
      sort_order integer not null default 0 check (sort_order >= 0),
      homepage_visible boolean not null default true,
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
      version integer not null default 1 check (version > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create unique index property_categories_code_unique_ci
      on property_categories (lower(code))
  `.execute(db);

  await sql`
    create unique index property_categories_name_unique_ci
      on property_categories (lower(name))
  `.execute(db);

  await sql`
    create index property_categories_public_order_idx
      on property_categories (status, homepage_visible, sort_order, name)
  `.execute(db);

  await sql`
    create table property_types (
      id uuid primary key default gen_random_uuid(),
      property_category_id uuid not null references property_categories(id) on delete restrict,
      code text not null,
      name text not null,
      sort_order integer not null default 0 check (sort_order >= 0),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
      version integer not null default 1 check (version > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (id, property_category_id)
    )
  `.execute(db);

  await sql`
    create unique index property_types_code_unique_ci
      on property_types (lower(code))
  `.execute(db);

  await sql`
    create unique index property_types_name_per_category_unique_ci
      on property_types (property_category_id, lower(name))
  `.execute(db);

  await sql`
    create index property_types_category_order_idx
      on property_types (property_category_id, status, sort_order, name)
  `.execute(db);

  await sql`
    insert into property_categories (code, name, homepage_heading, sort_order)
    values
      ('HOTELS_RESORTS', 'Hotels & Resorts', 'Hotels & Resorts', 10),
      ('VILLAS_HOMESTAYS', 'Villas & Homestays', 'Villas & Homestays', 20),
      ('CABINS_UNIQUE', 'Cabins & Unique Stays', 'Cabins & Unique Stays', 30),
      ('GLAMPING_NATURE', 'Glamping & Nature Stays', 'Glamping & Nature Stays', 40),
      ('HERITAGE_SPECIAL', 'Heritage & Special Stays', 'Heritage & Special Stays', 50)
  `.execute(db);

  await sql`
    insert into property_types (property_category_id, code, name, sort_order)
    select c.id, seed.code, seed.name, seed.sort_order
    from (
      values
        ('HOTELS_RESORTS', 'HOTEL', 'Hotel', 10),
        ('HOTELS_RESORTS', 'RESORT', 'Resort', 20),
        ('HOTELS_RESORTS', 'HOSTEL', 'Hostel', 30),
        ('VILLAS_HOMESTAYS', 'HOMESTAY', 'Homestay', 10),
        ('VILLAS_HOMESTAYS', 'VILLA', 'Villa', 20),
        ('VILLAS_HOMESTAYS', 'COTTAGE', 'Cottage', 30),
        ('VILLAS_HOMESTAYS', 'SERVICED_APARTMENT', 'Serviced Apartment', 40),
        ('CABINS_UNIQUE', 'CABIN', 'Cabin', 10),
        ('CABINS_UNIQUE', 'TREEHOUSE', 'Treehouse', 20),
        ('CABINS_UNIQUE', 'COTTAGE_CLUSTER', 'Cottage Cluster', 30),
        ('GLAMPING_NATURE', 'GLAMPING_TENT', 'Glamping Tent', 10),
        ('GLAMPING_NATURE', 'SAFARI_TENT', 'Safari Tent', 20),
        ('GLAMPING_NATURE', 'ECO_LODGE', 'Eco Lodge', 30),
        ('HERITAGE_SPECIAL', 'HERITAGE_HOTEL', 'Heritage Hotel', 10),
        ('HERITAGE_SPECIAL', 'HAVELI', 'Haveli', 20),
        ('HERITAGE_SPECIAL', 'PALACE_STAY', 'Palace Stay', 30),
        ('HERITAGE_SPECIAL', 'OTHER', 'Other Special Stay', 40)
    ) as seed(category_code, code, name, sort_order)
    join property_categories c on c.code = seed.category_code
  `.execute(db);

  await sql`
    alter table properties
      add column property_category_id uuid,
      add column property_type_id uuid
  `.execute(db);

  await sql`
    update properties p
    set property_category_id = c.id
    from property_categories c
    where c.code = case
      when p.property_type in ('HOTEL', 'RESORT', 'HOSTEL') then 'HOTELS_RESORTS'
      when p.property_type in ('VILLA', 'HOMESTAY', 'APARTMENT') then 'VILLAS_HOMESTAYS'
      when p.property_type = 'COTTAGE_CLUSTER' then 'CABINS_UNIQUE'
      else 'HERITAGE_SPECIAL'
    end
  `.execute(db);

  await sql`
    update properties p
    set property_type_id = pt.id
    from property_types pt
    where pt.code = case
      when p.property_type = 'APARTMENT' then 'SERVICED_APARTMENT'
      when p.property_type in ('HOTEL', 'RESORT', 'HOSTEL', 'VILLA', 'HOMESTAY', 'COTTAGE_CLUSTER')
        then p.property_type
      else 'OTHER'
    end
  `.execute(db);

  await sql`
    alter table properties
      alter column property_category_id set not null,
      alter column property_type_id set not null,
      add constraint properties_property_category_fk
        foreign key (property_category_id)
        references property_categories(id) on delete restrict,
      add constraint properties_property_type_category_fk
        foreign key (property_type_id, property_category_id)
        references property_types(id, property_category_id) on delete restrict
  `.execute(db);

  await sql`
    create index properties_taxonomy_idx
      on properties (property_category_id, property_type_id, status)
      where status <> 'ARCHIVED'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists properties_taxonomy_idx`.execute(db);
  await sql`
    alter table properties
      drop constraint if exists properties_property_type_category_fk,
      drop constraint if exists properties_property_category_fk,
      drop column if exists property_type_id,
      drop column if exists property_category_id
  `.execute(db);
  await sql`drop table if exists property_types`.execute(db);
  await sql`drop table if exists property_categories`.execute(db);
}
