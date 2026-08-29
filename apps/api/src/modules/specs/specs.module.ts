import { Module } from '@nestjs/common';
import { SpecsController } from './specs.controller';

@Module({
  controllers: [SpecsController],
})
export class SpecsModule {}
