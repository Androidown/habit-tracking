package service

import (
	"math"
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/model"
)

// DailyRecord represents one day's checkin status within a range query.
type DailyRecord struct {
	Date      string  `json:"date"`
	CheckedIn bool    `json:"checked_in"`
	Required  bool    `json:"required"`
	CheckinID *string `json:"checkin_id"`
	CreatedAt *string `json:"created_at"`
}

// CheckinHabitInfo describes the habit in the checkin query response.
type CheckinHabitInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Deleted bool   `json:"deleted"`
}

// CheckinSummary is the aggregation data in the checkin query response.
type CheckinSummary struct {
	TotalRequired  int     `json:"total_required"`
	Completed      int     `json:"completed"`
	CompletionRate float64 `json:"completion_rate"`
}

// HabitCheckinsOutput is the result of querying a habit's checkins over a date range.
type HabitCheckinsOutput struct {
	Habit    CheckinHabitInfo `json:"habit"`
	Checkins []DailyRecord   `json:"checkins"`
	Summary  CheckinSummary  `json:"summary"`
}

// CheckinService handles checkin business logic.
type CheckinService struct {
	habitModel       *model.HabitModel
	checkinModel     *model.CheckinModel
	scheduleResolver *ScheduleResolver
}

// NewCheckinService creates a new CheckinService.
func NewCheckinService(habitModel *model.HabitModel, checkinModel *model.CheckinModel, scheduleResolver *ScheduleResolver) *CheckinService {
	return &CheckinService{
		habitModel:       habitModel,
		checkinModel:     checkinModel,
		scheduleResolver: scheduleResolver,
	}
}

// GetHabitCheckins returns daily checkin records for a habit within a date range.
// It verifies the habit belongs to the given user, includes soft-deleted habits,
// and computes required status based on the habit's schedule expression.
func (s *CheckinService) GetHabitCheckins(habitID, userID, startDate, endDate string) (*HabitCheckinsOutput, error) {
	// 1. Look up habit
	habit, err := s.habitModel.FindByID(habitID)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}
	if habit == nil {
		return nil, &ServiceError{
			Code:    3001,
			Message: "HABIT_NOT_FOUND",
		}
	}

	// 2. Ownership check
	if habit.UserID != userID {
		return nil, &ServiceError{
			Code:    3003,
			Message: "FORBIDDEN",
		}
	}

	// 3. Parse dates
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, &ServiceError{
			Code:    1001,
			Message: "VALIDATION_ERROR",
			Data: []interface{}{
				map[string]string{"field": "start_date", "reason": "invalid date format, expected YYYY-MM-DD"},
			},
		}
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, &ServiceError{
			Code:    1001,
			Message: "VALIDATION_ERROR",
			Data: []interface{}{
				map[string]string{"field": "end_date", "reason": "invalid date format, expected YYYY-MM-DD"},
			},
		}
	}

	// 4. Validate range constraint
	days := end.Sub(start).Hours() / 24
	if days < 0 {
		return nil, &ServiceError{
			Code:    1001,
			Message: "VALIDATION_ERROR",
			Data: []interface{}{
				map[string]string{"field": "end_date", "reason": "end_date must not be before start_date"},
			},
		}
	}
	if days > 365 {
		return nil, &ServiceError{
			Code:    3002,
			Message: "RANGE_TOO_LARGE",
		}
	}

	// 5. Fetch existing checkins in the date range
	checkins, err := s.checkinModel.FindByHabitAndDateRange(habitID, startDate, endDate)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}

	// Build a lookup map: date -> checkin
	checkinMap := make(map[string]*model.Checkin)
	for _, c := range checkins {
		checkinMap[c.CheckinDate] = c
	}

	// 6. Generate all dates in range and build daily records
	dates := s.scheduleResolver.GenerateDateRange(start, end)
	var records []DailyRecord
	var totalRequired, completed int

	for _, d := range dates {
		dateStr := d.Format("2006-01-02")
		required := s.scheduleResolver.IsRequired(habit.ScheduleExpression, d)
		c, hasCheckin := checkinMap[dateStr]

		record := DailyRecord{
			Date:      dateStr,
			CheckedIn: hasCheckin,
			Required:  required,
		}
		if hasCheckin {
			createdAt := c.CreatedAt.Format(time.RFC3339)
			record.CheckinID = &c.ID
			record.CreatedAt = &createdAt
		}

		if required {
			totalRequired++
			if hasCheckin {
				completed++
			}
		}

		records = append(records, record)
	}

	// 7. Calculate completion rate
	var rate float64
	if totalRequired > 0 {
		rate = math.Round(float64(completed)/float64(totalRequired)*100) / 100
	}

	return &HabitCheckinsOutput{
		Habit: CheckinHabitInfo{
			ID:      habit.ID,
			Name:    habit.Name,
			Deleted: habit.IsDeleted(),
		},
		Checkins: records,
		Summary: CheckinSummary{
			TotalRequired:  totalRequired,
			Completed:      completed,
			CompletionRate: rate,
		},
	}, nil
}
