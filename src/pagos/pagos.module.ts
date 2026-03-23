import { Module } from '@nestjs/common';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { StripeService } from './stripe.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PagosController],
  providers: [PagosService, StripeService],
  exports: [PagosService],
})
export class PagosModule {}
