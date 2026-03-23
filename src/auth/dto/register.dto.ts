import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Rol } from '@prisma/client';

export class RegisterDto {
  @IsEmail({}, { message: 'El email no es válido' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  contrasena: string;

  @IsString()
  @MinLength(2, { message: 'El nombre es obligatorio' })
  nombre_completo: string;

  @IsEnum(Rol, { message: 'Rol debe ser INQUILINO, PROPIETARIO o ADMINISTRADOR' })
  rol: Rol;
}
