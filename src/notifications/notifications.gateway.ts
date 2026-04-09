import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin:
      process.env.NODE_ENV !== 'production'
        ? /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/
        : [
            process.env.FRONTEND_URL ?? '',
            /^https:\/\/saferent(-[a-z0-9]+)?-anderzubi00s-projects\.vercel\.app$/,
          ],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('NotificationsGateway');

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = await this.jwtService.verifyAsync(token);
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected: ${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  private extractToken(client: Socket): string | undefined {
    // 1. HttpOnly cookie (web)
    const rawCookie = client.handshake.headers.cookie ?? '';
    const match = rawCookie.match(/(?:^|;\s*)saferent_jwt=([^;]+)/);
    if (match?.[1]) return match[1];

    // 2. auth.token (mobile / legacy)
    const authToken = client.handshake.auth?.token;
    if (authToken) return authToken as string;

    // 3. query param fallback
    const queryToken = client.handshake.query?.token;
    return queryToken ? (queryToken as string) : undefined;
  }

  handleDisconnect(client: Socket) {
    this.logger.log(
      `Client disconnected: ${client.data?.userId || 'unknown'}`,
    );
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
