import { ApiError, apiRequest } from "./api-client.js";

const form = document.querySelector("#entirePropertyFilters");
const queryInput = document.querySelector("#catalogQuery");
const destinationSelect = document.querySelector("#catalogDestination");
const categorySelect = document.querySelector("#catalogCategory");
const typeSelect = document.querySelector("#catalogType");
const resetButton = document.querySelector("#catalogReset");
const status = document.querySelector("#catalogStatus");
const groupsRoot = document.querySelector("#catalogLocationGroups");
const hero = document.querySelector("#entirePropertyHero");
const heroImage = document.querySelector("#entirePropertyHeroImage");
const heroOffer = document.querySelector("#entirePropertyHeroOffer");
const heroHeadline = document.querySelector("#entirePropertyHeroHeadline");
const heroSubtitle = document.querySelector("#entirePropertyHeroSubtitle");
const heroCta = document.querySelector("#entirePropertyHeroCta");
const heroControls = document.querySelector("#entirePropertyHeroControls");
const heroPrevious = document.querySelector("#entirePropertyHeroPrevious");
const heroNext = document.querySelector("#entirePropertyHeroNext");
const heroDots = document.querySelector("#entirePropertyHeroDots");

const collator = new Intl.Collator("en-IN", {
  sensitivity: "base",
  numeric: true,
});

const state = {
  properties: [],
  heroSlides: [],
  heroIndex: 0,
  heroTimer: null,
  taxonomy: {
    categories: [],
    types: [],
  },
};

void initialize();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderCatalog({ syncUrl: true });
});

queryInput.addEventListener("input", () => {
  if (!queryInput.value.trim()) renderCatalog({ syncUrl: true });
});

destinationSelect.addEventListener("change", () => {
  renderCatalog({ syncUrl: true });
});

categorySelect.addEventListener("change", () => {
  renderTypeOptions(categorySelect.value);
  renderCatalog({ syncUrl: true });
});

typeSelect.addEventListener("change", () => {
  renderCatalog({ syncUrl: true });
});

resetButton.addEventListener("click", () => {
  queryInput.value = "";
  destinationSelect.value = "";
  categorySelect.value = "";
  renderTypeOptions("");
  renderCatalog({ syncUrl: true });
  queryInput.focus();
});

async function initialize() {
  renderLoading();

  try {
    const [taxonomy, properties, homepage] = await Promise.all([
      apiRequest("/v1/public/property-taxonomy", { cache: "default" }),
      loadAllProperties(),
      apiRequest("/v1/public/homepage", { cache: "default" }).catch(() => ({
        entirePropertyHeroSlides: [],
      })),
    ]);

    state.heroSlides = homepage.entirePropertyHeroSlides || [];
    renderHero();

    state.taxonomy = {
      categories: taxonomy.categories || [],
      types: taxonomy.types || [],
    };

    state.properties = properties
      .filter(isEntirePropertyStay)
      .sort(compareProperties);

    renderDestinationOptions();
    renderCategoryOptions();
    applyUrlFilters();
    renderCatalog({ syncUrl: false });
  } catch (error) {
    renderError(error);
  }
}

function homepageMediaUrl(mediaId) {
  return `/v1/public/homepage/media/${encodeURIComponent(mediaId)}`;
}

function renderHero() {
  stopHeroTimer();

  if (!hero || !state.heroSlides.length) {
    hero?.classList.add("hidden");
    return;
  }

  hero.classList.remove("hidden");
  renderHeroSlide(0);
  renderHeroDots();
  heroControls?.classList.toggle("hidden", state.heroSlides.length <= 1);

  heroPrevious?.addEventListener("click", () => {
    stepHero(-1);
    resetHeroTimer();
  });
  heroNext?.addEventListener("click", () => {
    stepHero(1);
    resetHeroTimer();
  });

  resetHeroTimer();
}

function renderHeroSlide(index) {
  if (!state.heroSlides.length || !hero) return;
  const normalized =
    ((index % state.heroSlides.length) + state.heroSlides.length) %
    state.heroSlides.length;
  state.heroIndex = normalized;
  const slide = state.heroSlides[normalized];

  heroImage.src = homepageMediaUrl(slide.imageId);
  heroImage.alt = slide.altText || "";
  heroImage.style.objectPosition =
    `${slide.focalXPercent}% ${slide.focalYPercent}%`;

  heroOffer.textContent = slide.offerLabel || "";
  heroOffer.classList.toggle("hidden", !slide.offerLabel);

  heroHeadline.textContent = slide.headline || "";
  heroHeadline.classList.toggle("hidden", !slide.headline);

  heroSubtitle.textContent = slide.subtitle || "";
  heroSubtitle.classList.toggle("hidden", !slide.subtitle);

  if (slide.ctaLabel && slide.ctaHref) {
    heroCta.textContent = slide.ctaLabel;
    heroCta.href = slide.ctaHref;
    heroCta.classList.remove("hidden");
  } else {
    heroCta.classList.add("hidden");
  }

  updateHeroDots();
}

function renderHeroDots() {
  if (!heroDots) return;
  heroDots.replaceChildren();
  state.heroSlides.forEach((slide, index) => {
    const dot = element("button", "entire-property-hero-dot");
    dot.type = "button";
    dot.setAttribute("role", "tab");
    dot.setAttribute(
      "aria-label",
      slide.headline
        ? `Show campaign ${index + 1}: ${slide.headline}`
        : `Show campaign ${index + 1}`,
    );
    dot.addEventListener("click", () => {
      renderHeroSlide(index);
      resetHeroTimer();
    });
    heroDots.append(dot);
  });
  updateHeroDots();
}

function updateHeroDots() {
  if (!heroDots) return;
  [...heroDots.children].forEach((dot, index) => {
    const active = index === state.heroIndex;
    dot.classList.toggle("active", active);
    dot.setAttribute("aria-selected", String(active));
  });
}

function stepHero(direction) {
  if (state.heroSlides.length <= 1) return;
  renderHeroSlide(state.heroIndex + direction);
}

function stopHeroTimer() {
  if (!state.heroTimer) return;
  window.clearInterval(state.heroTimer);
  state.heroTimer = null;
}

function resetHeroTimer() {
  stopHeroTimer();
  if (state.heroSlides.length <= 1) return;
  state.heroTimer = window.setInterval(() => stepHero(1), 6500);
}

async function loadAllProperties() {
  const properties = [];
  let offset = 0;

  while (true) {
    const query = new URLSearchParams({
      limit: "100",
      offset: String(offset),
    });
    const data = await apiRequest(`/v1/public/properties?${query}`, {
      cache: "default",
    });
    const page = data.properties || [];
    properties.push(...page);
    if (page.length < 100) break;
    offset += page.length;
  }

  return properties;
}

function isEntirePropertyStay(property) {
  return (
    property.saleMode === "FULL_PROPERTY_ONLY" ||
    property.saleMode === "BOTH"
  );
}

function compareProperties(left, right) {
  const locationComparison = collator.compare(
    locationLabel(left),
    locationLabel(right),
  );
  if (locationComparison !== 0) return locationComparison;
  return collator.compare(left.name || "", right.name || "");
}

function renderDestinationOptions() {
  const destinations = [
    ...new Set(
      state.properties
        .map((property) => locationLabel(property))
        .filter(Boolean),
    ),
  ].sort(collator.compare);

  destinationSelect.replaceChildren(
    option("", "All destinations"),
    ...destinations.map((destination) => option(destination, destination)),
  );
}

function renderCategoryOptions() {
  const categoryIdsWithProperties = new Set(
    state.properties
      .map((property) => property.propertyCategoryId)
      .filter(Boolean),
  );

  const categories = [...state.taxonomy.categories]
    .filter((category) => category.enabled)
    .filter((category) => categoryIdsWithProperties.has(category.id))
    .sort(
      (left, right) =>
        Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
        collator.compare(left.name, right.name),
    );

  categorySelect.replaceChildren(
    option("", "All categories"),
    ...categories.map((category) => option(category.id, category.name)),
  );
}

function renderTypeOptions(categoryId, requestedTypeId = "") {
  const typeIdsWithProperties = new Set(
    state.properties
      .filter(
        (property) =>
          !categoryId || property.propertyCategoryId === categoryId,
      )
      .map((property) => property.propertyTypeId)
      .filter(Boolean),
  );

  const types = state.taxonomy.types
    .filter((propertyType) => propertyType.enabled)
    .filter((propertyType) => propertyType.categoryId === categoryId)
    .filter((propertyType) => typeIdsWithProperties.has(propertyType.id))
    .sort(
      (left, right) =>
        Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
        collator.compare(left.name, right.name),
    );

  typeSelect.replaceChildren(
    option("", "All property types"),
    ...types.map((propertyType) =>
      option(propertyType.id, propertyType.name),
    ),
  );

  typeSelect.disabled = !categoryId || types.length === 0;
  if (
    requestedTypeId &&
    types.some((propertyType) => propertyType.id === requestedTypeId)
  ) {
    typeSelect.value = requestedTypeId;
  } else {
    typeSelect.value = "";
  }
}

function applyUrlFilters() {
  const params = new URLSearchParams(location.search);
  queryInput.value = params.get("q") || "";

  const destination = params.get("destination") || "";
  if (
    [...destinationSelect.options].some(
      (destinationOption) => destinationOption.value === destination,
    )
  ) {
    destinationSelect.value = destination;
  }

  const categoryId = params.get("categoryId") || "";
  if (
    [...categorySelect.options].some(
      (categoryOption) => categoryOption.value === categoryId,
    )
  ) {
    categorySelect.value = categoryId;
  }

  renderTypeOptions(categorySelect.value, params.get("typeId") || "");
}

function renderCatalog({ syncUrl }) {
  const query = normalize(queryInput.value);
  const destination = destinationSelect.value;
  const categoryId = categorySelect.value;
  const typeId = typeSelect.value;

  const filtered = state.properties.filter((property) => {
    if (destination && locationLabel(property) !== destination) return false;
    if (categoryId && property.propertyCategoryId !== categoryId) return false;
    if (typeId && property.propertyTypeId !== typeId) return false;
    if (!query) return true;

    const haystack = normalize(
      [
        property.name,
        property.locality,
        property.city,
        property.stateRegion,
        property.propertyCategoryName,
        property.propertyTypeName,
      ]
        .filter(Boolean)
        .join(" "),
    );
    return haystack.includes(query);
  });

  if (syncUrl) writeFiltersToUrl();

  renderGroups(filtered);
}

function renderGroups(properties) {
  groupsRoot.replaceChildren();

  if (!properties.length) {
    status.textContent = "No entire-property stays match these filters.";
    const empty = element("div", "catalog-empty-state");
    empty.append(
      element("h3", "", "No stays found"),
      element(
        "p",
        "",
        "Try another destination, category, property type, or search term.",
      ),
    );
    groupsRoot.append(empty);
    return;
  }

  const grouped = new Map();
  for (const property of properties) {
    const location = locationLabel(property);
    if (!grouped.has(location)) grouped.set(location, []);
    grouped.get(location).push(property);
  }

  const locations = [...grouped.keys()].sort(collator.compare);
  const fragment = document.createDocumentFragment();

  locations.forEach((locationName, groupIndex) => {
    const locationProperties = grouped
      .get(locationName)
      .slice()
      .sort((left, right) => collator.compare(left.name, right.name));

    const section = element("section", "catalog-location-section");
    section.dataset.location = locationName;

    const heading = element("div", "catalog-location-heading");
    const copy = element("div");
    copy.append(
      element("h3", "", locationName),
      element(
        "p",
        "",
        locationProperties[0]?.stateRegion &&
          locationProperties[0].stateRegion !== locationName
          ? locationProperties[0].stateRegion
          : "Entire-property stays",
      ),
    );

    heading.append(
      copy,
      element(
        "span",
        "catalog-location-count",
        `${locationProperties.length} ${locationProperties.length === 1 ? "stay" : "stays"}`,
      ),
    );

    const grid = element("div", "catalog-property-grid");
    locationProperties.forEach((property, index) => {
      grid.append(propertyCard(property, groupIndex * 10 + index));
    });

    section.append(heading, grid);
    fragment.append(section);
  });

  groupsRoot.append(fragment);
  status.textContent =
    `${properties.length} ${properties.length === 1 ? "entire-property stay" : "entire-property stays"} across ` +
    `${locations.length} ${locations.length === 1 ? "destination" : "destinations"}`;
}

function propertyCard(property, index) {
  const article = element("article", "catalog-property-card");

  const visual = element(
    "div",
    `catalog-property-visual visual-${(index % 4) + 1}`,
  );
  if (property.coverMediaId) {
    const image = element("img", "catalog-property-image");
    image.src = propertyMediaUrl(property.publicSlug, property.coverMediaId);
    image.alt = property.name;
    image.loading = index < 3 ? "eager" : "lazy";
    image.decoding = "async";
    visual.classList.add("has-image");
    visual.append(image);
  }

  visual.append(
    element(
      "span",
      "catalog-type-badge",
      property.propertyTypeName ||
        property.propertyCategoryName ||
        "Entire property",
    ),
  );

  const body = element("div", "catalog-property-body");
  const place = [property.locality, property.city, property.stateRegion]
    .filter(Boolean)
    .join(", ");

  body.append(
    element("p", "catalog-property-location", place || property.countryCode),
    element("h4", "", property.name),
    element(
      "p",
      "catalog-property-description",
      property.shortDescription ||
        "A private-use Wildleaf stay with live availability and secure booking.",
    ),
  );

  const meta = element("div", "catalog-property-meta");
  if (property.propertyCategoryName) {
    meta.append(
      element("span", "catalog-chip", property.propertyCategoryName),
    );
  }
  if (property.propertyTypeName) {
    meta.append(element("span", "catalog-chip", property.propertyTypeName));
  }
  meta.append(element("span", "catalog-chip", "Entire property"));
  body.append(meta);

  const link = element(
    "a",
    "button button-primary catalog-property-cta",
    "View entire stay",
  );
  link.href = propertyUrl(property);
  link.setAttribute("aria-label", `View ${property.name} as an entire property`);
  body.append(link);

  article.append(visual, body);
  return article;
}

function propertyUrl(property) {
  const params = new URLSearchParams({
    slug: property.publicSlug,
    mode: "villa",
  });
  return `/customer/property.html?${params}`;
}

function propertyMediaUrl(publicSlug, mediaId) {
  return `/v1/public/properties/${encodeURIComponent(publicSlug)}/media/${encodeURIComponent(mediaId)}`;
}

function locationLabel(property) {
  return (
    String(property.city || "").trim() ||
    String(property.locality || "").trim() ||
    String(property.stateRegion || "").trim() ||
    "Other destinations"
  );
}

function writeFiltersToUrl() {
  const params = new URLSearchParams();
  const query = queryInput.value.trim();
  if (query) params.set("q", query);
  if (destinationSelect.value) {
    params.set("destination", destinationSelect.value);
  }
  if (categorySelect.value) params.set("categoryId", categorySelect.value);
  if (typeSelect.value) params.set("typeId", typeSelect.value);

  history.replaceState(
    null,
    "",
    params.toString() ? `${location.pathname}?${params}` : location.pathname,
  );
}

function renderLoading() {
  status.textContent = "Loading live entire-property stays…";
  groupsRoot.replaceChildren(
    ...Array.from({ length: 3 }, () => {
      const card = element("div", "catalog-loading-card");
      card.append(element("div"), element("span"), element("span"));
      return card;
    }),
  );
}

function renderError(error) {
  const message =
    error instanceof ApiError
      ? error.message
      : "Entire-property stays could not be loaded.";
  status.textContent = "Live properties are temporarily unavailable.";
  const panel = element("div", "catalog-empty-state");
  panel.append(
    element("h3", "", "We couldn’t load the stays"),
    element("p", "", message),
  );
  groupsRoot.replaceChildren(panel);
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-IN");
}

function option(value, label) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

function element(tagName, className = "", text = "") {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
