import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSolicitudDto {
  @IsUUID()
  vivienda_id: string;

  @IsUUID()
  propietario_id: string;

  @IsString()
  motivo: string;

  @IsOptional()
  @IsString()
  motivo_detalle?: string;

  @IsDateString()
  fecha_entrada: string;

  @IsDateString()
  fecha_salida: string;
}
