import { categories } from "./demo-data.js";
import { getCurrentPosition } from "./location.js";
import { auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, collection, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "./firebase.js";
import { getNearbyPlaces, getCategoryLabel, getRatingLabel, mapUrl, routeUrl } from "./places.js";
import { groupPlacesByCity } from "./cities.js";
import { discoveryStatus, searchNearbyEstablishments } from "./discovery.js";

let places = [];
let currentUser = null;
let editingPlaceId = null;
let currentLocation = null;
let usingRealLocation = false;
let activeCategory = "all";
let discoveryResults = [];
let discoveryMap = null;
let discoveryMarkers = [];
let toastTimer;
let pendingShareId = new URLSearchParams(window.location.search).get("share");
let pendingSharedPlace = null;
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
  const statusLabels = { planned: "Por visitar", visited: "Visitado", favorite: "Favorito" };
  const status = statusLabels[place.status || "visited"] || "Visitado";
  const route = `<button class="route-btn" type="button" data-route="${escapeHtml(place.id)}">↗ Ir hasta allí</button>`;
  const edit = `<button class="place-edit-btn" type="button" data-edit-place="${escapeHtml(place.id)}" aria-label="Editar ${escapeHtml(place.name)}">✎ Editar</button>`;
  const remove = `<button class="place-delete-btn" type="button" data-delete-place="${escapeHtml(place.id)}" aria-label="Eliminar ${escapeHtml(place.name)}">Eliminar</button>`;
  const share = `<button class="place-share-btn" type="button" data-share-place="${escapeHtml(place.id)}">↗ Compartir</button>`;
  return `<article class="place-card"><div class="place-symbol">${category.icon}</div><div class="place-info"><strong>${escapeHtml(place.name)}</strong><div class="place-meta"><span>${category.label}</span><span>·</span><span>${address}</span><span>·</span><span>${getRatingLabel(place.rating)}</span><span class="place-status ${place.status || "visited"}">${status}</span></div>${note}${menu}<div class="place-inline-actions">${share}</div></div>${distance}<div class="place-actions">${route}${edit}${remove}</div></article>`;
}
function renderNearby(category = activeCategory) {
  activeCategory = category;
  const radius = Number($("#radius-select").value);
  const results = usingRealLocation ? getNearbyPlaces(places, currentLocation, radius, category) : [];
  $("#nearby-title").textContent = category === "all" ? "Lugares guardados cerca" : `${getCategoryLabel(category)} cerca`;
  $("#nearby-subtitle").textContent = usingRealLocation ? `Resultados a menos de ${radius} km de tu ubicación actual.` : "Activa tu ubicación cuando quieras consultar tus recuerdos cercanos.";
  $("#nearby-results").innerHTML = results.length ? results.map(place => renderPlace(place, true)).join("") : `<div class="empty-state"><strong>${usingRealLocation ? "No hay recuerdos en este radio" : "Activa tu ubicación"}</strong>${usingRealLocation ? "Prueba a ampliar la distancia o guarda un lugar en esta zona." : "La aplicación solo utiliza el GPS cuando pulsas «Usar mi ubicación»."}</div>`;
  $$(".category-card").forEach(button => button.classList.toggle("selected", button.dataset.category === category));
}
function renderAllPlaces() {
  const query = ($("#place-search").value || "").toLocaleLowerCase("es");
  const category = $("#place-category-filter").value;
  const status = $("#place-status-filter").value;
  const filtered = places.filter(place => {
    const searchable = `${place.name} ${place.city} ${place.address} ${place.notes}`.toLocaleLowerCase("es");
    const placeStatus = place.status || "visited";
    return searchable.includes(query) && (category === "all" || place.category === category) && (status === "all" || placeStatus === status);
  });
  $("#places-summary").innerHTML = `<div class="summary-chip"><strong>${places.length}</strong> lugares guardados</div><div class="summary-chip"><strong>${new Set(places.map(p=>p.city)).size}</strong> ciudades</div>`;
  $("#all-places").innerHTML = filtered.length ? filtered.map(place => renderPlace(place)).join("") : `<div class="empty-state"><strong>No hay resultados</strong>Prueba otra búsqueda o guarda un nuevo lugar.</div>`;
}
function renderCities() {
  const groups = groupPlacesByCity(places);
  $("#city-list").innerHTML = groups.length ? groups.map(([city,count]) => `<button class="city-card" data-city="${escapeHtml(city)}"><strong>${escapeHtml(city)}</strong><small>Tu memoria en esta localidad</small><span>${count} ${count === 1 ? "lugar guardado" : "lugares guardados"} →</span></button>`).join("") : `<div class="empty-state">Todavía no tienes ciudades guardadas.</div>`;
}
function userPlacesCollection() {
  if (!currentUser) throw new Error("Debes iniciar sesión para acceder a tus establecimientos.");
  return collection(db, "users", currentUser.uid, "places");
}

function cleanSharedPlace(place) {
  const coordinate = value => value == null || value === "" ? null : Number(value);
  return {
    name: String(place.name || ""),
    category: String(place.category || "otros"),
    city: String(place.city || ""),
    address: String(place.address || ""),
    lat: coordinate(place.lat),
    lng: coordinate(place.lng),
    rating: String(place.rating || "ok"),
    status: String(place.status || "visited"),
    notes: String(place.notes || ""),
    menuUrl: String(place.menuUrl || "")
  };
}

async function sharePlace(placeId) {
  const place = places.find(item => String(item.id) === String(placeId));
  if (!place || !currentUser) return;
  try {
    const shareRef = doc(collection(db, "sharedPlaces"));
    await setDoc(shareRef, {
      ownerUid: currentUser.uid,
      place: cleanSharedPlace(place),
      createdAt: serverTimestamp()
    });
    const url = new URL(window.location.href);
    url.searchParams.set("share", shareRef.id);
    url.hash = "";
    const shareUrl = url.toString();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Un lugar de Memoria de Viajes",
          text: "Te comparto este establecimiento. Ábrelo para verlo y guardarlo en tus locales.",
          url: shareUrl
        });
        toast("Enlace preparado para compartir.");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      toast("Enlace copiado. Ya puedes enviárselo.");
    } else {
      window.prompt("Copia este enlace y envíaselo a la otra persona:", shareUrl);
    }
  } catch (error) {
    toast(authErrorMessage(error));
  }
}

async function openSharedPlace(shareId) {
  if (!currentUser || !shareId) return;
  try {
    const snapshot = await getDoc(doc(db, "sharedPlaces", shareId));
    if (!snapshot.exists()) {
      toast("Este enlace no existe o no está disponible.");
      return;
    }
    const data = snapshot.data();
    if (!data.place || typeof data.place.name !== "string" || !data.place.name.trim()) {
      toast("El establecimiento compartido no contiene datos válidos.");
      return;
    }
    pendingSharedPlace = { ...cleanSharedPlace(data.place), shareId };
    $("#shared-place-title").textContent = pendingSharedPlace.name;
    $("#shared-place-category").textContent = getCategoryLabel(pendingSharedPlace.category);
    $("#shared-place-address").textContent = [pendingSharedPlace.address, pendingSharedPlace.city].filter(Boolean).join(" · ") || "Dirección no indicada";
    $("#shared-place-notes").textContent = pendingSharedPlace.notes || "No se ha añadido ningún comentario.";
    const alreadySaved = places.some(place => place.sharedFrom === shareId);
    const saveButton = $("#save-shared-place-btn");
    saveButton.disabled = alreadySaved;
    saveButton.textContent = alreadySaved ? "Ya está en mis locales" : "Guardar en mis locales";
    $("#shared-place-dialog").showModal();
  } catch (error) {
    toast(authErrorMessage(error));
  }
}

async function saveSharedPlace() {
  if (!currentUser || !pendingSharedPlace) return;
  const shareId = pendingSharedPlace.shareId;
  if (places.some(place => place.sharedFrom === shareId)) {
    toast("Este establecimiento ya está guardado en tus locales.");
    $("#shared-place-dialog").close();
    return;
  }

  const button = $("#save-shared-place-btn");
  button.disabled = true;
  button.textContent = "Guardando…";
  try {
    const data = cleanSharedPlace(pendingSharedPlace);
    const date = new Date().toISOString().slice(0, 10);
    const created = {
      ...data,
      date,
      sharedFrom: shareId,
      createdAt: serverTimestamp()
    };
    const reference = await addDoc(userPlacesCollection(), created);
    places.unshift({ ...data, id: reference.id, date, sharedFrom: shareId });
    renderNearby("all");
    renderAllPlaces();
    renderCities();
    $("#shared-place-dialog").close();
    pendingSharedPlace = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    window.history.replaceState({}, "", url);
    pendingShareId = null;
    toast("Copia guardada en tus locales. Ya puedes editarla sin afectar al original.");
  } catch (error) {
    toast(authErrorMessage(error));
    button.disabled = false;
    button.textContent = "Guardar en mis locales";
  }
}
async function loadUserPlaces() {
  if (!currentUser) return;
  const snapshot = await getDocs(userPlacesCollection());
  places = snapshot.docs.map(item => {
    const data = item.data();
    return { ...data, id: item.id, lat: data.lat == null ? null : Number(data.lat), lng: data.lng == null ? null : Number(data.lng) };
  });
  renderNearby("all");
  renderAllPlaces();
  renderCities();
}
function authErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "El correo o la contraseña no son correctos.";
  if (code.includes("invalid-email")) return "El formato del correo electrónico no es válido.";
  if (code.includes("too-many-requests")) return "Demasiados intentos. Espera un poco y vuelve a intentarlo.";
  if (code.includes("network-request-failed")) return "No hay conexión. Comprueba tu conexión a Internet.";
  if (code.includes("permission-denied")) return "Firebase ha denegado el acceso. Revisa las reglas de Firestore.";
  return "No se ha podido completar la operación. Comprueba la configuración de Firebase.";
}
function showAuthenticatedApp(user) {
  currentUser = user;
  $("#auth-screen").hidden = true;
  $("#app-shell").hidden = false;
  $("#auth-user-email").textContent = user.email || "Cuenta privada";
  $("#auth-error").textContent = "";
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
    renderDiscoveryMap();
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
function openNewPlaceForm() {
  const form = $("#place-form");
  editingPlaceId = null;
  form.reset();
  $("#place-dialog .eyebrow").textContent = "AÑADIR A TUS RECUERDOS";
  $("#place-dialog h2").textContent = "Guardar un lugar";
  $("#place-form-submit").textContent = "Guardar en mis sitios";
  form.elements.status.value = "planned";
  $("#place-dialog").showModal();
}
function openEditPlace(id) {
  const place = places.find(item => String(item.id) === String(id));
  if (!place) return;
  const form = $("#place-form");
  editingPlaceId = place.id;
  form.elements.name.value = place.name || "";
  form.elements.category.value = place.category || "otros";
  form.elements.city.value = place.city || "";
  form.elements.address.value = place.address || "";
  form.elements.lat.value = Number.isFinite(place.lat) ? place.lat : "";
  form.elements.lng.value = Number.isFinite(place.lng) ? place.lng : "";
  form.elements.rating.value = place.rating || "like";
  form.elements.status.value = place.status || "visited";
  form.elements.menuUrl.value = place.menuUrl || "";
  form.elements.notes.value = place.notes || "";
  $("#place-dialog .eyebrow").textContent = "ACTUALIZAR TUS RECUERDOS";
  $("#place-dialog h2").textContent = "Editar establecimiento";
  $("#place-form-submit").textContent = "Guardar cambios";
  $("#place-dialog").showModal();
}
function prepareSaveDiscovery(index) {
  const place = discoveryResults[index];
  if (!place) return;
  const form = $("#place-form");
  editingPlaceId = null;
  $("#place-dialog .eyebrow").textContent = "AÑADIR A TUS RECUERDOS";
  $("#place-dialog h2").textContent = "Guardar un lugar";
  $("#place-form-submit").textContent = "Guardar en mis sitios";
  form.elements.name.value = place.name;
  form.elements.category.value = place.category;
  form.elements.city.value = place.city || "";
  form.elements.address.value = place.address || "";
  form.elements.lat.value = place.lat.toFixed(6);
  form.elements.lng.value = place.lng.toFixed(6);
  form.elements.rating.value = "like";
  form.elements.status.value = "planned";
  form.elements.menuUrl.value = "";
  form.elements.notes.value = "Encontrado mediante OpenStreetMap. Añade aquí tu comentario personal.";
  $("#place-dialog").showModal();
}
function bindEvents() {
  $("#login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("#login-submit");
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    $("#auth-error").textContent = "";
    button.disabled = true;
    button.textContent = "Entrando…";
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      $("#auth-error").textContent = authErrorMessage(error);
    } finally {
      button.disabled = false;
      button.textContent = "Entrar";
    }
  });
  $("#close-shared-place-btn").addEventListener("click", () => $("#shared-place-dialog").close());
  $("#close-shared-place-secondary").addEventListener("click", () => $("#shared-place-dialog").close());
  $("#save-shared-place-btn").addEventListener("click", saveSharedPlace);
  $("#logout-btn").addEventListener("click", async () => {
    try { await signOut(auth); }
    catch (error) { toast(authErrorMessage(error)); }
  });
  $$("[data-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
  $$(".category-card").forEach(button => button.addEventListener("click", () => renderNearby(button.dataset.category)));
  $("#locate-btn").addEventListener("click", locate);
  $("#discover-location-btn").addEventListener("click", async () => {
    if (await locate()) await searchDiscovery();
  });
  $("#search-discovery-btn").addEventListener("click", searchDiscovery);
  $("#radius-select").addEventListener("change", () => renderNearby());
  $("#show-all-nearby").addEventListener("click", () => renderNearby("all"));
  $("#add-place-top").addEventListener("click", openNewPlaceForm);
  $("#place-search").addEventListener("input", renderAllPlaces);
  $("#place-category-filter").addEventListener("change", renderAllPlaces);
  $("#place-status-filter").addEventListener("change", renderAllPlaces);
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
  $("#place-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lat = data.get("lat") === "" ? null : Number(data.get("lat"));
    const lng = data.get("lng") === "" ? null : Number(data.get("lng"));
    if ((lat === null) !== (lng === null)) { toast("Introduce las dos coordenadas o deja ambas vacías."); return; }
    const updatedData = { name: String(data.get("name")).trim(), category: data.get("category"), city: String(data.get("city")).trim(), address: String(data.get("address")).trim(), lat, lng, rating: data.get("rating"), status: data.get("status") || "visited", notes: String(data.get("notes")).trim(), menuUrl: String(data.get("menuUrl") || "").trim() };
    const submitButton = $("#place-form-submit");
    submitButton.disabled = true;
    try {
      if (editingPlaceId !== null) {
        const existing = places.find(item => String(item.id) === String(editingPlaceId));
        if (!existing) { toast("No se ha encontrado el establecimiento."); return; }
        await updateDoc(doc(db, "users", currentUser.uid, "places", String(editingPlaceId)), { ...updatedData, updatedAt: serverTimestamp() });
        Object.assign(existing, updatedData);
        toast("Cambios guardados en tu cuenta.");
      } else {
        const created = { ...updatedData, date: new Date().toISOString().slice(0,10), createdAt: serverTimestamp() };
        const reference = await addDoc(userPlacesCollection(), created);
        places.unshift({ ...updatedData, id: reference.id, date: created.date });
        toast("Lugar guardado en tu cuenta.");
      }
      editingPlaceId = null;
      form.reset(); $("#place-dialog").close(); renderNearby("all"); renderAllPlaces(); renderCities();
    } catch (error) {
      toast(authErrorMessage(error));
    } finally {
      submitButton.disabled = false;
    }
  });
  document.addEventListener("click", event => {
    const shareButton = event.target.closest("[data-share-place]");
    if (shareButton) { sharePlace(shareButton.dataset.sharePlace); return; }
    const editButton = event.target.closest("[data-edit-place]");
    if (editButton) { openEditPlace(editButton.dataset.editPlace); return; }
    const deleteButton = event.target.closest("[data-delete-place]");
    if (deleteButton) {
      const place = places.find(item => String(item.id) === String(deleteButton.dataset.deletePlace));
      if (place && window.confirm('¿Seguro que quieres eliminar "' + place.name + '" de Mis sitios? Esta acción no se puede deshacer.')) {
        deleteButton.disabled = true;
        deleteDoc(doc(db, "users", currentUser.uid, "places", String(place.id))).then(() => {
          places = places.filter(item => String(item.id) !== String(place.id));
          renderNearby("all"); renderAllPlaces(); renderCities();
          toast("Establecimiento eliminado de tu cuenta.");
        }).catch(error => toast(authErrorMessage(error))).finally(() => { deleteButton.disabled = false; });
      }
      return;
    }
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

  const layout = document.createElement("div");
  layout.className = "discovery-layout";

  const controls = document.createElement("div");
  controls.className = "discovery-toolbar";
  controls.innerHTML = `
    <label>Tipo de lugar
      <select id="discovery-category">
        <option value="all">Todas las categorías</option>
        <option value="comer">Restaurantes y bares</option>
        <option value="cafe">Cafeterías y panaderías</option>
        <option value="dormir">Alojamientos</option>
        <option value="comprar">Tiendas</option>
        <option value="gasolinera">Gasolineras</option>
        <option value="otros">Otros lugares</option>
      </select>
    </label>
    <label>Distancia
      <select id="discovery-radius">
        <option value="1">1 km</option><option value="3">3 km</option>
        <option value="5" selected>5 km</option><option value="10">10 km</option>
        <option value="20">20 km</option><option value="30">30 km</option>
      </select>
    </label>
    <button class="primary-btn" id="search-discovery-btn">Buscar establecimientos</button>`;

  const statusLine = document.createElement("p");
  statusLine.className = "discovery-status";
  statusLine.id = "discovery-status";
  statusLine.setAttribute("aria-live", "polite");
  statusLine.textContent = "Pulsa el botón para consultar los establecimientos cercanos.";

  const mapSection = document.createElement("section");
  mapSection.className = "map-section";
  mapSection.innerHTML = `
    <div class="map-section-heading">
      <strong>Mapa de establecimientos</strong>
      <span>Selecciona un marcador para ver el lugar.</span>
    </div>
    <div id="discovery-map" aria-label="Mapa de establecimientos cercanos"></div>`;

  const results = document.createElement("div");
  results.className = "discovery-results place-list";
  results.id = "discovery-results";

  const attribution = document.createElement("p");
  attribution.className = "osm-attribution";
  attribution.textContent = "Datos cartográficos y de establecimientos: © OpenStreetMap contributors.";

  layout.append(controls, statusLine, mapSection, results, attribution);
  $("#view-discover .info-card").before(layout);

  bindEvents();
  renderNearby("all");
  renderAllPlaces();
  renderCities();
  onAuthStateChanged(auth, async user => {
    if (!user) {
      currentUser = null;
      places = [];
      $("#app-shell").hidden = true;
      $("#auth-screen").hidden = false;
      $("#login-password").value = "";
      renderNearby("all"); renderAllPlaces(); renderCities();
      return;
    }
    showAuthenticatedApp(user);
    try {
      await loadUserPlaces();
      if (pendingShareId) await openSharedPlace(pendingShareId);
    } catch (error) {
      toast(authErrorMessage(error));
    }
  });
}
init();
