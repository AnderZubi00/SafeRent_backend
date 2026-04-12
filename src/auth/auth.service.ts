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
        nombre_kyc: true,
        apellidos_kyc: true,
        tipo_documento: true,
        fecha_creacion: true,
        stripe_account_id: true,
        stripe_onboarding_complete: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // Defensa: si el flag está en true pero faltan campos KYC, el estado está
    // corrupto. Auto-reparamos la DB (fire-and-forget) y devolvemos false
    // al cliente para que vea la realidad y pueda rehacer la verificación.
    const kycInconsistente =
      usuario.verificado_kyc &&
      (!usuario.nombre_kyc || !usuario.apellidos_kyc || !usuario.tipo_documento);

    if (kycInconsistente) {
      this.prisma.usuario
        .update({ where: { id: userId }, data: { verificado_kyc: false } })
        .catch((err) =>
          console.error('[getProfile] auto-repair KYC falló', err),
        );
      return { ...usuario, verificado_kyc: false };
    }

    return usuario;
  }

  private generateTokenResponse(usuario: {
    id: string;
    email: string;
    rol: string;
    nombre_completo: string;
    verificado_kyc: boolean;
    nombre_kyc?: string | null;
    apellidos_kyc?: string | null;
    tipo_documento?: string | null;
    stripe_account_id?: string | null;
    stripe_onboarding_complete?: boolean;
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
        nombre_kyc: usuario.nombre_kyc ?? null,
        apellidos_kyc: usuario.apellidos_kyc ?? null,
        tipo_documento: usuario.tipo_documento ?? null,
        stripe_account_id: usuario.stripe_account_id ?? null,
        stripe_onboarding_complete: usuario.stripe_onboarding_complete ?? false,
      },
    };
  }
}
