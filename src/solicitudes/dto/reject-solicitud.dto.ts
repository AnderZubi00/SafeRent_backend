import { IsString, MinLength } from 'class-validator';

export class RejectSolicitudDto {
  @IsString()
  @MinLength(5, { message: 'El motivo de rechazo debe tener al menos 5 caracteres' })
  motivo_rechazo: string;
}
