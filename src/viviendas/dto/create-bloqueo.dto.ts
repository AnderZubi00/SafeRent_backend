import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateBloqueoDto {
  @IsDateString()
  fecha_inicio: string;

  @IsDateString()
  fecha_fin: string;

  @IsOptional()
  @IsString()
  motivo?: string;
}
