-- AlterTable
ALTER TABLE "Bet" ADD COLUMN     "payout" INTEGER;

-- AlterTable
ALTER TABLE "Race" ADD COLUMN     "finalOdds" JSONB;
