import { IsUUID, IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreatePagoIntentDto {
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
  @IsNumber()
  @Min(0)
  fianza_importe?: number;
}
