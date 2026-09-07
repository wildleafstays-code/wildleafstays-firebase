import { ApiError, apiRequest } from "./api-client.js";

const form = document.querySelector("#searchForm");
const results = document.querySelector("#results");
const resultsTitle = document.querySelector("#resultsTitle");
const resultsStatus = document.querySelector("#resultsStatus");
const destinationList = document.querySelector("#destinationList");
const resultsEyebrow = document.querySelector("#resultsEyebrow");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const modeLinks = [...document.querySelectorAll("[data-nav-mode]")];
const roomCountField = document.querySelector("#roomCountField");
const destinationRail = document.querySelector("#destinationRail");
const mobileSearchTrigger = document.querySelector("#mobileSearchTrigger");
const mobileSearchClose = document.querySelector("#mobileSearchClose");
const mobileSearchLabel = document.querySelector("#mobileSearchLabel");
const mobileSearchMeta = document.querySelector("#mobileSearchMeta");

const state = {
  mode:
    new URLSearchParams(location.search).get("mode") === "villa"
      ? "villa"
      : "hotel",
  properties: [],
};

setDefaultDates();
applyMode();
void initialize();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  closeMobileSearch();
  void loadProperties(form.destination.value.trim());
  document.querySelector("#stays")?.scrollIntoView({
    block: "start",
    behavior: "smooth",
  });
});

mobileSearchTrigger?.addEventListener("click", openMobileSearch);
mobileSearchClose?.addEventListener("click", closeMobileSearch);
form.addEventListener("input", updateMobileSearchSummary);
form.addEventListener("change", updateMobileSearchSummary);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMobileSearch();
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    if (mode !== "hotel" && mode !== "villa") return;
    state.mode = mode;
    applyMode();
    renderProperties(state.properties);
  });
});

modeLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    state.mode = link.dataset.navMode === "villa" ? "villa" : "hotel";
    applyMode();
    renderProperties(state.properties);
    document.querySelector("#stays")?.scrollIntoView({ block: "start" });
  });
});

async function initialize() {
  renderLoadingCards();
  await Promise.allSettled([loadDestinations(), loadProperties("")]);
}

async function loadDestinations() {
  try {
    const data = await apiRequest("/v1/public/destinations", {
      cache: "default",
    });
    const destinations = data.destinations || [];
    destinationList.replaceChildren(
      ...destinations.map((destination) => {
        const option = document.createElement("option");
        option.value = destination.city;
        option.label = [destination.city, destination.stateRegion]
          .filter(Boolean)
          .join(", ");
        return option;
      }),
    );
    renderDestinations(destinations);
  } catch {
    destinationRail?.replaceChildren();
    // Property discovery remains usable when destination suggestions are unavailable.
  }
}

function renderDestinations(destinations) {
  if (!destinationRail) return;
  destinationRail.replaceChildren(
    ...destinations.map((destination) => {
      const button = element("button", "destination-card");
      button.type = "button";
      const place = [destination.city, destination.stateRegion]
        .filter(Boolean)
        .join(", ");
      button.setAttribute("aria-label", `Explore stays in ${place}`);
      button.append(
        element(
          "span",
          "destination-mark",
          String(destination.city || "W").trim().charAt(0).toUpperCase(),
        ),
        element("strong", "", destination.city),
        destination.stateRegion
          ? element("small", "", destination.stateRegion)
          : document.createTextNode(""),
      );
      button.addEventListener("click", () => {
        form.destination.value = destination.city;
        updateMobileSearchSummary();
        void loadProperties(destination.city);
        document.querySelector("#stays")?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      });
      return button;
    }),
  );
}

async function loadProperties(destination) {
  resultsTitle.textContent = destination
    ? `${state.mode === "villa" ? "Entire villas" : "Hotels"} around ${destination}`
    : state.mode === "villa"
      ? "Villas reserved only for you"
      : "Hotels you can book by room";
  resultsStatus.textContent = "Finding live Wildleaf properties…";
  renderLoadingCards();

  const query = new URLSearchParams({ limit: "100" });
  if (destination) query.set("destination", destination);

  try {
    const data = await apiRequest(`/v1/public/properties?${query}`, {
      cache: "default",
    });
    state.properties = data.properties || [];
    renderProperties(state.properties);
  } catch (error) {
    renderError(error);
  }
}

function renderProperties(properties) {
  const visibleProperties = properties.filter((property) =>
    saleModeAllows(property.saleMode, state.mode),
  );
  updateHero(visibleProperties);
  results.classList.toggle(
    "single-property-grid",
    visibleProperties.length === 1,
  );
  results.replaceChildren();
  if (!visibleProperties.length) {
    resultsStatus.textContent =
      state.mode === "villa"
        ? "No entire villas match this destination yet."
        : "No hotels match this destination yet.";
    const empty = element("div", "empty-state");
    empty.append(
      element("h3", "", "No stays found"),
      element(
        "p",
        "",
        "Try a nearby city, clear the destination, or switch your stay type.",
      ),
    );
    results.append(empty);
    return;
  }

  resultsStatus.textContent = `${visibleProperties.length} ${state.mode === "villa" ? (visibleProperties.length === 1 ? "villa" : "villas") : visibleProperties.length === 1 ? "hotel" : "hotels"}`;
  visibleProperties.forEach((property, index) =>
    results.append(propertyCard(property, index)),
  );
}

function propertyCard(property, index) {
  const article = element(
    "article",
    `property-card property-card-${state.mode}`,
  );
  const visual = element("div", `property-visual visual-${(index % 4) + 1}`);
  if (property.coverMediaId) {
    const image = element("img", "property-card-image");
    image.src = propertyMediaUrl(property.publicSlug, property.coverMediaId);
    image.alt = property.name;
    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";
    visual.classList.add("has-image");
    visual.append(image);
  }
  visual.append(
    element(
      "span",
      "listing-type-badge",
      state.mode === "villa" ? "Entire villa" : "Hotel rooms",
    ),
    element(
      "span",
      "property-visual-symbol",
      state.mode === "villa" ? "⌂" : "▦",
    ),
  );

  const body = element("div", "property-card-body");
  const location = [property.locality, property.city, property.stateRegion]
    .filter(Boolean)
    .join(", ");
  body.append(
    element("p", "property-location", location || property.countryCode),
    element("h3", "", property.name),
    element(
      "p",
      "property-description",
      property.shortDescription ||
        "A distinctive Wildleaf stay with live availability and secure booking.",
    ),
  );

  const tags = element("div", "property-tags");
  if (property.propertyType)
    tags.append(element("span", "tag", titleCase(property.propertyType)));
  tags.append(
    element(
      "span",
      "tag",
      state.mode === "villa" ? "Exclusive use" : "Book by room",
    ),
  );
  body.append(tags);

  const link = element(
    "a",
    "button button-primary property-cta",
    state.mode === "villa" ? "View entire villa" : "View rooms",
  );
  link.href = propertyUrl(property.publicSlug);
  link.setAttribute("aria-label", `Explore ${property.name}`);
  body.append(link);

  article.append(visual, body);
  return article;
}

function updateHero(properties) {
  const hero = document.querySelector(".home-hero");
  const featured = properties.find((property) => property.coverMediaId);
  if (!hero || !featured) {
    hero?.classList.remove("has-property-image");
    hero?.style.removeProperty("--home-hero-image");
    return;
  }

  hero.style.setProperty(
    "--home-hero-image",
    `url("${propertyMediaUrl(featured.publicSlug, featured.coverMediaId)}")`,
  );
  hero.classList.add("has-property-image");
}

function propertyMediaUrl(publicSlug, mediaId) {
  return `/v1/public/properties/${encodeURIComponent(publicSlug)}/media/${encodeURIComponent(mediaId)}`;
}

function propertyUrl(publicSlug) {
  const params = new URLSearchParams({
    slug: publicSlug,
    arrivalDate: form.arrivalDate.value,
    departureDate: form.departureDate.value,
    rooms: form.rooms.value,
    adults: form.adults.value,
    children: form.children.value,
    mode: state.mode,
  });
  return `/customer/property.html?${params}`;
}

function applyMode() {
  const villa = state.mode === "villa";
  form.classList.toggle("villa-search", villa);
  modeButtons.forEach((button) => {
    const selected = button.dataset.mode === state.mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  roomCountField.classList.toggle("hidden", villa);
  form.rooms.value = villa ? "1" : form.rooms.value || "1";
  document.querySelector("#adultsLabel").textContent = villa
    ? "Adults"
    : "Adults / room";
  document.querySelector("#childrenLabel").textContent = villa
    ? "Children"
    : "Children / room";
  document.querySelector(".search-button").textContent = villa
    ? "Search villas"
    : "Search hotels";
  resultsEyebrow.textContent = villa ? "Entire villas" : "Hotel rooms";
  resultsTitle.textContent = villa
    ? "Villas reserved only for you"
    : "Hotels you can book by room";
  history.replaceState(null, "", `${location.pathname}?mode=${state.mode}`);
  updateMobileSearchSummary();
}

function openMobileSearch() {
  document.body.classList.add("home-search-open");
  mobileSearchTrigger?.setAttribute("aria-expanded", "true");
  window.setTimeout(() => form.destination?.focus(), 50);
}

function closeMobileSearch() {
  document.body.classList.remove("home-search-open");
  mobileSearchTrigger?.setAttribute("aria-expanded", "false");
}

function updateMobileSearchSummary() {
  if (!mobileSearchLabel || !mobileSearchMeta) return;
  const destination = form.destination.value.trim();
  mobileSearchLabel.textContent = destination || "Search destination or stay";

  const adults = Math.max(1, Number(form.adults.value) || 1);
  const children = Math.max(0, Number(form.children.value) || 0);
  const rooms =
    state.mode === "villa" ? 1 : Math.max(1, Number(form.rooms.value) || 1);
  const guestCount = adults + children;
  const dates =
    form.arrivalDate.value && form.departureDate.value
      ? `${shortDate(form.arrivalDate.value)} – ${shortDate(form.departureDate.value)}`
      : "Add dates";
  const roomLabel =
    state.mode === "villa"
      ? "entire villa"
      : `${rooms} ${rooms === 1 ? "room" : "rooms"}`;
  mobileSearchMeta.textContent =
    `${dates} · ${guestCount} ${guestCount === 1 ? "guest" : "guests"} · ${roomLabel}`;
}

function shortDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Add dates";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function saleModeAllows(saleMode, mode) {
  if (mode === "villa")
    return saleMode === "FULL_PROPERTY_ONLY" || saleMode === "BOTH";
  return !saleMode || saleMode === "ROOMS_ONLY" || saleMode === "BOTH";
}

function renderLoadingCards() {
  results.replaceChildren(
    ...Array.from({ length: 3 }, () => {
      const card = element("div", "property-card loading-card");
      card.innerHTML =
        "<div></div><div><span></span><span></span><span></span></div>";
      return card;
    }),
  );
}

function renderError(error) {
  const message =
    error instanceof ApiError
      ? error.message
      : "Properties could not be loaded.";
  resultsStatus.textContent = "Live properties are temporarily unavailable.";
  const panel = element("div", "empty-state");
  panel.append(
    element("h3", "", "We couldn’t load the collection"),
    element("p", "", message),
  );
  const retry = element("button", "button button-secondary", "Try again");
  retry.type = "button";
  retry.addEventListener(
    "click",
    () => void loadProperties(form.destination.value.trim()),
  );
  panel.append(retry);
  results.replaceChildren(panel);
}

function setDefaultDates() {
  const today = new Date();
  const arrival = new Date(today);
  const departure = new Date(today);
  arrival.setDate(today.getDate() + 1);
  departure.setDate(today.getDate() + 3);
  form.arrivalDate.min = dateValue(today);
  form.departureDate.min = dateValue(arrival);
  form.arrivalDate.value = dateValue(arrival);
  form.departureDate.value = dateValue(departure);

  form.arrivalDate.addEventListener("change", () => {
    const minimumDeparture = addDays(form.arrivalDate.value, 1);
    form.departureDate.min = minimumDeparture;
    if (form.departureDate.value <= form.arrivalDate.value) {
      form.departureDate.value = minimumDeparture;
    }
    updateMobileSearchSummary();
  });
  updateMobileSearchSummary();
}

function dateValue(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateValue(date);
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function saleModeLabel(value) {
  return (
    {
      ROOMS_ONLY: "Rooms",
      FULL_PROPERTY_ONLY: "Entire property",
      BOTH: "Rooms or entire property",
    }[value] || titleCase(value)
  );
}
