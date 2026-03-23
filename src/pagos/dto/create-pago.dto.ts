import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePagoDto {
  @IsUUID()
  solicitud_id: string;

  @IsUUID()
  vivienda_id: string;

  @IsString()
  concepto: string;

  @IsNumber()
  @Min(0.01)
  importe: number;

  @IsOptional()
  @IsString()
  metodo?: string;
}
