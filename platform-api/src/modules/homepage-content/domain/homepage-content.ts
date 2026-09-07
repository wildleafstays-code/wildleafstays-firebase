export interface StoredHomepageImage {
  storageProvider: "GCS";
  storageKey: string;
  mimeType: string;
}

export interface CreateHeroSlideInput {
  headline: string;
  subtitle: string | null;
  offerLabel: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  altText: string | null;
  focalXPercent: number;
  focalYPercent: number;
  sortOrder: number;
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface UpdateHeroSlideInput extends CreateHeroSlideInput {
  version: number;
}

export interface CreateDestinationImageInput {
  city: string;
  stateRegion: string | null;
  countryCode: string;
  altText: string | null;
  sortOrder: number;
  enabled: boolean;
}

export interface UpdateDestinationImageInput {
  altText: string | null;
  sortOrder: number;
  enabled: boolean;
  version: number;
}

export interface HomepageHeroSlideAdminView {
  id: string;
  headline: string;
  subtitle: string | null;
  offerLabel: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageId: string;
  mimeType: string | null;
  altText: string | null;
  focalXPercent: number;
  focalYPercent: number;
  sortOrder: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  version: number;
  updatedAt: string;
}

export interface HomepageDestinationImageAdminView {
  id: string;
  city: string;
  stateRegion: string | null;
  countryCode: string;
  imageId: string;
  mimeType: string | null;
  altText: string | null;
  sortOrder: number;
  enabled: boolean;
  version: number;
  updatedAt: string;
}

export interface HomepageLiveDestinationView {
  city: string;
  stateRegion: string | null;
  countryCode: string;
  propertyCount: number;
}

export interface PublicHomepageHeroSlideView {
  id: string;
  headline: string;
  subtitle: string | null;
  offerLabel: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageId: string;
  altText: string | null;
  focalXPercent: number;
  focalYPercent: number;
}

export interface PublicHomepageDestinationView extends HomepageLiveDestinationView {
  imageId: string | null;
  altText: string | null;
}
