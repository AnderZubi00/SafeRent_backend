import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  // ── Viviendas ──────────────────────────────────────────────────────────────

  @Get('viviendas/pendientes')
  getViviendasPendientes() {
    return this.adminService.getViviendasPendientes();
  }

  @Patch('viviendas/:id/aprobar')
  aprobarVivienda(@Param('id') id: string) {
    return this.adminService.aprobarVivienda(id);
  }

  @Patch('viviendas/:id/rechazar')
  rechazarVivienda(@Param('id') id: string) {
    return this.adminService.rechazarVivienda(id);
  }

  // ── KYC de usuarios ────────────────────────────────────────────────────────

  @Get('usuarios/pendientes-kyc')
  getUsuariosPendientesKyc() {
    return this.adminService.getUsuariosPendientesKyc();
  }

  @Patch('usuarios/:id/aprobar-kyc')
  aprobarKyc(@Param('id') id: string) {
    return this.adminService.aprobarKyc(id);
  }

  // ── Legacy ─────────────────────────────────────────────────────────────────

  @Get('propietarios')
  getPropietarios() {
    return this.adminService.getPropietarios();
  }

  @Patch('usuarios/:id/kyc')
  toggleKyc(@Param('id') id: string) {
    return this.adminService.toggleKyc(id);
  }
}
