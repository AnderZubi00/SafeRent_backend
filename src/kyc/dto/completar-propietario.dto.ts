import { IsString, IsNotEmpty } from 'class-validator';

export class CompletarPropietarioDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  apellidos: string;

  @IsString()
  @IsNotEmpty()
  dni_nie: string;

  @IsString()
  @IsNotEmpty()
  tipo_documento: string; // "DNI" | "NIE" | "Pasaporte"
}
