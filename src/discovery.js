import { distanceKm } from "./location.js";

const ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const FILTERS = {
  comer: ['node["amenity"~"^(restaurant|bar|pub|fast_food|food_court)$"]', 'way["amenity"~"^(restaurant|bar|pub|fast_food|food_court)$"]', 'relation["amenity"~"^(restaurant|bar|pub|fast_food|food_court)$"]'],
  cafe: ['node["amenity"~"^(cafe|ice_cream)$"]', 'way["amenity"~"^(cafe|ice_cream)$"]', 'node["shop"~"^(bakery|pastry|confectionery)$"]', 'way["shop"~"^(bakery|pastry|confectionery)$"]'],
  dormir: ['node["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]', 'way["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]', 'relation["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]'],
  comprar: ['node["shop"]["name"]', 'way["shop"]["name"]', 'relation["shop"]["name"]'],
  gasolinera: ['node["amenity"="fuel"]', 'way["amenity"="fuel"]'],
  otros: ['node["tourism"~"^(museum|attraction|zoo|theme_park|gallery)$"]', 'way["tourism"~"^(museum|attraction|zoo|theme_park|gallery)$"]', 'relation["tourism"~"^(museum|attraction|zoo|theme_park|gallery)$"]']
};

export function discoveryStatus() {
  return {
    ready: true,
    message: "Busca establecimientos reales próximos a tu ubicación mediante OpenStreetMap. La cobertura depende de los datos disponibles en cada zona."
  };
}

function categoryOf(tags = {}) {
  if (tags.amenity === "fuel") return "gasolinera";
  if (tags.amenity === "cafe" || tags.amenity === "ice_cream" || ["bakery", "pastry", "confectionery"].includes(tags.shop)) return "cafe";
  if (tags.shop) return "comprar";
  if (["restaurant", "bar", "pub", "fast_food", "food_court"].includes(tags.amenity)) return "comer";
  if (["hotel", "hostel", "guest_house", "motel", "apartment"].includes(tags.tourism)) return "dormir";
  return "otros";
}

function addressOf(tags) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  return [street, tags["addr:postcode"], tags["addr:city"] || tags["addr:town"] || tags["addr:village"]].filter(Boolean).join(", ");
}

function coordinatesOf(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
    return { lat: element.center.lat, lng: element.center.lon };
  }
  return null;
}

async function requestEndpoint(endpoint, query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`El servidor de mapas respondió con el error ${response.status}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchNearbyEstablishments(location, radiusKm = 5, category = "all") {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new Error("Primero necesitamos una ubicación válida.");
  }

  const safeRadiusKm = Math.max(1, Math.min(30, Number(radiusKm) || 5));
  const radius = Math.round(safeRadiusKm * 1000);
  const selected = category === "all" ? Object.keys(FILTERS) : [category];
  const selectors = selected.flatMap(key => FILTERS[key] || []);

  if (!selectors.length) throw new Error("La categoría seleccionada no es válida.");

  // Se limita la respuesta para evitar consultas enormes en zonas muy pobladas.
  const query = `[out:json][timeout:18];( ${selectors.map(selector =>
    `${selector}(around:${radius},${location.lat},${location.lng});`
  ).join("")} );out center tags 120;`;

  let data = null;
  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    try {
      data = await requestEndpoint(endpoint, query);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!data) {
    if (lastError?.name === "AbortError") {
      throw new Error("Los servidores de mapas están saturados o tardan demasiado. Prueba con un radio menor o inténtalo de nuevo dentro de un minuto.");
    }
    throw new Error(lastError?.message || "No se ha podido conectar con OpenStreetMap. Comprueba tu conexión e inténtalo de nuevo.");
  }

  const unique = new Map();
  for (const element of data.elements || []) {
    const tags = element.tags || {};
    const name = tags.name || tags["name:es"] || tags.brand;
    const coordinates = coordinatesOf(element);
    if (!name || !coordinates) continue;

    const key = `${element.type}-${element.id}`;
    const distance = distanceKm(location, coordinates);
    if (distance > safeRadiusKm) continue;

    unique.set(key, {
      id: key,
      name,
      category: categoryOf(tags),
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

  return [...unique.values()]
    .filter(place => category === "all" || place.category === category)
    .sort((a, b) => a.distance - b.distance);
}
