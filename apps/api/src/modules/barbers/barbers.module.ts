import { Module } from '@nestjs/common';
import { BarbersController } from './barbers.controller.js';

@Module({ controllers: [BarbersController] })
export class BarbersModule {}
