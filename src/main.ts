import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Solo en desarrollo: habilita que el front de prueba (test-client/, corre
  // desde otro origen) y Swagger puedan llamar a los endpoints REST vía
  // fetch(). En producción queda cerrado — el único consumidor real es la
  // app Flutter (cliente nativo), que no está sujeta a CORS en absoluto (esa
  // restricción solo aplica a clientes que corren dentro de un navegador).
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors();
  }

  // Adaptador de WebSocket puro (`ws`), explícitamente en vez del default de Socket.io.
  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger solo documenta los endpoints REST — el protocolo de WebSocket
  // (joinConversation/newMessage/typing/markRead) sigue documentado en el
  // comentario al inicio de infrastructure/websocket/chat.gateway.ts, porque
  // OpenAPI no describe WebSockets.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Vivia Chat Service')
    .setDescription(
      'API REST del chat de Vivia. El protocolo de WebSocket (joinConversation/newMessage/typing/markRead) no está acá — ver el comentario al inicio de chat.gateway.ts.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

void bootstrap();
