-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Player_username_key" ON "Player"("username");
