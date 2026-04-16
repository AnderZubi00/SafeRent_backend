CREATE TABLE "bloqueos_fechas" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "vivienda_id"  UUID NOT NULL,
  "fecha_inicio" TIMESTAMP(3) NOT NULL,
  "fecha_fin"    TIMESTAMP(3) NOT NULL,
  "motivo"       TEXT,
  CONSTRAINT "bloqueos_fechas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bloqueos_fechas"
  ADD CONSTRAINT "bloqueos_fechas_vivienda_id_fkey"
  FOREIGN KEY ("vivienda_id") REFERENCES "viviendas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "bloqueos_fechas_vivienda_id_idx" ON "bloqueos_fechas"("vivienda_id");
