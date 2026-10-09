-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ItineraryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayNumber" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "transport" TEXT NOT NULL DEFAULT 'walk',
    "notes" TEXT,
    "locationName" TEXT NOT NULL,
    "locationDescription" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,
    "locationAddress" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "geocoded" BOOLEAN NOT NULL DEFAULT false,
    "tripId" TEXT NOT NULL,
    CONSTRAINT "ItineraryItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ItineraryItem" ("dayNumber", "endTime", "id", "lat", "lng", "locationAddress", "locationDescription", "locationName", "locationType", "notes", "order", "startTime", "transport", "tripId") SELECT "dayNumber", "endTime", "id", "lat", "lng", "locationAddress", "locationDescription", "locationName", "locationType", "notes", "order", "startTime", "transport", "tripId" FROM "ItineraryItem";
DROP TABLE "ItineraryItem";
ALTER TABLE "new_ItineraryItem" RENAME TO "ItineraryItem";
CREATE INDEX "ItineraryItem_tripId_dayNumber_order_idx" ON "ItineraryItem"("tripId", "dayNumber", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
