import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './login.dto';
import { RegisterDto } from './dto/register.dto';
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

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!usuario) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }

    // Si el usuario fue creado vía Supabase Auth, no tiene hash real
    if (usuario.contrasena_hash === 'supabase_managed') {
      throw new UnauthorizedException(
        'Este usuario debe autenticarse vía Supabase. Usa el endpoint /auth/exchange.',
      );
    }

    const passwordValida = await bcrypt.compare(
      dto.contrasena,
      usuario.contrasena_hash,
    );

    if (!passwordValida) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }

    return this.generateTokenResponse(usuario);
  }

  async register(dto: RegisterDto) {
    const existente = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (existente) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const hash = await bcrypt.hash(dto.contrasena, 10);

    const usuario = await this.prisma.usuario.create({
      data: {
        email: dto.email,
        contrasena_hash: hash,
        nombre_completo: dto.nombre_completo,
        rol: dto.rol,
      },
    });

    return this.generateTokenResponse(usuario);
  }

  async exchange(dto: ExchangeTokenDto) {
    // Verificar el token de Supabase usando la API admin
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser(dto.supabase_token);

    if (error || !user) {
      throw new UnauthorizedException('Token de Supabase inválido o expirado');
    }

    // Buscar el usuario en nuestra BD
    let usuario = await this.prisma.usuario.findUnique({
      where: { id: user.id },
    });

    // Si el usuario no existe y se proporcionan datos de registro, crearlo
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
