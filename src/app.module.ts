import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { EmailModule } from './email/email.module';
import { ViviendasModule } from './viviendas/viviendas.module';
import { SolicitudesModule } from './solicitudes/solicitudes.module';
import { ContratosModule } from './contratos/contratos.module';
import { PagosModule } from './pagos/pagos.module';
import { KycModule } from './kyc/kyc.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60000, limit: 300 },
        // Estos dos tienen límite alto globalmente — los @Throttle() en endpoints
        // específicos los sobreescriben con límites bajos donde corresponde
        { name: 'strict', ttl: 60000, limit: 1000 },
        { name: 'kyc', ttl: 60000, limit: 1000 },
      ],
    }),
    PrismaModule,
    StorageModule,
    EmailModule,
    AuthModule,
    ViviendasModule,
    SolicitudesModule,
    ContratosModule,
    PagosModule,
    KycModule,
    AdminModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
