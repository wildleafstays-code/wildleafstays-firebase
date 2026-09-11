import { apiRequest } from "./api-client.js";

const params = new URLSearchParams(location.search);
const publicSlug = String(params.get("slug") || "").trim().toLowerCase();
const requestedMode = params.get("mode") === "villa" ? "villa" : "hotel";
const switchLink = document.querySelector("#entirePropertySwitch");
const backLink = document.querySelector("#backToResults");

if (backLink) {
  backLink.href =
    requestedMode === "villa"
      ? "/customer/entire-properties.html"
      : "/customer/";
}

if (publicSlug && switchLink && requestedMode !== "villa") {
  void configureEntirePropertySwitch();
}

async function configureEntirePropertySwitch() {
  try {
    const data = await apiRequest(
      `/v1/public/properties/${encodeURIComponent(publicSlug)}`,
      { cache: "default" },
    );
    if (data.property?.saleMode !== "BOTH") return;

    const villaParams = new URLSearchParams(location.search);
    villaParams.set("slug", publicSlug);
    villaParams.set("mode", "villa");
    villaParams.set("rooms", "1");
    switchLink.href = `/customer/property.html?${villaParams}`;
    switchLink.classList.remove("hidden");
  } catch {
    // The main property experience remains fully usable if this optional
    // cross-mode navigation cannot be resolved.
  }
}
