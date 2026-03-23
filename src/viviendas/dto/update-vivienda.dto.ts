import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { CreateViviendaDto } from './create-vivienda.dto';

export class UpdateViviendaDto extends PartialType(CreateViviendaDto) {
  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fotos?: string[];
}
