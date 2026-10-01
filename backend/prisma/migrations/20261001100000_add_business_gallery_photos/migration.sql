-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "gallery_photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
