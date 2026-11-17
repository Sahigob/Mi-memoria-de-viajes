import { categories } from "./demo-data.js";
import { distanceKm } from "./location.js";

export function getNearbyPlaces(places, location, radiusKm, category = "all") {
  return places
    .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng))
    .map(place => ({ ...place, distance: distanceKm(location, place) }))
    .filter(place => place.distance <= radiusKm && (category === "all" || place.category === category))
    .sort((a,b) => a.distance - b.distance);
}

export function getCategoryLabel(category) {
  return categories[category]?.label || "Otros";
}

export function getRatingLabel(rating) {
  return ({ like: "Me gustó", ok: "Normal", dislike: "No volvería" })[rating] || "Sin valorar";
}

export function mapUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.lat},${place.lng}`)}`;
}
