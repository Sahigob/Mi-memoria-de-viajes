import { demoPlaces, categories } from "./demo-data.js";
import { DEMO_LOCATION, getCurrentPosition } from "./location.js";
import { getNearbyPlaces, getCategoryLabel, getRatingLabel, mapUrl, routeUrl } from "./places.js";
import { groupPlacesByCity } from "./cities.js";
import { discoveryStatus, searchNearbyEstablishments } from "./discovery.js";

let places = demoPlaces.map(place => ({ ...place }));
let currentLocation = { ...DEMO_LOCATION };
let usingRealLocation = false;
let activeCategory = "all";
let discoveryResults = [];
let discoveryMap = null;
let discoveryMarkers = [];
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
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
}
function navigate(view) {
  views.forEach(name => $(`#view-${name}`).classList.toggle("active", name === view));
  $$("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  if (view === "places") renderAllPlaces();
  if (view === "cities") renderCities();
  if (view === "discover" && discoveryMap) setTimeout(() => discoveryMap.invalidateSize(), 120);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderPlace(place, showDistance = false) {
  const category = categories[place.category] || categories.otros;
  const distance = showDistance && Number.isFinite(place.distance) ? `<span class="place-distance">${place.distance.toFixed(1).replace(".",",")} km</span>` : "";
  const note = place.notes ? `<div class="place-note">${escapeHtml(place.notes)}</div>` : "";
  const address = place.address ? escapeHtml(place.address) : escapeHtml(place.city || "");
  const menu = place.menuUrl ? `<a class="menu-link" href="${escapeHtml(place.menuUrl)}" target="_blank" rel="noopener noreferrer">☷ Ver carta</a>` : "";
  const route = `<button class="route-btn" type="button" data-route="${escapeHtml(place.id)}">↗ Ir hasta allí</button>`;
  return `<article class="place-card"><div class="place-symbol">${category.icon}</div><div class="place-info"><strong>${escapeHtml(place.name)}</strong><div class="place-meta"><span>${category.label}</span><span>·</span><span>${address}</span><span>·</span><span>${getRatingLabel(place.rating)}</span></div>${note}${menu}</div>${distance}<div class="place-actions">${route}</div></article>`;
}
function renderNearby(category = activeCategory) {
  activeCategory = category;
  const radius = Number($("#radius-select").value);
  const results = getNearbyPlaces(places, currentLocation, radius, category);
  $("#nearby-title").textContent = category === "all" ? "Lugares guardados cerca" : `${getCategoryLabel(category)} cerca`;
  $("#nearby-subtitle").textContent = usingRealLocation ? `Resultados a menos de ${radius} km de tu ubicación actual.` : "Ejemplos ficticios en Valencia para explorar el funcionamiento.";
  $("#nearby-results").innerHTML = results.length ? results.map(place => renderPlace(place, true)).join("") : `<div class="empty-state"><strong>No hay recuerdos en este radio</strong>Prueba a ampliar la distancia o guarda un lugar en esta zona.</div>`;
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
  $("#all-places").innerHTML = filtered.length ? filtered.map(place => renderPlace(place)).join("") : `<div class="empty-state"><strong>No hay resultados</strong>Prueba otra búsqueda o guarda un nuevo lugar.</div>`;
}
function renderCities() {
  const groups = groupPlacesByCity(places);
  $("#city-list").innerHTML = groups.length ? groups.map(([city,count]) => `<button class="city-card" data-city="${escapeHtml(city)}"><strong>${escapeHtml(city)}</strong><small>Tu memoria en esta localidad</small><span>${count} ${count === 1 ? "lugar guardado" : "lugares guardados"} →</span></button>`).join("") : `<div class="empty-state">Todavía no tienes ciudades guardadas.</div>`;
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
    return true;
  } catch (error) {
    $("#location-status").textContent = error.message;
    toast(error.message);
    return false;
  }
}
function renderDiscoveryMap() {
  const element = $("#discovery-map");
  if (!element || !window.L) return;
  if (!discoveryMap) {
    discoveryMap = L.map(element, { scrollWheelZoom: false }).setView([currentLocation.lat, currentLocation.lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(discoveryMap);
  }
  discoveryMarkers.forEach(marker => marker.remove());
  discoveryMarkers = [];
  const bounds = [];
  if (usingRealLocation) {
    const userMarker = L.circleMarker([currentLocation.lat, currentLocation.lng], {
      radius: 8, color: "#ffffff", weight: 3, fillColor: "#287b58", fillOpacity: 1
    }).addTo(discoveryMap).bindPopup("Tu ubicación");
    discoveryMarkers.push(userMarker);
    bounds.push([currentLocation.lat, currentLocation.lng]);
  }
  discoveryResults.forEach((place, index) => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
    const marker = L.marker([place.lat, place.lng]).addTo(discoveryMap)
      .bindPopup('<strong>' + escapeHtml(place.name) + '</strong><br><button class="map-route-link" data-discovery-route="' + index + '">Ir hasta allí</button>');
    discoveryMarkers.push(marker);
    bounds.push([place.lat, place.lng]);
  });
  if (bounds.length > 1) discoveryMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  else if (bounds.length === 1) discoveryMap.setView(bounds[0], 15);
  setTimeout(() => discoveryMap.invalidateSize(), 120);
}
function renderDiscovery() {
  const container = $("#discovery-results");
  if (!discoveryResults.length) {
    container.innerHTML = `<div class="empty-state"><strong>No hay establecimientos para mostrar</strong>Prueba con otro radio o categoría, o busca en otra zona.</div>`;
    return;
  }
  container.innerHTML = discoveryResults.map((place,index) => {
    const category = categories[place.category] || categories.otros;
    const address = place.address || place.city || "Dirección no disponible en OpenStreetMap";
    const extra = [place.openingHours ? `Horario: ${escapeHtml(place.openingHours)}` : "", place.website ? `<a href="${escapeHtml(place.website)}" target="_blank" rel="noopener noreferrer">Web</a>` : ""].filter(Boolean).join(" · ");
    return `<article class="discovery-card"><div class="place-symbol">${category.icon}</div><div class="place-info"><strong>${escapeHtml(place.name)}</strong><div class="place-meta"><span>${category.label}</span><span>·</span><span>${escapeHtml(address)}</span><span>·</span><b>${place.distance.toFixed(1).replace(".",",")} km</b></div>${extra ? `<div class="place-note">${extra}</div>` : ""}<div class="discovery-actions"><button class="outline-btn" data-discovery-map="${index}">Ver en mapa</button><button class="route-btn" data-discovery-route="${index}">↗ Ir hasta allí</button><button class="primary-btn" data-save-discovery="${index}">＋ Guardar en Mis sitios</button></div></div></article>`;
  }).join("");
  renderDiscoveryMap();
}
async function searchDiscovery() {
  const button = $("#search-discovery-btn");
  const status = $("#discovery-status");
  const radius = Number($("#discovery-radius").value);
  const category = $("#discovery-category").value;
  button.disabled = true;
  button.textContent = "Buscando…";
  status.textContent = "Consultando OpenStreetMap. Puede tardar unos segundos…";
  $("#discovery-results").innerHTML = "";
  try {
    discoveryResults = await searchNearbyEstablishments(currentLocation, radius, category);
    renderDiscovery();
    status.textContent = `Se han encontrado ${discoveryResults.length} establecimientos en un radio de ${radius} km. Resultados basados en los datos disponibles de OpenStreetMap.`;
  } catch (error) {
    discoveryResults = [];
    $("#discovery-results").innerHTML = `<div class="empty-state"><strong>No se pudo completar la búsqueda</strong>${escapeHtml(error.message)} Puedes volver a intentarlo en unos instantes.</div>`;
    status.textContent = "La búsqueda no está disponible ahora mismo.";
  } finally {
    button.disabled = false;
    button.textContent = "Buscar establecimientos";
  }
}
function prepareSaveDiscovery(index) {
  const place = discoveryResults[index];
  if (!place) return;
  const form = $("#place-form");
  form.elements.name.value = place.name;
  form.elements.category.value = place.category;
  form.elements.city.value = place.city || "";
  form.elements.address.value = place.address || "";
  form.elements.lat.value = place.lat.toFixed(6);
  form.elements.lng.value = place.lng.toFixed(6);
  form.elements.rating.value = "like";
  form.elements.notes.value = "Encontrado mediante OpenStreetMap. Añade aquí tu comentario personal.";
  $("#place-dialog").showModal();
}
function bindEvents() {
  $$("[data-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
  $$(".category-card").forEach(button => button.addEventListener("click", () => renderNearby(button.dataset.category)));
  $("#locate-btn").addEventListener("click", locate);
  $("#discover-location-btn").addEventListener("click", async () => {
    if (await locate()) await searchDiscovery();
  });
  $("#search-discovery-btn").addEventListener("click", searchDiscovery);
  $("#radius-select").addEventListener("change", () => renderNearby());
  $("#reset-demo-location").addEventListener("click", () => {
    currentLocation = { ...DEMO_LOCATION }; usingRealLocation = false;
    $("#location-name").textContent = DEMO_LOCATION.label;
    $("#location-status").textContent = "Ejemplo para probar la aplicación. Activa tu GPS cuando quieras.";
    renderNearby("all");
  });
  $("#show-all-nearby").addEventListener("click", () => renderNearby("all"));
  $("#add-place-top").addEventListener("click", () => $("#place-dialog").showModal());
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
    if ((lat === null) !== (lng === null)) { toast("Introduce las dos coordenadas o deja ambas vacías."); return; }
    places.unshift({ id: `temp-${Date.now()}`, name: String(data.get("name")).trim(), category: data.get("category"), city: String(data.get("city")).trim(), address: String(data.get("address")).trim(), lat, lng, rating: data.get("rating"), notes: String(data.get("notes")).trim(), menuUrl: String(data.get("menuUrl") || "").trim(), date: new Date().toISOString().slice(0,10) });
    form.reset(); $("#place-dialog").close(); renderNearby("all"); renderAllPlaces(); renderCities();
    toast("Lugar añadido temporalmente a Mis sitios.");
  });
  document.addEventListener("click", event => {
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) { const place = places.find(item => item.id === routeButton.dataset.route); if (place) window.open(routeUrl(place), "_blank", "noopener"); }
    const discoveryRoute = event.target.closest("[data-discovery-route]");
    if (discoveryRoute) { const place = discoveryResults[Number(discoveryRoute.dataset.discoveryRoute)]; if (place) window.open(routeUrl(place), "_blank", "noopener"); }
    const mapButton = event.target.closest("[data-map]");
    if (mapButton) {
      const place = places.find(item => item.id === mapButton.dataset.map);
      if (place && Number.isFinite(place.lat) && Number.isFinite(place.lng)) window.open(mapUrl(place), "_blank", "noopener");
      else toast("Este lugar todavía no tiene coordenadas GPS.");
    }
    const cityButton = event.target.closest("[data-city]");
    if (cityButton) { navigate("places"); $("#place-search").value = cityButton.dataset.city; renderAllPlaces(); }
    const discoveryMap = event.target.closest("[data-discovery-map]");
    if (discoveryMap) {
      const place = discoveryResults[Number(discoveryMap.dataset.discoveryMap)];
      if (place) window.open(mapUrl(place), "_blank", "noopener");
    }
    const saveButton = event.target.closest("[data-save-discovery]");
    if (saveButton) prepareSaveDiscovery(Number(saveButton.dataset.saveDiscovery));
  });
}
function init() {
  const status = discoveryStatus();
  $("#view-discover .info-card p").textContent = status.message + " Los resultados nuevos se mantendrán separados de tus lugares guardados.";
  $("#view-discover .discover-panel p").textContent = "Busca restaurantes, cafeterías, alojamientos, tiendas, gasolineras y otros lugares reales alrededor de ti.";
  $("#view-discover .discover-panel button").textContent = "⌖ Detectar ubicación y buscar";
  const controls = document.createElement("div");
  controls.className = "discovery-toolbar";
  controls.innerHTML = `<label>Tipo de lugar<select id="discovery-category"><option value="all">Todas las categorías</option><option value="comer">Restaurantes y bares</option><option value="cafe">Cafeterías y panaderías</option><option value="dormir">Alojamientos</option><option value="comprar">Tiendas</option><option value="gasolinera">Gasolineras</option><option value="otros">Otros lugares</option></select></label><label>Distancia<select id="discovery-radius"><option value="1">1 km</option><option value="3">3 km</option><option value="5" selected>5 km</option><option value="10">10 km</option><option value="20">20 km</option><option value="30">30 km</option></select></label><button class="primary-btn" id="search-discovery-btn">Buscar establecimientos</button></div><p class="discovery-status" id="discovery-status" aria-live="polite">Pulsa el botón para consultar los establecimientos cercanos.</p><div class="map-section"><div class="map-section-heading"><strong>Mapa de establecimientos</strong><span>Selecciona un marcador para ver el lugar.</span></div><div id="discovery-map" aria-label="Mapa de establecimientos cercanos"></div></div><div class="discovery-results place-list" id="discovery-results"></div><p class="osm-attribution">Datos cartográficos y de establecimientos: © OpenStreetMap contributors.</p>`;
  $("#view-discover .info-card").before(controls);
  bindEvents(); renderNearby("all"); renderAllPlaces(); renderCities();
}
init();
