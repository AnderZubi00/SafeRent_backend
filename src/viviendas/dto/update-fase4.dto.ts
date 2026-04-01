import {
  IsNumber,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';

export class UpdateFase4Dto {
  @IsNumber()
  @Min(1)
  precio_mes: number;

  @IsNumber()
  @Min(1)
  fianza_importe: number;

  @IsOptional()
  @IsDateString()
  disponible_desde?: string;

  @IsInt()
  @Min(1)
  estancia_minima: number;

  @IsInt()
  @Min(1)
  estancia_maxima: number;
}
