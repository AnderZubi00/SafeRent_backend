import { IsUUID, IsString, IsNumber, Min } from 'class-validator';

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
}
