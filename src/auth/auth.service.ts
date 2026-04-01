import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeTokenDto } from './dto/exchange-token.dto';

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.supabase = createClient(
      this.config.get<string>('SUPABASE_URL')!,
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  /**
   * Verifica el token de Supabase y devuelve un JWT propio del backend.
   * Si el usuario no existe en la BD y se aportan datos de registro, lo crea.
   */
  async exchange(dto: ExchangeTokenDto) {
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser(dto.supabase_token);

    if (error || !user) {
      throw new UnauthorizedException('Token de Supabase inválido o expirado');
    }

    let usuario = await this.prisma.usuario.findUnique({
      where: { id: user.id },
    });

    if (!usuario) {
      if (!dto.nombre_completo || !dto.rol) {
        throw new UnauthorizedException(
          'Usuario no encontrado. Para registrarse, incluya nombre_completo y rol.',
        );
      }

      usuario = await this.prisma.usuario.create({
        data: {
          id: user.id,
          email: user.email!,
          nombre_completo: dto.nombre_completo,
          rol: dto.rol as 'INQUILINO' | 'PROPIETARIO' | 'ADMINISTRADOR',
          contrasena_hash: 'supabase_managed',
        },
      });
    }

    return this.generateTokenResponse(usuario);
  }

  async getProfile(userId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nombre_completo: true,
        rol: true,
        dni_nie: true,
        verificado_kyc: true,
        fecha_creacion: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return usuario;
  }

  private generateTokenResponse(usuario: {
    id: string;
    email: string;
    rol: string;
    nombre_completo: string;
    verificado_kyc: boolean;
  }) {
    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre_completo,
    };

    const token = this.jwt.sign(payload);

    return {
      access_token: token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre_completo: usuario.nombre_completo,
        rol: usuario.rol,
        verificado_kyc: usuario.verificado_kyc,
      },
    };
  }
}
