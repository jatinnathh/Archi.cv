"use client";

import { useEffect, useRef } from "react";

export default function PageVisitTracker() {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    fetch("/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "archiCV page visit",
        details: "A visitor accessed your archiCV site.",
        scenario: "Page Visit Alert",
        result: "Success",
      }),
    }).catch(console.error);
  }, []);

  return null;
}
