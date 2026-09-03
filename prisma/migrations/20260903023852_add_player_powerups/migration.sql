-- CreateEnum
CREATE TYPE "PowerUpType" AS ENUM ('TURBO', 'SLOW', 'BOMB', 'SHIELD');

-- CreateTable
CREATE TABLE "PlayerPowerUp" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "type" "PowerUpType" NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "targetLane" INTEGER,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPowerUp_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlayerPowerUp" ADD CONSTRAINT "PlayerPowerUp_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPowerUp" ADD CONSTRAINT "PlayerPowerUp_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
