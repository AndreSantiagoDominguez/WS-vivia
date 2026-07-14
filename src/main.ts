import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitado para que el front de prueba (test-client/, corre desde otro
  // origen) pueda llamar a los endpoints REST vía fetch(). No afecta las
  // conexiones WebSocket, que no están sujetas a CORS.
  app.enableCors();

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
