import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate, PaginatedResponse } from '../common/interfaces/paginated-response.interface';

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

  async getPropietarios(pagination?: PaginationDto): Promise<PaginatedResponse<any>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = { rol: 'PROPIETARIO' as const };
    const select = {
      id: true,
      nombre_completo: true,
      email: true,
      rol: true,
      verificado_kyc: true,
      dni_nie: true,
    };

    const [data, total] = await Promise.all([
      this.prisma.usuario.findMany({
        where,
        select,
        orderBy: { verificado_kyc: 'asc' },
        take: limit,
        skip,
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return paginate(data, total, page, limit);
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
