"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, Loader2, MapPin, Sparkles } from "lucide-react";
import type { GenerateTripRequest } from "@travel/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { DAY_FORMS, countLabel } from "@/lib/format";

interface TripFormProps {
  loading: boolean;
  onSubmit: (payload: GenerateTripRequest) => void;
}

const MAX_DAYS = 14;

export function TripForm({ loading, onSubmit }: TripFormProps) {
  const [destination, setDestination] = useState("");
  const [durationDays, setDurationDays] = useState(3);
  const [preferences, setPreferences] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ destination: destination.trim(), durationDays, preferences: preferences.trim() });
  };

  return (
    <Card className="shadow-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Куда отправимся?</CardTitle>
          <CardDescription>
            ИИ составит маршрут по дням, уточнит координаты по OpenStreetMap и выстроит оптимальный порядок посещения.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="destination">
              <MapPin className="size-4 text-muted-foreground" />
              Город
            </Label>
            <Input
              id="destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Например, Рим"
              required
              minLength={2}
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="days">
                <CalendarDays className="size-4 text-muted-foreground" />
                Длительность
              </Label>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary tabular-nums">
                {countLabel(durationDays, DAY_FORMS)}
              </span>
            </div>
            <Slider
              id="days"
              min={1}
              max={MAX_DAYS}
              step={1}
              value={[durationDays]}
              onValueChange={([v]) => setDurationDays(v ?? 1)}
              disabled={loading}
              aria-label="Количество дней"
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>1</span>
              <span>7</span>
              <span>{MAX_DAYS}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="preferences">
              <Sparkles className="size-4 text-muted-foreground" />
              Интересы и пожелания
            </Label>
            <Textarea
              id="preferences"
              className="min-h-24 resize-y"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="История, уличная еда, музеи, без долгих переездов…"
              maxLength={1000}
              disabled={loading}
            />
          </div>
        </CardContent>

        <CardFooter>
          <Button type="submit" size="lg" className="h-10 w-full" disabled={loading || destination.trim().length < 2}>
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? "Генерируем маршрут…" : "Сгенерировать поездку"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
