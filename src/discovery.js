import { distanceKm } from "./location.js";

// Instancias públicas y gratuitas de Overpass (OpenStreetMap).
// Se prueban con un pequeño escalonado: se utiliza la primera que responde.
const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://ovp.dresel.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

const FILTERS = {
  comer: ['nwr["amenity"~"^(restaurant|bar|pub|fast_food|food_court)$"]["name"]'],
  cafe: [
    'nwr["amenity"~"^(cafe|ice_cream)$"]["name"]',
    'nwr["shop"~"^(bakery|pastry|confectionery)$"]["name"]'
  ],
  dormir: ['nwr["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]["name"]'],
  comprar: ['nwr["shop"]["name"]'],
  gasolinera: ['nwr["amenity"="fuel"]["name"]'],
  otros: ['nwr["tourism"~"^(museum|attraction|zoo|theme_park|gallery)$"]["name"]']
};

export function discoveryStatus() {
  return {
    ready: true,
    message: "Busca establecimientos próximos mediante OpenStreetMap. La búsqueda utiliza servidores públicos gratuitos; su disponibilidad depende de cada servidor."
  };
}

function categoryOf(tags = {}) {
  if (tags.amenity === "fuel") return "gasolinera";
  if (tags.amenity === "cafe" || tags.amenity === "ice_cream" ||
      ["bakery", "pastry", "confectionery"].includes(tags.shop)) return "cafe";
  if (tags.shop) return "comprar";
  if (["restaurant", "bar", "pub", "fast_food", "food_court"].includes(tags.amenity)) return "comer";
  if (["hotel", "hostel", "guest_house", "motel", "apartment"].includes(tags.tourism)) return "dormir";
  return "otros";
}

function addressOf(tags = {}) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  return [street, tags["addr:postcode"], tags["addr:city"] || tags["addr:town"] || tags["addr:village"]]
    .filter(Boolean).join(", ");
}

function coordinatesOf(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return { lat: element.lat, lng: element.lon };
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
    return { lat: element.center.lat, lng: element.center.lon };
  }
  return null;
}

async function requestEndpoint(endpoint, query, parentSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const abortFromParent = () => controller.abort();

  if (parentSignal.aborted) controller.abort();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Accept": "application/json"
      },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    if (!data || !Array.isArray(data.elements)) throw new Error("respuesta de datos no válida");
    return data;
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}
async function firstAvailableEndpoint(query) {
  const controllers = ENDPOINTS.map(() => new AbortController());
  const attempts = ENDPOINTS.map((endpoint, index) => new Promise((resolve, reject) => {
    const delay = index * 650;
    const timer = setTimeout(() => {
      requestEndpoint(endpoint, query, controllers[index].signal)
        .then(data => resolve({ data, endpoint }))
        .catch(reject);
    }, delay);
    controllers[index].signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  }));

  try {
    const winner = await Promise.any(attempts);
    controllers.forEach((controller, index) => {
      if (ENDPOINTS[index] !== winner.endpoint) controller.abort();
    });
    return winner.data;
  } catch {
    throw new Error("Los servidores gratuitos de OpenStreetMap no están respondiendo. Puedes volver a intentarlo en unos instantes; no es un problema de tu cuenta ni de tus lugares guardados.");
  } finally {
    controllers.forEach(controller => controller.abort());
  }
}

export async function searchNearbyEstablishments(location, radiusKm = 5, category = "all") {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new Error("Primero necesitamos una ubicación válida. Activa el GPS e inténtalo de nuevo.");
  }

  const safeRadiusKm = Math.max(1, Math.min(30, Number(radiusKm) || 5));
  const radius = Math.round(safeRadiusKm * 1000);
  const selected = category === "all" ? Object.keys(FILTERS) : [category];
  const selectors = selected.flatMap(key => FILTERS[key] || []);
  if (!selectors.length) throw new Error("La categoría seleccionada no es válida.");

  const query = [
    "[out:json][timeout:12];",
    "(",
    selectors.map(selector => selector + "(around:" + radius + "," + location.lat + "," + location.lng + ");").join("\n"),
    ");",
    "out center tags 80;"
  ].join("\n");

  const data = await firstAvailableEndpoint(query);
  const unique = new Map();

  for (const element of data.elements) {
    const tags = element.tags || {};
    const name = tags.name || tags["name:es"] || tags.brand;
    const coordinates = coordinatesOf(element);
    if (!name || !coordinates) continue;

    const distance = distanceKm(location, coordinates);
    if (distance > safeRadiusKm) continue;

    const placeCategory = categoryOf(tags);
    if (category !== "all" && placeCategory !== category) continue;

    const key = element.type + "-" + element.id;
    unique.set(key, {
      id: key,
      name,
      category: placeCategory,
      lat: coordinates.lat,
      lng: coordinates.lng,
      distance,
      address: addressOf(tags),
      city: tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "",
      website: tags.website || tags["contact:website"] || "",
      openingHours: tags.opening_hours || "",
      source: "OpenStreetMap"
    });
  }

  return [...unique.values()].sort((a, b) => a.distance - b.distance);
}
