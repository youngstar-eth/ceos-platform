"use client";

import { useScroll, type MotionValue } from "framer-motion";
import { useRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollSectionProps {
  children: (progress: MotionValue<number>) => ReactNode;
  className?: string;
  height?: string;
}

export function ScrollSection({
  children,
  className,
  height = "h-[250vh]",
}: ScrollSectionProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"],
  });

  return (
    <div ref={targetRef} className={cn("relative w-full", height)}>
      <div className="sticky top-0 h-screen overflow-hidden flex items-center justify-center">
        <div
          className={cn(
            "relative w-full h-full max-w-7xl mx-auto px-4 md:px-8",
            className
          )}
        >
          {children(scrollYProgress)}
        </div>
      </div>
    </div>
  );
}
