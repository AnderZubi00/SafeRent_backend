import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PagosService } from './pagos.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@Controller('pagos')
@UseGuards(JwtAuthGuard)
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  registrar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePagoDto,
  ) {
    return this.pagosService.registrar(user.sub, dto);
  }

  @Get('inquilino')
  @UseGuards(RolesGuard)
  @Roles('INQUILINO')
  findByInquilino(@CurrentUser() user: JwtPayload) {
    return this.pagosService.findByInquilino(user.sub);
  }

  @Get('propietario')
  @UseGuards(RolesGuard)
  @Roles('PROPIETARIO')
  findByPropietario(@CurrentUser() user: JwtPayload) {
    return this.pagosService.findByPropietario(user.sub);
  }
}
