-- Float → Decimal(10,2) for all monetary fields
-- Vivienda
ALTER TABLE "viviendas"
  ALTER COLUMN "precio_mes"     TYPE DECIMAL(10,2) USING "precio_mes"::DECIMAL(10,2),
  ALTER COLUMN "fianza_importe" TYPE DECIMAL(10,2) USING "fianza_importe"::DECIMAL(10,2);

-- Pago
ALTER TABLE "pagos"
  ALTER COLUMN "importe"             TYPE DECIMAL(10,2) USING "importe"::DECIMAL(10,2),
  ALTER COLUMN "comision_plataforma" TYPE DECIMAL(10,2) USING "comision_plataforma"::DECIMAL(10,2),
  ALTER COLUMN "comision_host"       TYPE DECIMAL(10,2) USING "comision_host"::DECIMAL(10,2),
  ALTER COLUMN "comision_guest"      TYPE DECIMAL(10,2) USING "comision_guest"::DECIMAL(10,2),
  ALTER COLUMN "importe_propietario" TYPE DECIMAL(10,2) USING "importe_propietario"::DECIMAL(10,2);
