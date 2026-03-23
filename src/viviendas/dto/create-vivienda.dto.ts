import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateViviendaDto {
  @IsString()
  titulo: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsString()
  direccion: string;

  @IsOptional()
  @IsString()
  barrio?: string;

  @IsString()
  ciudad: string;

  @IsNumber()
  @Min(0)
  precio_mes: number;

  @IsNumber()
  @Min(0)
  fianza_importe: number;

  @IsNumber()
  @Min(1)
  habitaciones: number;

  @IsNumber()
  @Min(1)
  banos: number;

  @IsNumber()
  @Min(0)
  m2: number;

  @IsArray()
  @IsString({ each: true })
  motivos: string[];

  @IsString()
  num_registro_vivienda: string;

  @IsOptional()
  @IsDateString()
  disponible_desde?: string;

  @IsNumber()
  @Min(1)
  estancia_minima: number;

  @IsNumber()
  @Min(1)
  estancia_maxima: number;
}
