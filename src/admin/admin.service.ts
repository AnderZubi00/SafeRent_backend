import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalUsuarios, totalViviendas, viviendasVerificadas, solicitudesPendientes] =
      await Promise.all([
        this.prisma.usuario.count(),
        this.prisma.vivienda.count(),
        this.prisma.vivienda.count({ where: { verificada: true } }),
        this.prisma.solicitud.count({ where: { estado: 'PENDIENTE' } }),
      ]);

    return {
      totalUsuarios,
      totalViviendas,
      viviendasVerificadas,
      solicitudesPendientes,
    };
  }

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

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.prisma.usuario.update({
      where: { id: userId },
      data: { verificado_kyc: !usuario.verificado_kyc },
      select: {
        id: true,
        nombre_completo: true,
        verificado_kyc: true,
      },
    });
  }
}
