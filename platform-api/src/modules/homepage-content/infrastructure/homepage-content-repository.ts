import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type {
  Database,
  HomepageDestinationImagesTable,
  HomepageHeroSlidesTable
} from "../../../infrastructure/database/types.js";
import type {
  CreateDestinationImageInput,
  CreateHeroSlideInput,
  StoredHomepageImage,
  UpdateDestinationImageInput,
  UpdateHeroSlideInput
} from "../domain/homepage-content.js";

type DbExecutor = Kysely<Database> | Transaction<Database>;

export type HomepageHeroSlideRecord = Selectable<HomepageHeroSlidesTable>;
export type HomepageDestinationImageRecord = Selectable<HomepageDestinationImagesTable>;

export interface HomepageLiveDestinationRecord {
  city: string;
  state_region: string | null;
  country_code: string;
  property_count: number;
}

export interface HomepageMediaStorageRecord {
  storage_key: string;
}

export class HomepageContentRepository {
  async listHeroSlides(db: DbExecutor): Promise<HomepageHeroSlideRecord[]> {
    return db
      .selectFrom("homepage_hero_slides")
      .selectAll()
      .where("status", "=", "ACTIVE")
      .orderBy("sort_order")
      .orderBy("created_at")
      .execute();
  }

  async listPublicHeroSlides(db: DbExecutor, now: Date): Promise<HomepageHeroSlideRecord[]> {
    return db
      .selectFrom("homepage_hero_slides")
      .selectAll()
      .where("status", "=", "ACTIVE")
      .where("enabled", "=", true)
      .where((eb) => eb.or([eb("starts_at", "is", null), eb("starts_at", "<=", now)]))
      .where((eb) => eb.or([eb("ends_at", "is", null), eb("ends_at", ">", now)]))
      .orderBy("sort_order")
      .orderBy("created_at")
      .execute();
  }

  async findHeroSlide(db: DbExecutor, id: string): Promise<HomepageHeroSlideRecord | undefined> {
    return db
      .selectFrom("homepage_hero_slides")
      .selectAll()
      .where("id", "=", id)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
  }

  async createHeroSlide(
    db: DbExecutor,
    actorUserId: string,
    input: CreateHeroSlideInput,
    image: StoredHomepageImage
  ): Promise<HomepageHeroSlideRecord> {
    return db
      .insertInto("homepage_hero_slides")
      .values({
        headline: input.headline,
        subtitle: input.subtitle,
        offer_label: input.offerLabel,
        cta_label: input.ctaLabel,
        cta_href: input.ctaHref,
        storage_provider: image.storageProvider,
        storage_key: image.storageKey,
        mime_type: image.mimeType,
        alt_text: input.altText,
        focal_x_percent: input.focalXPercent,
        focal_y_percent: input.focalYPercent,
        sort_order: input.sortOrder,
        enabled: input.enabled,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: "ACTIVE",
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateHeroSlide(
    db: DbExecutor,
    actorUserId: string,
    id: string,
    input: UpdateHeroSlideInput
  ): Promise<HomepageHeroSlideRecord | undefined> {
    return db
      .updateTable("homepage_hero_slides")
      .set({
        headline: input.headline,
        subtitle: input.subtitle,
        offer_label: input.offerLabel,
        cta_label: input.ctaLabel,
        cta_href: input.ctaHref,
        alt_text: input.altText,
        focal_x_percent: input.focalXPercent,
        focal_y_percent: input.focalYPercent,
        sort_order: input.sortOrder,
        enabled: input.enabled,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        version: sql<number>`version + 1`,
        updated_by_user_id: actorUserId,
        updated_at: new Date()
      })
      .where("id", "=", id)
      .where("status", "=", "ACTIVE")
      .where("version", "=", input.version)
      .returningAll()
      .executeTakeFirst();
  }

  async replaceHeroImage(
    db: DbExecutor,
    actorUserId: string,
    id: string,
    version: number,
    image: StoredHomepageImage,
    altText: string | null
  ): Promise<HomepageHeroSlideRecord | undefined> {
    return db
      .updateTable("homepage_hero_slides")
      .set({
        storage_provider: image.storageProvider,
        storage_key: image.storageKey,
        mime_type: image.mimeType,
        alt_text: altText,
        version: sql<number>`version + 1`,
        updated_by_user_id: actorUserId,
        updated_at: new Date()
      })
      .where("id", "=", id)
      .where("status", "=", "ACTIVE")
      .where("version", "=", version)
      .returningAll()
      .executeTakeFirst();
  }

  async archiveHeroSlide(
    db: DbExecutor,
    actorUserId: string,
    id: string,
    version: number
  ): Promise<HomepageHeroSlideRecord | undefined> {
    return db
      .updateTable("homepage_hero_slides")
      .set({
        status: "ARCHIVED",
        enabled: false,
        version: sql<number>`version + 1`,
        updated_by_user_id: actorUserId,
        updated_at: new Date()
      })
      .where("id", "=", id)
      .where("status", "=", "ACTIVE")
      .where("version", "=", version)
      .returningAll()
      .executeTakeFirst();
  }

  async listDestinationImages(db: DbExecutor): Promise<HomepageDestinationImageRecord[]> {
    return db
      .selectFrom("homepage_destination_images")
      .selectAll()
      .where("status", "=", "ACTIVE")
      .orderBy("sort_order")
      .orderBy("city")
      .execute();
  }

  async findDestinationImage(
    db: DbExecutor,
    id: string
  ): Promise<HomepageDestinationImageRecord | undefined> {
    return db
      .selectFrom("homepage_destination_images")
      .selectAll()
      .where("id", "=", id)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
  }

  async findDestinationImageByIdentity(
    db: DbExecutor,
    city: string,
    stateRegion: string | null,
    countryCode: string
  ): Promise<HomepageDestinationImageRecord | undefined> {
    return db
      .selectFrom("homepage_destination_images")
      .selectAll()
      .where("status", "=", "ACTIVE")
      .where(sql<boolean>`lower(btrim(city)) = lower(btrim(${city}))`)
      .where(
        sql<boolean>`lower(btrim(coalesce(state_region, ''))) = lower(btrim(${stateRegion ?? ""}))`
      )
      .where("country_code", "=", countryCode)
      .executeTakeFirst();
  }

  async createDestinationImage(
    db: DbExecutor,
    actorUserId: string,
    input: CreateDestinationImageInput,
    image: StoredHomepageImage
  ): Promise<HomepageDestinationImageRecord> {
    return db
      .insertInto("homepage_destination_images")
      .values({
        city: input.city,
        state_region: input.stateRegion,
        country_code: input.countryCode,
        storage_provider: image.storageProvider,
        storage_key: image.storageKey,
        mime_type: image.mimeType,
        alt_text: input.altText,
        sort_order: input.sortOrder,
        enabled: input.enabled,
        status: "ACTIVE",
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateDestinationImage(
    db: DbExecutor,
    actorUserId: string,
    id: string,
    input: UpdateDestinationImageInput
  ): Promise<HomepageDestinationImageRecord | undefined> {
    return db
      .updateTable("homepage_destination_images")
      .set({
        alt_text: input.altText,
        sort_order: input.sortOrder,
        enabled: input.enabled,
        version: sql<number>`version + 1`,
        updated_by_user_id: actorUserId,
        updated_at: new Date()
      })
      .where("id", "=", id)
      .where("status", "=", "ACTIVE")
      .where("version", "=", input.version)
      .returningAll()
      .executeTakeFirst();
  }

  async replaceDestinationImage(
    db: DbExecutor,
    actorUserId: string,
    id: string,
    version: number,
    image: StoredHomepageImage,
    altText: string | null
  ): Promise<HomepageDestinationImageRecord | undefined> {
    return db
      .updateTable("homepage_destination_images")
      .set({
        storage_provider: image.storageProvider,
        storage_key: image.storageKey,
        mime_type: image.mimeType,
        alt_text: altText,
        version: sql<number>`version + 1`,
        updated_by_user_id: actorUserId,
        updated_at: new Date()
      })
      .where("id", "=", id)
      .where("status", "=", "ACTIVE")
      .where("version", "=", version)
      .returningAll()
      .executeTakeFirst();
  }

  async archiveDestinationImage(
    db: DbExecutor,
    actorUserId: string,
    id: string,
    version: number
  ): Promise<HomepageDestinationImageRecord | undefined> {
    return db
      .updateTable("homepage_destination_images")
      .set({
        status: "ARCHIVED",
        enabled: false,
        version: sql<number>`version + 1`,
        updated_by_user_id: actorUserId,
        updated_at: new Date()
      })
      .where("id", "=", id)
      .where("status", "=", "ACTIVE")
      .where("version", "=", version)
      .returningAll()
      .executeTakeFirst();
  }

  async listLiveDestinations(db: DbExecutor): Promise<HomepageLiveDestinationRecord[]> {
    return db
      .selectFrom("properties as p")
      .select([
        "p.city as city",
        "p.state_region as state_region",
        "p.country_code as country_code",
        sql<number>`count(*)::int`.as("property_count")
      ])
      .where("p.status", "=", "LIVE")
      .where("p.public_slug", "is not", null)
      .where("p.city", "is not", null)
      .where(sql<boolean>`btrim(p.city) <> ''`)
      .groupBy(["p.city", "p.state_region", "p.country_code"])
      .orderBy("p.city")
      .orderBy("p.state_region")
      .limit(200)
      .execute() as Promise<HomepageLiveDestinationRecord[]>;
  }

  async findAdminMediaStorage(
    db: DbExecutor,
    mediaId: string
  ): Promise<HomepageMediaStorageRecord | undefined> {
    const hero = await db
      .selectFrom("homepage_hero_slides")
      .select("storage_key")
      .where("id", "=", mediaId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
    if (hero) return hero;

    return db
      .selectFrom("homepage_destination_images")
      .select("storage_key")
      .where("id", "=", mediaId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
  }

  async findPublicMediaStorage(
    db: DbExecutor,
    mediaId: string,
    now: Date
  ): Promise<HomepageMediaStorageRecord | undefined> {
    const hero = await db
      .selectFrom("homepage_hero_slides")
      .select("storage_key")
      .where("id", "=", mediaId)
      .where("status", "=", "ACTIVE")
      .where("enabled", "=", true)
      .where((eb) => eb.or([eb("starts_at", "is", null), eb("starts_at", "<=", now)]))
      .where((eb) => eb.or([eb("ends_at", "is", null), eb("ends_at", ">", now)]))
      .executeTakeFirst();
    if (hero) return hero;

    return db
      .selectFrom("homepage_destination_images")
      .select("storage_key")
      .where("id", "=", mediaId)
      .where("status", "=", "ACTIVE")
      .where("enabled", "=", true)
      .executeTakeFirst();
  }
}
