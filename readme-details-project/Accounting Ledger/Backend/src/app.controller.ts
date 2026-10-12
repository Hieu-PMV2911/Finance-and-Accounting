import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService, type HealthStatus } from './app.service.js';
import { Public } from './common/decorators/public.decorator.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Kiểm tra tình trạng API (không cần xác thực)' })
  @ApiOkResponse({ description: 'API đang hoạt động' })
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
