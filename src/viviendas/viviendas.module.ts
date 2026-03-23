import { Module } from '@nestjs/common';
import { ViviendasController } from './viviendas.controller';
import { ViviendasService } from './viviendas.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ViviendasController],
  providers: [ViviendasService],
  exports: [ViviendasService],
})
export class ViviendasModule {}
