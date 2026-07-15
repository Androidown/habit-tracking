/**
 * 习惯业务逻辑
 *
 * 提供习惯列表查询等业务操作。
 */
import { HabitModel, HabitRow, ListHabitsParams, ListHabitsResult } from '../models/habit.model';

export interface ListHabitsInput {
  userId: string;
  status: 'active' | 'all' | 'archived';
  page: number;
  pageSize: number;
}

export interface ListHabitsOutput {
  items: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export class HabitService {
  constructor(private habitModel: HabitModel) {}

  /**
   * 查询当前用户的习惯列表。
   *
   * 业务规则：
   *   1. 校验 page 和 pageSize 参数范围
   *   2. 委托模型层执行查询
   *   3. 格式化分页响应
   */
  list(input: ListHabitsInput): ListHabitsOutput {
    const { userId, status, page, pageSize } = input;

    // 委托模型层查询
    const params: ListHabitsParams = {
      userId,
      status,
      page,
      pageSize,
    };

    const result: ListHabitsResult = this.habitModel.list(params);

    // 格式化响应（移除敏感/内部字段）
    const items = result.items.map((habit: HabitRow) => ({
      id: habit.id,
      name: habit.name,
      description: habit.description,
      status: habit.status,
      created_at: habit.created_at,
      updated_at: habit.updated_at,
    }));

    const totalPages = Math.ceil(result.total / pageSize) || 0;

    return {
      items,
      pagination: {
        page,
        page_size: pageSize,
        total: result.total,
        total_pages: totalPages,
      },
    };
  }
}
