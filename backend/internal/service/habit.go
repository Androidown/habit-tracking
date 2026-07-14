package service

import (
	"time"

	"github.com/Androidown/habit-tracking/backend/internal/model"
)

// HabitService handles habit-related business logic.
type HabitService struct {
	habitModel   *model.HabitModel
	checkinModel *model.CheckinModel
}

// NewHabitService creates a new HabitService.
func NewHabitService(habitModel *model.HabitModel, checkinModel *model.CheckinModel) *HabitService {
	return &HabitService{
		habitModel:   habitModel,
		checkinModel: checkinModel,
	}
}

// DeleteOutput is the result of a successful soft-delete.
type DeleteOutput struct {
	Deleted   bool      `json:"deleted"`
	DeletedAt time.Time `json:"deleted_at"`
}

// SoftDelete performs a soft-delete on a habit and cascades to its check-in
// records. It verifies the habit exists, belongs to the user, and is not
// already deleted. Returns the habit's deletion timestamp.
func (s *HabitService) SoftDelete(habitID, userID string) (*DeleteOutput, error) {
	// Verify habit exists and belongs to user before cascade
	habit, err := s.habitModel.FindByID(habitID)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}
	if habit == nil || habit.DeletedAt != nil {
		return nil, &ServiceError{
			Code:    1004,
			Message: "NOT_FOUND",
		}
	}
	if habit.UserID != userID {
		return nil, &ServiceError{
			Code:    1004,
			Message: "NOT_FOUND",
		}
	}

	// Soft-delete the habit (sets deleted_at)
	deletedAt, err := s.habitModel.SoftDelete(habitID, userID)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}

	// Cascade: physically delete all check-in records for this habit
	if _, err := s.checkinModel.DeleteByHabitID(habitID); err != nil {
		// Log but don't fail — the habit is already marked deleted.
		// In production, this should be a transaction.
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}

	return &DeleteOutput{
		Deleted:   true,
		DeletedAt: deletedAt,
	}, nil
}

// ListActive returns all non-deleted habits for the given user.
func (s *HabitService) ListActive(userID string) ([]*model.Habit, error) {
	habits, err := s.habitModel.FindActiveByUserID(userID)
	if err != nil {
		return nil, &ServiceError{
			Code:    9999,
			Message: "INTERNAL_ERROR",
		}
	}
	return habits, nil
}
