/*
  Warnings:

  - You are about to drop the column `interests` on the `Trip` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "preferences" TEXT,
    "dayTitles" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Trip" ("createdAt", "destination", "endDate", "id", "startDate", "title", "updatedAt", "userId") SELECT "createdAt", "destination", "endDate", "id", "startDate", "title", "updatedAt", "userId" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
