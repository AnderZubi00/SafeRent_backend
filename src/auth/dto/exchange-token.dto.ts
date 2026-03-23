import { IsString, IsOptional, IsIn } from 'class-validator';

export class ExchangeTokenDto {
  @IsString({ message: 'El token de Supabase es obligatorio' })
  supabase_token: string;

  /** Requerido solo durante el registro (primera vez que se hace exchange) */
  @IsOptional()
  @IsString()
  nombre_completo?: string;

  /** Requerido solo durante el registro */
  @IsOptional()
  @IsIn(['INQUILINO', 'PROPIETARIO', 'ADMINISTRADOR'])
  rol?: string;
}
