import { Controller } from '@nestjs/common';
import { HabitService } from './habit.service';

@Controller('api/v1/habits')
export class HabitController {
  constructor(private readonly habitService: HabitService) {}
  // All habit endpoints are handled by CheckinController
  // for progress-enriched responses per API contract (DEM-173).
}
