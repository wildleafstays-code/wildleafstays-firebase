import type { Kysely, Transaction } from "kysely";
import type { Database, JsonObject } from "../../../infrastructure/database/types.js";
import type { ActorContext } from "../../access/domain/actor-context.js";
import { AuthorizationService } from "../../access/domain/authorization-service.js";
import { Permissions } from "../../access/domain/permissions.js";
import { AuditService } from "../../../shared/audit/audit-service.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../../shared/errors/app-error.js";
import type { RequestMetadata } from "../../../shared/http/request-metadata.js";
import type {
  CreateDestinationImageInput,
  CreateHeroSlideInput,
  HomepageDestinationImageAdminView,
  HomepageHeroSlideAdminView,
  HomepageLiveDestinationView,
  PublicHomepageDestinationView,
  PublicHomepageHeroSlideView,
  StoredHomepageImage,
  UpdateDestinationImageInput,
  UpdateHeroSlideInput
} from "../domain/homepage-content.js";
import {
  HomepageContentRepository,
  type HomepageDestinationImageRecord,
  type HomepageHeroSlideRecord,
  type HomepageLiveDestinationRecord
} from "../infrastructure/homepage-content-repository.js";

type DbExecutor = Kysely<Database> | Transaction<Database>;

function trimmed(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${label} is required`);
  }
  if (normalized.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  label: string,
  maxLength: number
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function integerInRange(
  value: number,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(
      `${label} must be a whole number between ${minimum} and ${maximum}`
    );
  }
  return value;
}

function normalizedCountryCode(value: string): string {
  const countryCode = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new ValidationError("Country code must contain exactly two letters");
  }
  return countryCode;
}

function normalizedCta(
  labelValue: string | null | undefined,
  hrefValue: string | null | undefined
): { ctaLabel: string | null; ctaHref: string | null } {
  const ctaLabel = optionalText(labelValue, "CTA label", 60);
  const ctaHref = optionalText(hrefValue, "CTA link", 500);
  if ((ctaLabel === null) !== (ctaHref === null)) {
    throw new ValidationError("CTA label and CTA link must either both be supplied or both be blank");
  }
  if (
    ctaHref &&
    !ctaHref.startsWith("/") &&
    !ctaHref.startsWith("#") &&
    !/^https:\/\/[^\s]+$/i.test(ctaHref)
  ) {
    throw new ValidationError("CTA link must be an HTTPS URL, a site-relative path, or an anchor");
  }
  return { ctaLabel, ctaHref };
}

function validateSchedule(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    throw new ValidationError("Hero start time is invalid");
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw new ValidationError("Hero end time is invalid");
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new ValidationError("Hero end time must be after its start time");
  }
}

function normalizeHeroInput(input: CreateHeroSlideInput): CreateHeroSlideInput {
  const { ctaLabel, ctaHref } = normalizedCta(input.ctaLabel, input.ctaHref);
  validateSchedule(input.startsAt, input.endsAt);
  return {
    headline: trimmed(input.headline, "Headline", 160),
    subtitle: optionalText(input.subtitle, "Subtitle", 300),
    offerLabel: optionalText(input.offerLabel, "Offer label", 80),
    ctaLabel,
    ctaHref,
    altText: optionalText(input.altText, "Image description", 500),
    focalXPercent: integerInRange(input.focalXPercent, "Horizontal focal point", 0, 100),
    focalYPercent: integerInRange(input.focalYPercent, "Vertical focal point", 0, 100),
    sortOrder: integerInRange(input.sortOrder, "Display order", 0, 10000),
    enabled: Boolean(input.enabled),
    startsAt: input.startsAt,
    endsAt: input.endsAt
  };
}

function normalizeHeroUpdate(input: UpdateHeroSlideInput): UpdateHeroSlideInput {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new ValidationError("Hero slide version must be a positive whole number");
  }
  return { ...normalizeHeroInput(input), version: input.version };
}

function normalizeDestinationInput(
  input: CreateDestinationImageInput
): CreateDestinationImageInput {
  return {
    city: trimmed(input.city, "Destination city", 150),
    stateRegion: optionalText(input.stateRegion, "State or region", 150),
    countryCode: normalizedCountryCode(input.countryCode),
    altText: optionalText(input.altText, "Image description", 500),
    sortOrder: integerInRange(input.sortOrder, "Display order", 0, 10000),
    enabled: Boolean(input.enabled)
  };
}

function normalizeDestinationUpdate(
  input: UpdateDestinationImageInput
): UpdateDestinationImageInput {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new ValidationError("Destination image version must be a positive whole number");
  }
  return {
    altText: optionalText(input.altText, "Image description", 500),
    sortOrder: integerInRange(input.sortOrder, "Display order", 0, 10000),
    enabled: Boolean(input.enabled),
    version: input.version
  };
}

function heroAdminView(row: HomepageHeroSlideRecord): HomepageHeroSlideAdminView {
  return {
    id: row.id,
    headline: row.headline,
    subtitle: row.subtitle,
    offerLabel: row.offer_label,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    imageId: row.id,
    mimeType: row.mime_type,
    altText: row.alt_text,
    focalXPercent: row.focal_x_percent,
    focalYPercent: row.focal_y_percent,
    sortOrder: row.sort_order,
    enabled: row.enabled,
    startsAt: row.starts_at?.toISOString() ?? null,
    endsAt: row.ends_at?.toISOString() ?? null,
    version: row.version,
    updatedAt: row.updated_at.toISOString()
  };
}

function destinationAdminView(
  row: HomepageDestinationImageRecord
): HomepageDestinationImageAdminView {
  return {
    id: row.id,
    city: row.city,
    stateRegion: row.state_region,
    countryCode: row.country_code,
    imageId: row.id,
    mimeType: row.mime_type,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    enabled: row.enabled,
    version: row.version,
    updatedAt: row.updated_at.toISOString()
  };
}

function liveDestinationView(
  row: HomepageLiveDestinationRecord
): HomepageLiveDestinationView {
  return {
    city: row.city,
    stateRegion: row.state_region,
    countryCode: row.country_code,
    propertyCount: row.property_count
  };
}

function auditView(value: HomepageHeroSlideAdminView | HomepageDestinationImageAdminView): JsonObject {
  return { ...value };
}

function destinationKey(
  city: string,
  stateRegion: string | null,
  countryCode: string
): string {
  return [
    city.trim().toLocaleLowerCase("en"),
    (stateRegion ?? "").trim().toLocaleLowerCase("en"),
    countryCode.trim().toUpperCase()
  ].join("|");
}

export class HomepageContentService {
  constructor(
    private readonly repository = new HomepageContentRepository(),
    private readonly authorization = new AuthorizationService()
  ) {}

  assertManage(actor: ActorContext): void {
    this.authorization.assert(actor, Permissions.HOMEPAGE_CONTENT_MANAGE, {
      kind: "platform"
    });
  }

  async listAdmin(
    db: Kysely<Database>,
    actor: ActorContext
  ): Promise<{
    heroSlides: HomepageHeroSlideAdminView[];
    destinationImages: HomepageDestinationImageAdminView[];
    liveDestinations: HomepageLiveDestinationView[];
  }> {
    this.assertManage(actor);
    const [heroSlides, destinationImages, liveDestinations] = await Promise.all([
      this.repository.listHeroSlides(db),
      this.repository.listDestinationImages(db),
      this.repository.listLiveDestinations(db)
    ]);
    return {
      heroSlides: heroSlides.map(heroAdminView),
      destinationImages: destinationImages.map(destinationAdminView),
      liveDestinations: liveDestinations.map(liveDestinationView)
    };
  }

  async getPublicHomepage(
    db: Kysely<Database>,
    now = new Date()
  ): Promise<{
    heroSlides: PublicHomepageHeroSlideView[];
    destinations: PublicHomepageDestinationView[];
  }> {
    const [heroRows, destinationRows, liveDestinationRows] = await Promise.all([
      this.repository.listPublicHeroSlides(db, now),
      this.repository.listDestinationImages(db),
      this.repository.listLiveDestinations(db)
    ]);

    const heroSlides: PublicHomepageHeroSlideView[] = heroRows.map((row) => ({
      id: row.id,
      headline: row.headline,
      subtitle: row.subtitle,
      offerLabel: row.offer_label,
      ctaLabel: row.cta_label,
      ctaHref: row.cta_href,
      imageId: row.id,
      altText: row.alt_text,
      focalXPercent: row.focal_x_percent,
      focalYPercent: row.focal_y_percent
    }));

    const configured = new Map(
      destinationRows
        .filter((row) => row.enabled)
        .map((row) => [
          destinationKey(row.city, row.state_region, row.country_code),
          row
        ])
    );

    const destinations: PublicHomepageDestinationView[] = liveDestinationRows
      .map((row) => {
        const image = configured.get(
          destinationKey(row.city, row.state_region, row.country_code)
        );
        return {
          city: row.city,
          stateRegion: row.state_region,
          countryCode: row.country_code,
          propertyCount: row.property_count,
          imageId: image?.id ?? null,
          altText: image?.alt_text ?? null,
          sortOrder: image?.sort_order ?? 10000
        };
      })
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          right.propertyCount - left.propertyCount ||
          left.city.localeCompare(right.city)
      )
      .map(({ sortOrder: _sortOrder, ...destination }) => destination);

    return { heroSlides, destinations };
  }

  async getPublicMediaStorage(
    db: Kysely<Database>,
    mediaId: string,
    now = new Date()
  ): Promise<string> {
    const media = await this.repository.findPublicMediaStorage(db, mediaId, now);
    if (!media) throw new NotFoundError("Published homepage image not found");
    return media.storage_key;
  }

  async createHeroSlide(
    trx: Transaction<Database>,
    actor: ActorContext,
    input: CreateHeroSlideInput,
    image: StoredHomepageImage,
    request: RequestMetadata
  ): Promise<{ heroSlide: HomepageHeroSlideAdminView }> {
    this.assertManage(actor);
    const normalized = normalizeHeroInput(input);
    const row = await this.repository.createHeroSlide(trx, actor.userId, normalized, image);
    const view = heroAdminView(row);
    await new AuditService(trx).record({
      actor,
      action: "homepage.hero_slide.created",
      entityType: "homepage_hero_slide",
      entityId: row.id,
      before: null,
      after: auditView(view),
      request
    });
    return { heroSlide: view };
  }

  async updateHeroSlide(
    trx: Transaction<Database>,
    actor: ActorContext,
    id: string,
    input: UpdateHeroSlideInput,
    request: RequestMetadata
  ): Promise<{ heroSlide: HomepageHeroSlideAdminView }> {
    this.assertManage(actor);
    const before = await this.repository.findHeroSlide(trx, id);
    if (!before) throw new NotFoundError("Homepage hero slide not found");
    const normalized = normalizeHeroUpdate(input);
    const row = await this.repository.updateHeroSlide(trx, actor.userId, id, normalized);
    if (!row) {
      throw new ConflictError("Homepage hero slide changed since it was loaded");
    }
    const beforeView = heroAdminView(before);
    const afterView = heroAdminView(row);
    await new AuditService(trx).record({
      actor,
      action: "homepage.hero_slide.updated",
      entityType: "homepage_hero_slide",
      entityId: row.id,
      before: auditView(beforeView),
      after: auditView(afterView),
      request
    });
    return { heroSlide: afterView };
  }

  async replaceHeroImage(
    trx: Transaction<Database>,
    actor: ActorContext,
    id: string,
    version: number,
    altText: string | null,
    image: StoredHomepageImage,
    request: RequestMetadata
  ): Promise<{ heroSlide: HomepageHeroSlideAdminView }> {
    this.assertManage(actor);
    if (!Number.isInteger(version) || version < 1) {
      throw new ValidationError("Hero slide version must be a positive whole number");
    }
    const before = await this.repository.findHeroSlide(trx, id);
    if (!before) throw new NotFoundError("Homepage hero slide not found");
    const normalizedAlt = optionalText(altText, "Image description", 500);
    const row = await this.repository.replaceHeroImage(
      trx,
      actor.userId,
      id,
      version,
      image,
      normalizedAlt
    );
    if (!row) {
      throw new ConflictError("Homepage hero slide changed since it was loaded");
    }
    const beforeView = heroAdminView(before);
    const afterView = heroAdminView(row);
    await new AuditService(trx).record({
      actor,
      action: "homepage.hero_slide.image_replaced",
      entityType: "homepage_hero_slide",
      entityId: row.id,
      before: auditView(beforeView),
      after: auditView(afterView),
      request
    });
    return { heroSlide: afterView };
  }

  async archiveHeroSlide(
    trx: Transaction<Database>,
    actor: ActorContext,
    id: string,
    version: number,
    request: RequestMetadata
  ): Promise<{ archived: true }> {
    this.assertManage(actor);
    const before = await this.repository.findHeroSlide(trx, id);
    if (!before) throw new NotFoundError("Homepage hero slide not found");
    const row = await this.repository.archiveHeroSlide(trx, actor.userId, id, version);
    if (!row) {
      throw new ConflictError("Homepage hero slide changed since it was loaded");
    }
    await new AuditService(trx).record({
      actor,
      action: "homepage.hero_slide.archived",
      entityType: "homepage_hero_slide",
      entityId: row.id,
      before: auditView(heroAdminView(before)),
      after: null,
      request
    });
    return { archived: true };
  }

  async createDestinationImage(
    trx: Transaction<Database>,
    actor: ActorContext,
    input: CreateDestinationImageInput,
    image: StoredHomepageImage,
    request: RequestMetadata
  ): Promise<{ destinationImage: HomepageDestinationImageAdminView }> {
    this.assertManage(actor);
    const normalized = normalizeDestinationInput(input);
    const liveDestinations = await this.repository.listLiveDestinations(trx);
    const matchesLiveDestination = liveDestinations.some(
      (destination) =>
        destinationKey(
          destination.city,
          destination.state_region,
          destination.country_code
        ) ===
        destinationKey(
          normalized.city,
          normalized.stateRegion,
          normalized.countryCode
        )
    );
    if (!matchesLiveDestination) {
      throw new ValidationError("Destination image must match a destination with a live property");
    }

    const existing = await this.repository.findDestinationImageByIdentity(
      trx,
      normalized.city,
      normalized.stateRegion,
      normalized.countryCode
    );
    if (existing) {
      throw new ConflictError("This destination already has a managed homepage image");
    }

    const row = await this.repository.createDestinationImage(
      trx,
      actor.userId,
      normalized,
      image
    );
    const view = destinationAdminView(row);
    await new AuditService(trx).record({
      actor,
      action: "homepage.destination_image.created",
      entityType: "homepage_destination_image",
      entityId: row.id,
      before: null,
      after: auditView(view),
      request
    });
    return { destinationImage: view };
  }

  async updateDestinationImage(
    trx: Transaction<Database>,
    actor: ActorContext,
    id: string,
    input: UpdateDestinationImageInput,
    request: RequestMetadata
  ): Promise<{ destinationImage: HomepageDestinationImageAdminView }> {
    this.assertManage(actor);
    const before = await this.repository.findDestinationImage(trx, id);
    if (!before) throw new NotFoundError("Homepage destination image not found");
    const normalized = normalizeDestinationUpdate(input);
    const row = await this.repository.updateDestinationImage(
      trx,
      actor.userId,
      id,
      normalized
    );
    if (!row) {
      throw new ConflictError("Homepage destination image changed since it was loaded");
    }
    const beforeView = destinationAdminView(before);
    const afterView = destinationAdminView(row);
    await new AuditService(trx).record({
      actor,
      action: "homepage.destination_image.updated",
      entityType: "homepage_destination_image",
      entityId: row.id,
      before: auditView(beforeView),
      after: auditView(afterView),
      request
    });
    return { destinationImage: afterView };
  }

  async replaceDestinationImage(
    trx: Transaction<Database>,
    actor: ActorContext,
    id: string,
    version: number,
    altText: string | null,
    image: StoredHomepageImage,
    request: RequestMetadata
  ): Promise<{ destinationImage: HomepageDestinationImageAdminView }> {
    this.assertManage(actor);
    if (!Number.isInteger(version) || version < 1) {
      throw new ValidationError("Destination image version must be a positive whole number");
    }
    const before = await this.repository.findDestinationImage(trx, id);
    if (!before) throw new NotFoundError("Homepage destination image not found");
    const normalizedAlt = optionalText(altText, "Image description", 500);
    const row = await this.repository.replaceDestinationImage(
      trx,
      actor.userId,
      id,
      version,
      image,
      normalizedAlt
    );
    if (!row) {
      throw new ConflictError("Homepage destination image changed since it was loaded");
    }
    const beforeView = destinationAdminView(before);
    const afterView = destinationAdminView(row);
    await new AuditService(trx).record({
      actor,
      action: "homepage.destination_image.image_replaced",
      entityType: "homepage_destination_image",
      entityId: row.id,
      before: auditView(beforeView),
      after: auditView(afterView),
      request
    });
    return { destinationImage: afterView };
  }

  async archiveDestinationImage(
    trx: Transaction<Database>,
    actor: ActorContext,
    id: string,
    version: number,
    request: RequestMetadata
  ): Promise<{ archived: true }> {
    this.assertManage(actor);
    const before = await this.repository.findDestinationImage(trx, id);
    if (!before) throw new NotFoundError("Homepage destination image not found");
    const row = await this.repository.archiveDestinationImage(
      trx,
      actor.userId,
      id,
      version
    );
    if (!row) {
      throw new ConflictError("Homepage destination image changed since it was loaded");
    }
    await new AuditService(trx).record({
      actor,
      action: "homepage.destination_image.archived",
      entityType: "homepage_destination_image",
      entityId: row.id,
      before: auditView(destinationAdminView(before)),
      after: null,
      request
    });
    return { archived: true };
  }
}
