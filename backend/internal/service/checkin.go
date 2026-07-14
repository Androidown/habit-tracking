package service

import (
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/middleware"
	"github.com/Androidown/habit-tracking/backend/internal/model"
)

// DailyHabit represents a habit's check-in status for a given day.
type DailyHabit struct {
	HabitID     string  `json:"habit_id"`
	HabitName   string  `json:"habit_name"`
	CheckedIn   bool    `json:"checked_in"`
	Required    bool    `json:"required"`
	CheckinID   *string `json:"checkin_id"`
	CompletedAt *string `json:"completed_at"`
}

// DailyStats represents the aggregated statistics for a day's habits.
type DailyStats struct {
	Required     int `json:"required"`
	Completed    int `json:"completed"`
	TotalHabits  int `json:"total_habits"`
}

// DailyCheckinsResponse is the response for GET /api/v1/checkins/daily.
type DailyCheckinsResponse struct {
	Date   string       `json:"date"`
	Habits []DailyHabit `json:"habits"`
	Stats  DailyStats   `json:"stats"`
}

// CheckinService handles check-in business logic.
type CheckinService struct {
	habitModel  *model.HabitModel
	checkinModel *model.CheckinModel
	resolver    *ScheduleResolver
}

// NewCheckinService creates a new CheckinService.
func NewCheckinService(habitModel *model.HabitModel, checkinModel *model.CheckinModel, resolver *ScheduleResolver) *CheckinService {
	return &CheckinService{
		habitModel:   habitModel,
		checkinModel: checkinModel,
		resolver:     resolver,
	}
}

// GetDailyCheckins returns the check-in status for all active habits of a user
// on the specified date, including whether each habit is required and checked in.
func (s *CheckinService) GetDailyCheckins(userID, dateStr string) (*DailyCheckinsResponse, error) {
	// Parse the date
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, &ServiceError{
			Code:    1001,
			Message: "VALIDATION_ERROR",
			Data: []middleware.ValidationError{
				{Field: "date", Reason: "invalid date format, expected YYYY-MM-DD"},
			},
		}
	}

	// Get all active habits for the user
	habits, err := s.habitModel.FindActiveByUserID(userID)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}

	// Get all checkins for this user on this date
	checkins, err := s.checkinModel.FindByUserAndDate(userID, dateStr)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}

	// Build a lookup map: habit_id -> checkin
	checkinMap := make(map[string]*model.Checkin, len(checkins))
	for _, c := range checkins {
		checkinMap[c.HabitID] = c
	}

	// Build the response
	dailyHabits := make([]DailyHabit, 0, len(habits))
	stats := DailyStats{
		TotalHabits: len(habits),
	}

	for _, h := range habits {
		required := s.resolver.IsRequired(h.ScheduleExpr, date)
		ch, checkedIn := checkinMap[h.ID]

		habit := DailyHabit{
			HabitID:   h.ID,
			HabitName: h.Name,
			CheckedIn: checkedIn,
			Required:  required,
		}

		if checkedIn && ch != nil {
			checkinID := ch.ID
			completedAt := ch.CompletedAt.Format(time.RFC3339)
			habit.CheckinID = &checkinID
			habit.CompletedAt = &completedAt
		}

		if required {
			stats.Required++
		}
		if checkedIn {
			stats.Completed++
		}

		dailyHabits = append(dailyHabits, habit)
	}

	return &DailyCheckinsResponse{
		Date:   dateStr,
		Habits: dailyHabits,
		Stats:  stats,
	}, nil
}
