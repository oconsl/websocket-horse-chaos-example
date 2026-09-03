-- CreateEnum
CREATE TYPE "RaceStatus" AS ENUM ('WAITING', 'BETTING', 'BETTING_CLOSED', 'COUNTDOWN', 'RACING', 'RESULTS');

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "status" "RaceStatus" NOT NULL DEFAULT 'WAITING',
    "seed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Horse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speed" INTEGER NOT NULL DEFAULT 50,
    "acceleration" INTEGER NOT NULL DEFAULT 50,
    "stamina" INTEGER NOT NULL DEFAULT 50,
    "chaos" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "Horse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceHorse" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "lane" INTEGER NOT NULL,
    "finishPosition" INTEGER,

    CONSTRAINT "RaceHorse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Horse_name_key" ON "Horse"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RaceHorse_raceId_lane_key" ON "RaceHorse"("raceId", "lane");

-- CreateIndex
CREATE UNIQUE INDEX "RaceHorse_raceId_horseId_key" ON "RaceHorse"("raceId", "horseId");

-- CreateIndex
CREATE UNIQUE INDEX "Bet_playerId_raceId_key" ON "Bet"("playerId", "raceId");

-- AddForeignKey
ALTER TABLE "RaceHorse" ADD CONSTRAINT "RaceHorse_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceHorse" ADD CONSTRAINT "RaceHorse_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
