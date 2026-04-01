import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  ArrayMinSize,
} from 'class-validator';

export class UpdateFase3Dto {
  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fotos?: string[];

  @IsString()
  @IsNotEmpty()
  direccion: string;

  @IsString()
  @IsNotEmpty()
  provincia: string;

  @IsString()
  @IsNotEmpty()
  ciudad: string;

  @IsNumber()
  habitaciones: number;

  @IsNumber()
  banos: number;

  @IsNumber()
  m2: number;

  @IsString()
  @IsNotEmpty()
  num_registro_vivienda: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  motivos: string[];
}
