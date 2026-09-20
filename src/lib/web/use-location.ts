"use client";

import { useEffect, useRef, useState } from "react";

export function useLocation() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function locate() {
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser. Search by name instead.");
      return;
    }
    const current = ++generation.current;
    setLocating(true);
    setError(null);
    setLocation(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (current !== generation.current) return;
        setLocation({ lat: coords.latitude, lng: coords.longitude });
        setLocating(false);
      },
      (failure) => {
        if (current !== generation.current) return;
        setError(
          failure.code === 1
            ? "Location permission denied. Search by name or enter custom coordinates."
            : "Location could not be determined. Try again or search by name.",
        );
        setLocating(false);
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }
  return { location, locating, error, locate };
}
