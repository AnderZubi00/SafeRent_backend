import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterViviendasDto extends PaginationDto {
  @IsOptional()
  @IsString()
  provincia?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  precioMin?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  precioMax?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  habitaciones?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  soloVerificadas?: boolean;

  @IsOptional()
  @IsDateString()
  fechaEntrada?: string;

  @IsOptional()
  @IsDateString()
  fechaSalida?: string;

  @IsOptional()
  @IsEnum(['precio_asc', 'precio_desc'])
  ordenar?: 'precio_asc' | 'precio_desc';
}
