import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      totalUsuarios,
      totalViviendas,
      viviendasVerificadas,
      viviendasPendientes,
      solicitudesPendientes,
      usuariosPendientesKyc,
    ] = await Promise.all([
      this.prisma.usuario.count(),
      this.prisma.vivienda.count(),
      this.prisma.vivienda.count({ where: { verificada: true } }),
      this.prisma.vivienda.count({ where: { verificada: false, activa: true } }),
      this.prisma.solicitud.count({ where: { estado: 'PENDIENTE' } }),
      this.prisma.usuario.count({ where: { verificado_kyc: false } }),
    ]);

    return {
      totalUsuarios,
      totalViviendas,
      viviendasVerificadas,
      viviendasPendientes,
      solicitudesPendientes,
      usuariosPendientesKyc,
    };
  }

  // ── Viviendas ──────────────────────────────────────────────────────────────

  async getViviendasPendientes() {
    return this.prisma.vivienda.findMany({
      where: { verificada: false, activa: true },
      select: {
        id: true,
        titulo: true,
        direccion: true,
        ciudad: true,
        provincia: true,
        num_registro_vivienda: true,
        nota_simple_url: true,
        fotos: true,
        fecha_creacion: true,
        propietario: {
          select: { id: true, nombre_completo: true, email: true },
        },
      },
      orderBy: { fecha_creacion: 'asc' },
    });
  }

  async aprobarVivienda(id: string) {
    const vivienda = await this.prisma.vivienda.findUnique({ where: { id } });
    if (!vivienda) throw new NotFoundException('Vivienda no encontrada');

    return this.prisma.vivienda.update({
      where: { id },
      data: { verificada: true },
      select: { id: true, titulo: true, verificada: true },
    });
  }

  async rechazarVivienda(id: string) {
    const vivienda = await this.prisma.vivienda.findUnique({ where: { id } });
    if (!vivienda) throw new NotFoundException('Vivienda no encontrada');

    return this.prisma.vivienda.update({
      where: { id },
      data: { activa: false },
      select: { id: true, titulo: true, activa: true },
    });
  }

  // ── KYC de usuarios ────────────────────────────────────────────────────────

  async getUsuariosPendientesKyc() {
    return this.prisma.usuario.findMany({
      where: { verificado_kyc: false },
      select: {
        id: true,
        nombre_completo: true,
        email: true,
        rol: true,
        dni_nie: true,
        fecha_creacion: true,
        kyc_sesiones: {
          orderBy: { creado_en: 'desc' },
          take: 1,
          select: {
            id: true,
            estado: true,
            dni_extraido: true,
            nombre_extraido: true,
            creado_en: true,
          },
        },
      },
      orderBy: { fecha_creacion: 'asc' },
    });
  }

  async aprobarKyc(userId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.usuario.update({
      where: { id: userId },
      data: { verificado_kyc: true },
      select: { id: true, nombre_completo: true, verificado_kyc: true },
    });
  }

  // ── Propietarios (legacy) ──────────────────────────────────────────────────

  async getPropietarios() {
    return this.prisma.usuario.findMany({
      where: { rol: 'PROPIETARIO' },
      select: {
        id: true,
        nombre_completo: true,
        email: true,
        rol: true,
        verificado_kyc: true,
        dni_nie: true,
      },
      orderBy: { verificado_kyc: 'asc' },
    });
  }

  async toggleKyc(userId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { verificado_kyc: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.usuario.update({
      where: { id: userId },
      data: { verificado_kyc: !usuario.verificado_kyc },
      select: { id: true, nombre_completo: true, verificado_kyc: true },
    });
  }
}
