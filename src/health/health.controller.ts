import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Sin autenticación a propósito: lo pega el VPS/CI-CD para decidir si el
 * deploy quedó sano antes de cortar tráfico a la versión anterior — no tiene
 * ningún JWT con el cual autenticarse.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({
    summary: 'Confirma que el server responde y que Postgres está alcanzable.',
  })
  @ApiResponse({ status: 200, description: 'El server y la base están sanos.' })
  @ApiResponse({ status: 503, description: 'La base no responde.' })
  async check(): Promise<{ status: 'ok'; database: 'up' }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok', database: 'up' };
  }
}
