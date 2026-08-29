import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SpecsModule } from './modules/specs/specs.module';
import { RunsModule } from './modules/runs/runs.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        customProps: () => ({
          service: 'specforge-api',
        }),
        serializers: {
          req: (req: { method?: string; url?: string }) => ({
            method: req.method,
            url: req.url,
          }),
        },
      },
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
    AuthModule,
    OrgsModule,
    ProjectsModule,
    SpecsModule,
    RunsModule,
    HealthModule,
  ],
})
export class AppModule {}
