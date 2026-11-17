import { demoPlaces, categories } from "./demo-data.js";
import { DEMO_LOCATION, getCurrentPosition } from "./location.js";
import { getNearbyPlaces, getCategoryLabel, getRatingLabel, mapUrl } from "./places.js";
import { groupPlacesByCity } from "./cities.js";
import { discoveryStatus } from "./discovery.js";

let places = demoPlaces.map(place => ({ ...place }));
let currentLocation = { ...DEMO_LOCATION };
let usingRealLocation = false;
let activeCategory = "all";
let toastTimer;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const views = ["nearby","places","discover","cities","settings"];

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 3000);
}

function navigate(view) {
  views.forEach(name => $(`#view-${name}`).classList.toggle("active", name === view));
  $$("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  if (view === "places") renderAllPlaces();
  if (view === "cities") renderCities();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderPlace(place, showDistance = false) {
  const category = categories[place.category] || categories.otros;
  const distance = showDistance && Number.isFinite(place.distance) ? `<span class="place-distance">${place.distance.toFixed(1).replace(".",",")} km</span>` : "";
  const note = place.notes ? `<div class="place-note">${escapeHtml(place.notes)}</div>` : "";
  const address = place.address ? escapeHtml(place.address) : escapeHtml(place.city || "");
  return `<article class="place-card">
    <div class="place-symbol">${category.icon}</div>
    <div class="place-info"><strong>${escapeHtml(place.name)}</strong>
      <div class="place-meta"><span>${category.label}</span><span>·</span><span>${address}</span><span>·</span><span>${getRatingLabel(place.rating)}</span></div>
      ${note}
    </div>${distance}
    <div class="place-actions"><button class="icon-btn" title="Abrir en Google Maps" data-map="${place.id}">↗</button></div>
  </article>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
}

function renderNearby(category = activeCategory) {
  activeCategory = category;
  const radius = Number($("#radius-select").value);
  const results = getNearbyPlaces(places, currentLocation, radius, category);
  $("#nearby-title").textContent = category === "all" ? "Lugares guardados cerca" : `${getCategoryLabel(category)} cerca`;
  $("#nearby-subtitle").textContent = usingRealLocation
    ? `Resultados a menos de ${radius} km de tu ubicación actual.`
    : "Ejemplos ficticios en Valencia para explorar el funcionamiento.";
  $("#nearby-results").innerHTML = results.length
    ? results.map(place => renderPlace(place, true)).join("")
    : `<div class="empty-state"><strong>No hay recuerdos en este radio</strong>Prueba a ampliar la distancia o guarda un lugar en esta zona.</div>`;
  $$(".category-card").forEach(button => button.classList.toggle("selected", button.dataset.category === category));
}

function renderAllPlaces() {
  const query = ($("#place-search").value || "").toLocaleLowerCase("es");
  const category = $("#place-category-filter").value;
  const filtered = places.filter(place => {
    const searchable = `${place.name} ${place.city} ${place.address} ${place.notes}`.toLocaleLowerCase("es");
    return searchable.includes(query) && (category === "all" || place.category === category);
  });
  $("#places-summary").innerHTML = `<div class="summary-chip"><strong>${places.length}</strong> lugares guardados</div><div class="summary-chip"><strong>${new Set(places.map(p=>p.city)).size}</strong> ciudades</div>`;
  $("#all-places").innerHTML = filtered.length ? filtered.map(place => renderPlace(place)).join("") :
    `<div class="empty-state"><strong>No hay resultados</strong>Prueba otra búsqueda o guarda un nuevo lugar.</div>`;
}

function renderCities() {
  const groups = groupPlacesByCity(places);
  $("#city-list").innerHTML = groups.length ? groups.map(([city,count]) =>
    `<button class="city-card" data-city="${escapeHtml(city)}"><strong>${escapeHtml(city)}</strong><small>Tu memoria en esta localidad</small><span>${count} ${count === 1 ? "lugar guardado" : "lugares guardados"} →</span></button>`
  ).join("") : `<div class="empty-state">Todavía no tienes ciudades guardadas.</div>`;
}

async function locate() {
  $("#location-status").textContent = "Solicitando permiso de ubicación al navegador…";
  try {
    currentLocation = await getCurrentPosition();
    usingRealLocation = true;
    $("#location-name").textContent = currentLocation.label;
    $("#location-status").textContent = "Ubicación obtenida ahora. Solo se utiliza mientras consultas la aplicación.";
    renderNearby("all");
    toast("Ubicación actualizada.");
  } catch (error) {
    $("#location-status").textContent = error.message;
    toast(error.message);
  }
}

function openAddDialog() {
  $("#place-dialog").showModal();
}

function bindEvents() {
  $$("[data-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
  $$(".category-card").forEach(button => button.addEventListener("click", () => renderNearby(button.dataset.category)));
  $("#locate-btn").addEventListener("click", locate);
  $("#discover-location-btn").addEventListener("click", locate);
  $("#radius-select").addEventListener("change", () => renderNearby());
  $("#reset-demo-location").addEventListener("click", () => {
    currentLocation = { ...DEMO_LOCATION };
    usingRealLocation = false;
    $("#location-name").textContent = DEMO_LOCATION.label;
    $("#location-status").textContent = "Ejemplo para probar la aplicación. Activa tu GPS cuando quieras.";
    renderNearby("all");
  });
  $("#show-all-nearby").addEventListener("click", () => renderNearby("all"));
  $("#add-place-top").addEventListener("click", openAddDialog);
  $("#place-search").addEventListener("input", renderAllPlaces);
  $("#place-category-filter").addEventListener("change", renderAllPlaces);
  $("#close-dialog").addEventListener("click", () => $("#place-dialog").close());
  $("#cancel-dialog").addEventListener("click", () => $("#place-dialog").close());
  $("#use-current-location").addEventListener("click", async () => {
    try {
      const location = await getCurrentPosition();
      $("#place-form").elements.lat.value = location.lat.toFixed(6);
      $("#place-form").elements.lng.value = location.lng.toFixed(6);
      toast("Coordenadas añadidas al formulario.");
    } catch (error) { toast(error.message); }
  });
  $("#place-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lat = data.get("lat") === "" ? null : Number(data.get("lat"));
    const lng = data.get("lng") === "" ? null : Number(data.get("lng"));
    if ((lat === null) !== (lng === null)) {
      toast("Introduce las dos coordenadas o deja ambas vacías.");
      return;
    }
    places.unshift({
      id: `temp-${Date.now()}`, name: String(data.get("name")).trim(),
      category: data.get("category"), city: String(data.get("city")).trim(),
      address: String(data.get("address")).trim(), lat, lng,
      rating: data.get("rating"), notes: String(data.get("notes")).trim(),
      date: new Date().toISOString().slice(0,10)
    });
    form.reset();
    $("#place-dialog").close();
    renderNearby("all");
    renderAllPlaces();
    toast("Lugar añadido temporalmente a Mis sitios.");
  });
  document.addEventListener("click", event => {
    const mapButton = event.target.closest("[data-map]");
    if (mapButton) {
      const place = places.find(item => item.id === mapButton.dataset.map);
      if (place && Number.isFinite(place.lat) && Number.isFinite(place.lng)) window.open(mapUrl(place), "_blank", "noopener");
      else toast("Este lugar todavía no tiene coordenadas GPS.");
    }
    const cityButton = event.target.closest("[data-city]");
    if (cityButton) {
      navigate("places");
      $("#place-search").value = cityButton.dataset.city;
      renderAllPlaces();
    }
  });
}

function init() {
  const status = discoveryStatus();
  $("#view-discover .info-card p").textContent = status.message + " Los resultados nuevos se mantendrán separados de tus lugares guardados.";
  bindEvents();
  renderNearby("all");
  renderAllPlaces();
  renderCities();
}
init();
