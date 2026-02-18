"use client";

import { useState, useEffect } from "react";

export function useTicker(
  start: number,
  end: number,
  duration: number = 2000
) {
  const [value, setValue] = useState(start);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = (time - startTime) / duration;

      if (progress < 1) {
        setValue(start + (end - start) * progress);
        animationFrame = requestAnimationFrame(animate);
      } else {
        setValue(end);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [start, end, duration]);

  return value.toFixed(2);
}
