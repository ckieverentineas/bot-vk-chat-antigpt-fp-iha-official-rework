PRAGMA foreign_keys=OFF;

CREATE TABLE "new_IgnoredChat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "peerId" BIGINT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "ignored" BOOLEAN NOT NULL DEFAULT true,
    "createdByIdvk" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_IgnoredChat" ("createdAt", "createdByIdvk", "id", "ignored", "peerId", "reason", "title", "updatedAt")
SELECT "createdAt", "createdByIdvk", "id", "ignored", "peerId", "reason", "title", "updatedAt" FROM "IgnoredChat";

DROP TABLE "IgnoredChat";

ALTER TABLE "new_IgnoredChat" RENAME TO "IgnoredChat";

CREATE UNIQUE INDEX "IgnoredChat_peerId_key" ON "IgnoredChat"("peerId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
