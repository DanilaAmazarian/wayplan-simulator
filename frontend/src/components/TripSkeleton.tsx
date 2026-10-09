"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const STAGES = [
  "Подбираем интересные места…",
  "Составляем расписание по дням…",
  "Уточняем координаты по OpenStreetMap…",
  "Оптимизируем порядок посещения…",
];

export function TripSkeleton() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <Loader2 className="size-4 animate-spin" />
        {STAGES[stage]}
      </p>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="mt-3 size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
