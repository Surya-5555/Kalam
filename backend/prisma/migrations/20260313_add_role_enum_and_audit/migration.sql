-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'MANAGER');

-- AlterTable - Add new columns first
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "roleChangedBy" INTEGER;
ALTER TABLE "User" ADD COLUMN "roleChangedAt" TIMESTAMP(3);

-- Drop the default first, then change type, then set new default
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

-- Convert string role to UserRole enum (default to EMPLOYEE for safety)
ALTER TABLE "User" 
  ALTER COLUMN "role" TYPE "UserRole" USING (
    CASE 
      WHEN "role" = 'manager' THEN 'MANAGER'::"UserRole"
      WHEN "role" = 'MANAGER' THEN 'MANAGER'::"UserRole"
      ELSE 'EMPLOYEE'::"UserRole"
    END
  ),
  ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE'::"UserRole";
