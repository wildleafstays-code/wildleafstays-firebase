import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeHtml = await readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);
const homeSource = await readFile(
  new URL("../app.js", import.meta.url),
  "utf8",
);
const entirePropertyHtml = await readFile(
  new URL("../entire-properties.html", import.meta.url),
  "utf8",
);
const entirePropertySource = await readFile(
  new URL("../entire-properties.js", import.meta.url),
  "utf8",
);

const propertyHtml = await readFile(
  new URL("../property.html", import.meta.url),
  "utf8",
);
const propertySource = await readFile(
  new URL("../property.js", import.meta.url),
  "utf8",
);

test("booking style remains independent from database Property Category", () => {
  assert.match(homeHtml, /id="modeAll"/);
  assert.match(homeHtml, /id="modeHotel"/);
  assert.match(homeHtml, /id="modeVilla"/);
  assert.match(homeHtml, />Book by room</);
  assert.match(homeHtml, />Entire property</);
  assert.match(homeSource, /saleModeAllows/);
  assert.match(homeSource, /ROOMS_ONLY/);
  assert.match(homeSource, /FULL_PROPERTY_ONLY/);
  assert.match(homeSource, /function bookingModeForProperty\(property\)/);
  assert.match(homeSource, /mode: bookingModeForProperty\(property\)/);
  assert.match(homeSource, /if \(mode === "all"\) return true/);
});

test("homepage categories, sliders and filters are generated from database taxonomy", () => {
  assert.match(homeHtml, /id="propertyCategory"[^>]*name="propertyCategoryId"/);
  assert.match(homeHtml, /id="propertyType"[^>]*name="propertyTypeId"/);
  assert.match(homeHtml, /class="property-category-sections"/);
  assert.match(homeSource, /\/v1\/public\/property-taxonomy/);
  assert.match(homeSource, /function renderPropertyTaxonomyFilters\(\)/);
  assert.match(homeSource, /query\.set\("categoryId", categoryId\)/);
  assert.match(homeSource, /query\.set\("typeId", typeId\)/);
  assert.match(homeSource, /category\.homepageHeading \|\| category\.name/);
  assert.match(homeSource, /if \(!categoryProperties\.length\) continue/);
  assert.match(homeSource, /property-category-rail/);
  assert.match(propertySource, /property\.propertyCategoryName/);
  assert.match(propertySource, /property\.propertyTypeName/);

  const combined = `${homeHtml}\n${homeSource}\n${entirePropertyHtml}\n${entirePropertySource}`;
  assert.doesNotMatch(
    combined,
    /Hotels & Resorts|Villas & Homestays|Cabins & Unique Stays|Glamping & Nature Stays|Heritage & Special Stays/,
  );
});

test("homepage discovery removes redundant heading layers and keeps live categories primary", () => {
  assert.match(homeHtml, /id="destinationHeading">Destinations</);
  assert.doesNotMatch(homeHtml, /Pick a destination/);
  assert.doesNotMatch(homeHtml, /Stay collections/);
  assert.doesNotMatch(homeHtml, /Explore Wildleaf/);
  assert.match(homeSource, /element\("h2", "", category\.homepageHeading \|\| category\.name\)/);
  assert.match(homeSource, /\.filter\(\(category\) => category\.enabled\)/);
  assert.doesNotMatch(homeSource, /homepageVisible/);
  assert.match(homeSource, /if \(!categoryProperties\.length\) continue/);
});

test("Entire Property opens a dedicated live catalogue grouped alphabetically by destination", () => {
  assert.match(
    homeHtml,
    /id="modeVilla"[\s\S]*href="\/customer\/entire-properties\.html"/,
  );
  assert.match(entirePropertyHtml, /id="entirePropertyFilters"/);
  assert.match(entirePropertyHtml, /id="catalogDestination"/);
  assert.match(entirePropertyHtml, /id="catalogCategory"/);
  assert.match(entirePropertyHtml, /id="catalogType"/);
  assert.match(entirePropertySource, /\/v1\/public\/property-taxonomy/);
  assert.match(entirePropertySource, /\/v1\/public\/properties/);
  assert.match(entirePropertySource, /property\.saleMode === "FULL_PROPERTY_ONLY"/);
  assert.match(entirePropertySource, /property\.saleMode === "BOTH"/);
  assert.match(entirePropertySource, /const locations = \[\.\.\.grouped\.keys\(\)\]\.sort\(collator\.compare\)/);
  assert.match(entirePropertySource, /sort\(\(left, right\) => collator\.compare\(left\.name, right\.name\)\)/);
  assert.match(entirePropertySource, /className = "catalog-location-section"|catalog-location-section/);
  assert.match(entirePropertySource, /mode: "villa"/);
});

test("property booking shows only the product selected by the guest", () => {
  assert.match(propertyHtml, /id="bookingModeBadge"/);
  assert.match(propertyHtml, /id="unitCountField"/);
  assert.match(propertySource, /expectedProductType/);
  assert.match(propertySource, /"FULL_PROPERTY"\s*:\s*"ROOM_CATEGORY"/);
  assert.match(propertySource, /state\.bookingMode === "villa"\) count = 1/);
});

test("entire-property presentation explicitly uses the shared room source", () => {
  assert.match(propertySource, /One entire stay, one shared inventory/);
  assert.match(propertySource, /calculated from the room categories below/);
  assert.doesNotMatch(propertySource, /villaBaseRate|separateVillaRate/);
});

test("property page loads inventory automatically and offers direct booking", () => {
  assert.doesNotMatch(propertyHtml, /id="availabilityButton"/);
  assert.doesNotMatch(propertyHtml, />\s*Check availability\s*</);
  assert.doesNotMatch(propertyHtml, /Available rooms and rates/);
  assert.match(propertyHtml, /class="[^"]*availability-form/);
  assert.match(propertySource, /searchAvailability\(\{ resetBooking: false \}\)/);
  assert.match(propertySource, /function scheduleAvailabilitySearch\(\)/);
  assert.match(propertySource, /"Book now"/);
  assert.match(propertySource, /GST and any additional fees shown before payment/);
  assert.doesNotMatch(propertySource, /GST and mandatory fees shown before payment/);
  assert.match(propertySource, /async function startBooking\(option, button\)/);
  assert.match(propertySource, /await createHold\(null, \{ scrollToGuest: true \}\)/);
  assert.doesNotMatch(propertySource, /"Get exact price"/);
});

test("property search defaults to today, one night, one room and two adults", () => {
  assert.match(propertySource, /const defaultArrival = today/);
  assert.match(propertySource, /: addDays\(arrival, 1\)/);
  assert.match(propertySource, /query\.get\("rooms"\) \|\| 1/);
  assert.match(propertySource, /query\.get\("adults"\) \|\| 2/);
});

test("hotel room categories are not repeated in the property summary", () => {
  assert.match(propertySource, /Repeating them in the property summary makes the page noisy/);
  assert.doesNotMatch(propertySource, /const card = element\("article", "room-category-summary"\)/);
});

test("available rates use OTA-style room facts and calendar-backed totals", () => {
  assert.match(propertySource, /ota-rate-card/);
  assert.match(propertySource, /category\.maxOccupancy/);
  assert.match(propertySource, /mealPlanLabel/);
  assert.match(propertySource, /option\.estimatedTotalMinor/);
  assert.match(propertySource, /GST and any additional fees shown before payment/);
});


test("property page presents published property media as an immersive photo tour", () => {
  assert.match(propertyHtml, /id="propertyGallery"/);
  assert.match(propertyHtml, /id="propertyPhotoDialog"/);
  assert.match(propertySource, /function renderPropertyGallery\(property\)/);
  assert.match(propertySource, /property\.media \|\| \[\]/);
  assert.match(propertySource, /View all \$\{media\.length\} photos/);
  assert.match(propertySource, /function propertyMediaUrl\(mediaId\)/);
});


test("hotel property page can book smart recommendations through canonical checkout", () => {
  assert.match(propertyHtml, /id="smartMatchSection"/);
  assert.match(propertyHtml, /id="smartRecommendations"/);
  assert.match(propertySource, /room-recommendations/);
  assert.match(propertySource, /function partyTotals\(\)/);
  assert.match(propertySource, /childAges: state\.units\.flatMap/);
  assert.match(propertySource, /function smartRecommendationCard\(/);
  assert.match(propertySource, /function startRecommendedBooking\(/);
  assert.match(propertySource, /Book this recommendation/);
  assert.match(propertySource, /room-mixes\/quotes/);
  assert.match(propertySource, /function renderRoomMixQuote\(/);
  assert.match(propertySource, /function createRoomMixHold\(/);
  assert.match(propertySource, /room-mixes\/\$\{state\.roomMixQuote\.id\}\/hold/);
  assert.match(propertySource, /room-mixes\/\$\{roomMixQuoteId\}\/checkout/);
  assert.match(propertySource, /state\.roomMixQuote/);
  assert.match(propertySource, /Estimated room and extra-guest total/);

  // Same-category recommendations must continue through the mature standard quote path.
  assert.match(propertySource, /recommendation\.items\.length === 1/);
  assert.match(propertySource, /\/quotes/);

  // Browser still never verifies Razorpay signatures itself.
  assert.doesNotMatch(propertySource, /razorpay_payment_id/);
  assert.doesNotMatch(propertySource, /razorpay_signature/);
});


test("property shopping starts with photography and keeps identity below the gallery", () => {
  const galleryIndex = propertyHtml.indexOf('id="propertyGallery"');
  const propertyNameIndex = propertyHtml.indexOf('id="propertyName"');
  assert.ok(galleryIndex >= 0);
  assert.ok(propertyNameIndex > galleryIndex);
  assert.doesNotMatch(propertyHtml, /class="property-hero"/);
  assert.doesNotMatch(propertyHtml, /class="booking-assurance"/);
  assert.match(propertySource, /media\.slice\(0, 5\)/);
  assert.match(propertySource, /gallery-count-/);
});

test("hotel rates are grouped into one horizontal shopping card per room category", () => {
  assert.match(propertyHtml, /room-category-rail/);
  assert.match(propertySource, /function groupRoomOptions\(options\)/);
  assert.match(propertySource, /function roomCategoryCard\(category, options, nights\)/);
  assert.match(propertySource, /rate-plan-list/);
  assert.match(propertySource, /rate-plan-choice/);
  assert.match(propertySource, /mealPlanLabel\(option\.mealPlanCode\)/);
  assert.match(propertySource, /function renderRoomAllocationControls\(category, selection\)/);
  assert.match(propertySource, /Who is staying in this room\?/);
});

test("manual room shopping uses one sticky selection ribbon and canonical checkout paths", () => {
  assert.match(propertyHtml, /id="selectionRibbon"/);
  assert.match(propertyHtml, /id="selectionContinue"/);
  assert.match(propertySource, /function renderSelectionRibbon\(\)/);
  assert.match(propertySource, /function continueRoomSelection\(button\)/);
  assert.match(propertySource, /"manual-room-quote"/);
  assert.match(propertySource, /"manual-room-mix-quote"/);
  assert.match(propertySource, /room-mixes\/quotes/);
  assert.match(propertySource, /await createRoomMixHold\(\{ scrollToGuest: true \}\)/);
  assert.match(propertySource, /await createHold\(null, \{ scrollToGuest: true \}\)/);
});

test("Wildleaf Match stays out of simple searches and is collapsible for complex groups", () => {
  assert.match(propertyHtml, /<details\s+id="smartMatchSection"/);
  assert.match(propertySource, /const complexSearch =/);
  assert.match(
    propertySource,
    /requestedRooms > 1 \|\| totals\.adults \+ totals\.children > 2/,
  );
  assert.match(propertySource, /smartMatchSection\.open = false/);
});

test("room shopping keeps Razorpay verification server-side", () => {
  assert.doesNotMatch(propertySource, /razorpay_payment_id/);
  assert.doesNotMatch(propertySource, /razorpay_signature/);
});


test("liked horizontal room-card presentation remains the shopping baseline", () => {
  assert.match(propertyHtml, /room-category-rail/);
  assert.match(propertySource, /room-category-card ota-rate-card/);
  assert.match(propertySource, /room-category-visual/);
  assert.match(propertySource, /rate-plan-list/);
  assert.match(propertySource, /rate-plan-choice/);
  assert.match(propertySource, /room-allocation-section/);
  assert.match(propertyHtml, /id="selectionRibbon"/);
});

test("room count stays independent from the master travelling party", () => {
  assert.match(propertyHtml, /id="guestSummary"/);
  assert.match(propertySource, /state\.units = \[\s*\{\s*adults,/s);
  assert.match(propertySource, /function setUnitCount\(count\)/);
  assert.doesNotMatch(
    propertySource,
    /function setUnitCount\(count\)[\s\S]{0,500}Array\.from/,
  );
  assert.match(
    propertySource,
    /state\.bookingMode === "villa"[\s\S]*: \[\{ adults: 1, children: 0 \}\]/,
  );
});

test("multi-room shopping discovers categories independently and exposes live stock", () => {
  assert.match(propertySource, /function refreshCategoryAvailabilityCounts\(/);
  assert.match(propertySource, /function probeCategoryAvailability\(/);
  assert.match(propertySource, /function categoryAvailabilityLabel\(/);
  assert.match(propertySource, /room-stock-badge/);
  assert.match(propertySource, /Only 1 room available/);
  assert.match(propertySource, /rooms available/);
  assert.match(propertySource, /totalSelectedRooms\(\) < requestedRoomCount\(\)/);
});

test("room allocation dynamically caps adults and occupancy-counting children", () => {
  assert.match(propertySource, /function roomAdultMaximum\(category, unit\)/);
  assert.match(propertySource, /function roomChildMaximum\(category, unit\)/);
  assert.match(propertySource, /function roomUnitValid\(category, unit\)/);
  assert.match(propertySource, /integerSelect\(unit\.adults, 1, adultMaximum\)/);
  assert.match(
    propertySource,
    /integerSelect\(unit\.childAges\.length, 0, childMaximum\)/,
  );
  assert.match(propertySource, /children\.disabled = childMaximum === 0/);
  assert.match(propertySource, /ageOption\.disabled = !roomUnitValid/);
  assert.match(propertySource, /unit\.adults < 1/);
});

test("party mismatch is soft while room count occupancy stock and live pricing remain hard", () => {
  assert.match(propertySource, /function partyMismatchMessage\(/);
  assert.match(propertySource, /You can continue if this is intentional/);
  assert.match(propertySource, /warning: mismatch/);
  assert.match(propertySource, /selectionContinue\.disabled = !validation\.valid/);
  assert.match(propertySource, /exceeds its maximum occupancy/);
  assert.match(propertySource, /currently available/);
  assert.match(propertySource, /One selected room is no longer available/);
});

test("infant occupancy classification is isolated from exact quote child ages", () => {
  assert.match(propertySource, /function infantMaxAgeForUi\(\)/);
  assert.match(propertySource, /state\.property\?\.guestAgePolicy/);
  assert.match(propertySource, /return 5/);
  assert.match(propertySource, /function availabilityChildrenForUnit\(unit\)/);
  assert.match(propertySource, /childAges: \[\.\.\.unit\.childAges\]/);
});


test("Wildleaf Match sends the guest requested room count instead of inventing extra rooms", () => {
  assert.match(propertySource, /const requestedRooms = requestedRoomCount\(\)/);
  assert.match(propertySource, /requestedRooms,/);
  assert.match(propertySource, /!complexSearch \|\| requestedRooms > 6/);
});


test("homepage uses one fluid desktop search rail and a compact mobile search trigger", () => {
  assert.match(homeHtml, /id="mobileSearchTrigger"/);
  assert.match(homeHtml, /class="search-guest-group"/);
  assert.match(homeHtml, /id="destinationRail"/);
  assert.match(homeSource, /function openMobileSearch\(\)/);
  assert.match(homeSource, /function closeMobileSearch\(\)/);
  assert.match(homeSource, /function updateMobileSearchSummary\(\)/);
  assert.match(homeSource, /function renderDestinations\(destinations\)/);
});

test("managed homepage heroes can be image-only without automatic fallback copy", () => {
  assert.match(homeSource, /heroEyebrow\.classList\.add\("hidden"\)/);
  assert.match(
    homeSource,
    /heroHeadline\.classList\.toggle\("hidden", !slide\.headline\)/,
  );
  assert.match(
    homeSource,
    /heroSubtitle\.classList\.toggle\("hidden", !slide\.subtitle\)/,
  );
  assert.doesNotMatch(
    homeSource,
    /Handpicked stays with live availability and secure booking\./,
  );
});

test("room category photo action uses the room's own published media collection", () => {
  assert.match(propertySource, /category\.media \|\| \[\]/);
  assert.match(propertySource, /function openPhotoCollection\(media, index = 0\)/);
  assert.match(propertySource, /state\.photoMedia/);
  assert.match(propertySource, /openPhotoCollection\(roomMedia, 0\)/);
});


test("homepage supports managed hero campaigns and destination photography without changing booking search", () => {
  assert.match(homeHtml, /id="heroImage"/);
  assert.match(homeHtml, /id="heroOffer"/);
  assert.match(homeHtml, /id="heroSliderControls"/);
  assert.match(homeHtml, /id="heroDots"/);
  assert.match(homeSource, /\/v1\/public\/homepage/);
  assert.match(homeSource, /function renderManagedHero\(index\)/);
  assert.match(homeSource, /function resetHeroTimer\(\)/);
  assert.match(homeSource, /homepageMediaUrl\(destination\.imageId\)/);
  assert.match(homeSource, /destination-card-image/);
  assert.match(homeSource, /if \(state\.heroSlides\.length\) return;/);
  assert.match(homeSource, /loadDestinations\(\)/);
});
