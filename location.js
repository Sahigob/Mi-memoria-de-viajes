export const DEMO_LOCATION = { lat: 39.4699, lng: -0.3763, label: "Valencia, España" };

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Este navegador no permite obtener la ubicación."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        label: "Mi ubicación actual"
      }),
      error => {
        const messages = {
          1: "No has permitido el acceso a la ubicación.",
          2: "No se ha podido determinar tu ubicación.",
          3: "La solicitud de ubicación ha tardado demasiado."
        };
        reject(new Error(messages[error.code] || "No se ha podido obtener la ubicación."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

export function distanceKm(a, b) {
  const toRad = value => value * Math.PI / 180;
  const earth = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const value = Math.sin(dLat/2)**2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * earth * Math.atan2(Math.sqrt(value), Math.sqrt(1-value));
}
