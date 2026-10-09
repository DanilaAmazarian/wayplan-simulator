import { Suspense } from "react";
import { TripDashboard } from "@/components/TripDashboard";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <TripDashboard />
    </Suspense>
  );
}
