import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/infrastructure/database/database.js";
import type { ActorContext } from "../src/modules/access/domain/actor-context.js";
import { HomepageContentService } from "../src/modules/homepage-content/application/homepage-content-service.js";

const config = loadConfig();
const db = createDatabase(config);

afterAll(async () => {
  await db.destroy();
});

function requestMetadata() {
  return {
    requestId: randomUUID(),
    correlationId: randomUUID(),
    source: "homepage-content-test",
    ipAddress: null,
    userAgent: null
  };
}

async function createUser(label: string): Promise<string> {
  const subject = `homepage-${label}-${randomUUID()}`;
  const user = await db
    .insertInto("users")
    .values({
      id: randomUUID(),
      auth_provider: "test",
      auth_subject: subject,
      email: `${subject}@example.invalid`,
      display_name: `Homepage ${label}`,
      email_verified: true,
      status: "ACTIVE"
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return user.id;
}

function actor(userId: string, platformRoles: ActorContext["platformRoles"]): ActorContext {
  return {
    userId,
    email: `${userId}@example.invalid`,
    platformRoles,
    organizationMemberships: [],
    propertyGrants: []
  };
}

async function createLiveDestination(city: string): Promise<void> {
  const organizationId = randomUUID();
  await db
    .insertInto("organizations")
    .values({
      id: organizationId,
      legal_name: `Homepage Organization ${city}`,
      trading_name: "Wildleaf Homepage Test",
      organization_type: "PRIVATE_LIMITED",
      status: "ACTIVE",
      country_code: "IN",
      currency_code: "INR"
    })
    .execute();

  await db
    .insertInto("properties")
    .values({
      id: randomUUID(),
      organization_id: organizationId,
      public_slug: `homepage-${city.toLowerCase().replaceAll(" ", "-")}-${randomUUID().slice(0, 8)}`,
      name: `Wildleaf ${city}`,
      status: "LIVE",
      timezone: "Asia/Kolkata",
      property_type: "RESORT",
      sale_mode: "BOTH",
      short_description: "Homepage content test property",
      locality: "Hills",
      city,
      state_region: "Himachal Pradesh",
      country_code: "IN",
      live_at: new Date()
    })
    .execute();
}

describe("homepage content manager", () => {
  it("restricts management, publishes scheduled hero content, and keeps storage keys private", async () => {
    const service = new HomepageContentService();
    const managerUserId = await createUser("manager");
    const analystUserId = await createUser("analyst");
    const manager = actor(managerUserId, ["CONTENT_MANAGER"]);
    const analyst = actor(analystUserId, ["ANALYST"]);
    const now = new Date("2026-09-07T12:00:00.000Z");

    await expect(service.listAdmin(db, analyst)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
      statusCode: 403
    });

    const active = await db.transaction().execute((trx) =>
      service.createHeroSlide(
        trx,
        manager,
        {
          headline: "The Art of Doing Nothing",
          subtitle: "Consider this your invitation to disappear for a while.",
          offerLabel: null,
          ctaLabel: "Explore stays",
          ctaHref: "/customer/#stays",
          altText: "Guests relaxing beside a pool",
          focalXPercent: 62,
          focalYPercent: 48,
          sortOrder: 2,
          enabled: true,
          startsAt: new Date("2026-09-01T00:00:00.000Z"),
          endsAt: new Date("2026-09-30T23:59:59.000Z")
        },
        {
          storageProvider: "GCS",
          storageKey: `private-homepage-test/${randomUUID()}/hero-active.webp`,
          mimeType: "image/webp"
        },
        requestMetadata()
      )
    );

    const futureStorageKey = `private-homepage-test/${randomUUID()}/hero-future.webp`;
    const future = await db.transaction().execute((trx) =>
      service.createHeroSlide(
        trx,
        manager,
        {
          headline: "Future campaign",
          subtitle: "Not visible yet",
          offerLabel: "Coming soon",
          ctaLabel: null,
          ctaHref: null,
          altText: null,
          focalXPercent: 50,
          focalYPercent: 50,
          sortOrder: 1,
          enabled: true,
          startsAt: new Date("2026-10-01T00:00:00.000Z"),
          endsAt: null
        },
        {
          storageProvider: "GCS",
          storageKey: futureStorageKey,
          mimeType: "image/webp"
        },
        requestMetadata()
      )
    );

    const publicView = await service.getPublicHomepage(db, now);
    expect(publicView.heroSlides).toHaveLength(1);
    expect(publicView.heroSlides[0]).toMatchObject({
      id: active.heroSlide.id,
      headline: "The Art of Doing Nothing",
      ctaLabel: "Explore stays",
      ctaHref: "/customer/#stays",
      focalXPercent: 62,
      focalYPercent: 48
    });

    const serialized = JSON.stringify(publicView);
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("private-homepage-test");

    await expect(service.getPublicMediaStorage(db, future.heroSlide.id, now)).rejects.toMatchObject(
      { code: "NOT_FOUND", statusCode: 404 }
    );

    await expect(
      service.getAdminMediaStorage(db, analyst, future.heroSlide.id)
    ).rejects.toMatchObject({ code: "ACCESS_DENIED", statusCode: 403 });

    await expect(service.getAdminMediaStorage(db, manager, future.heroSlide.id)).resolves.toBe(
      futureStorageKey
    );
  });

  it("publishes an image-only hero when all optional copy is blank", async () => {
    const service = new HomepageContentService();
    const managerUserId = await createUser("image-only-manager");
    const manager = actor(managerUserId, ["CONTENT_MANAGER"]);

    const created = await db.transaction().execute((trx) =>
      service.createHeroSlide(
        trx,
        manager,
        {
          headline: "",
          subtitle: null,
          offerLabel: null,
          ctaLabel: null,
          ctaHref: null,
          altText: null,
          focalXPercent: 50,
          focalYPercent: 50,
          sortOrder: 0,
          enabled: true,
          startsAt: null,
          endsAt: null
        },
        {
          storageProvider: "GCS",
          storageKey: `private-homepage-test/${randomUUID()}/image-only.webp`,
          mimeType: "image/webp"
        },
        requestMetadata()
      )
    );

    try {
      const publicView = await service.getPublicHomepage(db);
      expect(publicView.heroSlides.find((slide) => slide.id === created.heroSlide.id)).toMatchObject({
        headline: "",
        subtitle: null,
        offerLabel: null,
        ctaLabel: null,
        ctaHref: null,
        imageId: created.heroSlide.id
      });
    } finally {
      await db
        .deleteFrom("homepage_hero_slides")
        .where("id", "=", created.heroSlide.id)
        .execute();
    }
  });

  it("uses real live destination counts, supports destination photography, and enforces optimistic versions", async () => {
    const service = new HomepageContentService();
    const managerUserId = await createUser("destination-manager");
    const manager = actor(managerUserId, ["CONTENT_MANAGER"]);
    const city = `Homepage City ${randomUUID().slice(0, 8)}`;
    await createLiveDestination(city);

    const createdDestination = await db.transaction().execute((trx) =>
      service.createDestinationImage(
        trx,
        manager,
        {
          city,
          stateRegion: "Himachal Pradesh",
          countryCode: "IN",
          altText: `${city} hills at sunrise`,
          sortOrder: 3,
          enabled: true
        },
        {
          storageProvider: "GCS",
          storageKey: `private-homepage-test/${randomUUID()}/destination.webp`,
          mimeType: "image/webp"
        },
        requestMetadata()
      )
    );

    const publicView = await service.getPublicHomepage(db);
    expect(publicView.destinations).toContainEqual({
      city,
      stateRegion: "Himachal Pradesh",
      countryCode: "IN",
      propertyCount: 1,
      imageId: createdDestination.destinationImage.id,
      altText: `${city} hills at sunrise`
    });

    const hero = await db.transaction().execute((trx) =>
      service.createHeroSlide(
        trx,
        manager,
        {
          headline: "Versioned hero",
          subtitle: null,
          offerLabel: null,
          ctaLabel: null,
          ctaHref: null,
          altText: null,
          focalXPercent: 50,
          focalYPercent: 50,
          sortOrder: 0,
          enabled: false,
          startsAt: null,
          endsAt: null
        },
        {
          storageProvider: "GCS",
          storageKey: `private-homepage-test/${randomUUID()}/versioned.webp`,
          mimeType: "image/webp"
        },
        requestMetadata()
      )
    );

    const update = {
      headline: "Updated versioned hero",
      subtitle: null,
      offerLabel: null,
      ctaLabel: null,
      ctaHref: null,
      altText: null,
      focalXPercent: 50,
      focalYPercent: 50,
      sortOrder: 0,
      enabled: false,
      startsAt: null,
      endsAt: null,
      version: hero.heroSlide.version
    };

    const updated = await db
      .transaction()
      .execute((trx) =>
        service.updateHeroSlide(trx, manager, hero.heroSlide.id, update, requestMetadata())
      );
    expect(updated.heroSlide.version).toBe(hero.heroSlide.version + 1);

    await expect(
      db
        .transaction()
        .execute((trx) =>
          service.updateHeroSlide(trx, manager, hero.heroSlide.id, update, requestMetadata())
        )
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });

    const audit = await db
      .selectFrom("audit_events")
      .select(["action", "entity_id"])
      .where("entity_id", "=", createdDestination.destinationImage.id)
      .where("action", "=", "homepage.destination_image.created")
      .executeTakeFirstOrThrow();
    expect(audit.entity_id).toBe(createdDestination.destinationImage.id);
  });

  it("rejects destination images that do not correspond to a live Wildleaf destination", async () => {
    const service = new HomepageContentService();
    const managerUserId = await createUser("invalid-destination-manager");
    const manager = actor(managerUserId, ["CONTENT_MANAGER"]);

    await expect(
      db.transaction().execute((trx) =>
        service.createDestinationImage(
          trx,
          manager,
          {
            city: `No Live Property ${randomUUID().slice(0, 8)}`,
            stateRegion: "Himachal Pradesh",
            countryCode: "IN",
            altText: null,
            sortOrder: 0,
            enabled: true
          },
          {
            storageProvider: "GCS",
            storageKey: `private-homepage-test/${randomUUID()}/invalid.webp`,
            mimeType: "image/webp"
          },
          requestMetadata()
        )
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
  });
});
