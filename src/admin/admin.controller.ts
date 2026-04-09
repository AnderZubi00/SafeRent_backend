import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PaginationDto } from '../common/dto/pagination.dto';
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

  @Get('propietarios')
  getPropietarios(@Query() pagination: PaginationDto) {
    return this.adminService.getPropietarios(pagination);
  }

  @Patch('usuarios/:id/kyc')
  toggleKyc(@Param('id') id: string) {
    return this.adminService.toggleKyc(id);
  }
}
