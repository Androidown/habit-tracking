package model

import (
	"database/sql"
)

// Checkin represents a single check-in record for a habit.
type Checkin struct {
	ID          string `json:"id"`
	HabitID     string `json:"habit_id"`
	UserID      string `json:"user_id"`
	CheckinDate string `json:"checkin_date"`
	Note        string `json:"note,omitempty"`
	CreatedAt   string `json:"created_at"`
}

// CheckinModel handles check-in database operations.
type CheckinModel struct {
	db *sql.DB
}

// NewCheckinModel creates a new CheckinModel.
func NewCheckinModel(db *sql.DB) *CheckinModel {
	return &CheckinModel{db: db}
}

// DeleteByHabitID physically deletes all check-in records for the given habit.
// Returns the number of records deleted.
func (m *CheckinModel) DeleteByHabitID(habitID string) (int64, error) {
	result, err := m.db.Exec(
		`DELETE FROM checkins WHERE habit_id = ?`,
		habitID,
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// CountByHabitID returns the number of check-in records for the given habit.
func (m *CheckinModel) CountByHabitID(habitID string) (int, error) {
	var count int
	err := m.db.QueryRow(
		`SELECT COUNT(*) FROM checkins WHERE habit_id = ?`,
		habitID,
	).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}
