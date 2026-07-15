import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module';
import { HabitModule } from './modules/habit/habit.module';
import { CheckinModule } from './modules/checkin/checkin.module';

@Module({
  imports: [PrismaModule, HabitModule, CheckinModule],
})
export class AppModule {}
