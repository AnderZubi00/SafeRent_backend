-- AddIndex: viviendas — listado público (activa + es_borrador), filtro geográfico, propietario
CREATE INDEX "viviendas_activa_es_borrador_idx" ON "viviendas"("activa", "es_borrador");
CREATE INDEX "viviendas_provincia_idx" ON "viviendas"("provincia");
CREATE INDEX "viviendas_propietario_id_idx" ON "viviendas"("propietario_id");

-- AddIndex: solicitudes — dashboards, filtro de estado, overlap check
CREATE INDEX "solicitudes_inquilino_id_idx" ON "solicitudes"("inquilino_id");
CREATE INDEX "solicitudes_propietario_id_idx" ON "solicitudes"("propietario_id");
CREATE INDEX "solicitudes_estado_idx" ON "solicitudes"("estado");
CREATE INDEX "solicitudes_vivienda_id_estado_idx" ON "solicitudes"("vivienda_id", "estado");

-- AddIndex: pagos — lookup por solicitud e inquilino
CREATE INDEX "pagos_solicitud_id_idx" ON "pagos"("solicitud_id");
CREATE INDEX "pagos_inquilino_id_idx" ON "pagos"("inquilino_id");

-- AddIndex: kyc_sesiones — lookup por usuario
CREATE INDEX "kyc_sesiones_usuario_id_idx" ON "kyc_sesiones"("usuario_id");
