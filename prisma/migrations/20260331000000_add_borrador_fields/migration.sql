-- AlterTable: Vivienda — add borrador/fase fields, make num_registro nullable, add defaults
ALTER TABLE "viviendas" ADD COLUMN     "fase_actual" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "es_borrador" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "direccion" SET DEFAULT '',
ALTER COLUMN "precio_mes" SET DEFAULT 0,
ALTER COLUMN "fianza_importe" SET DEFAULT 0,
ALTER COLUMN "num_registro_vivienda" DROP NOT NULL;

-- AlterTable: Usuario — add KYC identity fields
ALTER TABLE "usuarios" ADD COLUMN     "nombre_kyc" TEXT,
ADD COLUMN     "apellidos_kyc" TEXT,
ADD COLUMN     "tipo_documento" TEXT;

-- DataMigration: mark all existing viviendas as fully completed (fase 5)
UPDATE "viviendas" SET "fase_actual" = 5 WHERE "es_borrador" = false;
