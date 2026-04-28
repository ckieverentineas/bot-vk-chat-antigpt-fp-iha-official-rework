CREATE TABLE "IgnoredChat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "peerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "ignored" BOOLEAN NOT NULL DEFAULT true,
    "createdByIdvk" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "IgnoredChat_peerId_key" ON "IgnoredChat"("peerId");
