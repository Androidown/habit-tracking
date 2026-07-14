package model

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// Checkin represents a daily check-in record in the database.
type Checkin struct {
	ID          string    `json:"id"`
	HabitID     string    `json:"habit_id"`
	UserID      string    `json:"user_id"`
	CheckinDate string    `json:"checkin_date"` // YYYY-MM-DD
	CompletedAt time.Time `json:"completed_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// CheckinModel handles checkin database operations.
type CheckinModel struct {
	db *sql.DB
}

// NewCheckinModel creates a new CheckinModel.
func NewCheckinModel(db *sql.DB) *CheckinModel {
	return &CheckinModel{db: db}
}

// Create inserts a new checkin record.
func (m *CheckinModel) Create(habitID, userID, checkinDate string) (*Checkin, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	_, err := m.db.Exec(
		`INSERT INTO checkins (id, habit_id, user_id, checkin_date, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, habitID, userID, checkinDate, now, now,
	)
	if err != nil {
		return nil, err
	}

	return &Checkin{
		ID:          id,
		HabitID:     habitID,
		UserID:      userID,
		CheckinDate: checkinDate,
		CompletedAt: now,
		CreatedAt:   now,
	}, nil
}

// FindByUserAndDate retrieves all checkins for a user on a specific date.
func (m *CheckinModel) FindByUserAndDate(userID, date string) ([]*Checkin, error) {
	rows, err := m.db.Query(
		`SELECT id, habit_id, user_id, checkin_date, completed_at, created_at FROM checkins WHERE user_id = ? AND checkin_date = ?`,
		userID, date,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var checkins []*Checkin
	for rows.Next() {
		c := &Checkin{}
		if err := rows.Scan(&c.ID, &c.HabitID, &c.UserID, &c.CheckinDate, &c.CompletedAt, &c.CreatedAt); err != nil {
			return nil, err
		}
		checkins = append(checkins, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if checkins == nil {
		checkins = []*Checkin{}
	}
	return checkins, nil
}
