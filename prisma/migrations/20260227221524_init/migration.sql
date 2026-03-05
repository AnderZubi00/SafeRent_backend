-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('INQUILINO', 'PROPIETARIO', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'PAGO_RETENIDO', 'CONFIRMADO', 'COMPLETADO', 'DISPUTA', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MotivoTemporalidad" AS ENUM ('ESTUDIOS', 'TRABAJO', 'OBRAS', 'SALUD', 'OTROS');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "dni_nie" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'INQUILINO',
    "stripe_account_id" TEXT,
    "verificado_kyc" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_conexion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viviendas" (
    "id" TEXT NOT NULL,
    "propietario_id" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL DEFAULT 'Donostia-San Sebastián',
    "precio_mes" DOUBLE PRECISION NOT NULL,
    "fianza_importe" DOUBLE PRECISION NOT NULL,
    "num_registro_vivienda" TEXT NOT NULL,
    "nota_simple_url" TEXT,
    "verificada" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viviendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" TEXT NOT NULL,
    "vivienda_id" TEXT NOT NULL,
    "inquilino_id" TEXT NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'PENDIENTE',
    "stripe_payment_intent" TEXT,
    "comision_plataforma" DOUBLE PRECISION,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_temporales" (
    "id" TEXT NOT NULL,
    "reserva_id" TEXT NOT NULL,
    "tipo" "MotivoTemporalidad" NOT NULL,
    "archivo_url" TEXT NOT NULL,
    "validado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_subida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_temporales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos_digitales" (
    "id" TEXT NOT NULL,
    "reserva_id" TEXT NOT NULL,
    "id_firma_externa" TEXT,
    "pdf_final_url" TEXT,
    "firmado_propietario" BOOLEAN NOT NULL DEFAULT false,
    "firmado_inquilino" BOOLEAN NOT NULL DEFAULT false,
    "fecha_firma_completa" TIMESTAMP(3),

    CONSTRAINT "contratos_digitales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_dni_nie_key" ON "usuarios"("dni_nie");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_stripe_account_id_key" ON "usuarios"("stripe_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "viviendas_num_registro_vivienda_key" ON "viviendas"("num_registro_vivienda");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_stripe_payment_intent_key" ON "reservas"("stripe_payment_intent");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_digitales_reserva_id_key" ON "contratos_digitales"("reserva_id");

-- AddForeignKey
ALTER TABLE "viviendas" ADD CONSTRAINT "viviendas_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_vivienda_id_fkey" FOREIGN KEY ("vivienda_id") REFERENCES "viviendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_inquilino_id_fkey" FOREIGN KEY ("inquilino_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_temporales" ADD CONSTRAINT "documentos_temporales_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_digitales" ADD CONSTRAINT "contratos_digitales_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
