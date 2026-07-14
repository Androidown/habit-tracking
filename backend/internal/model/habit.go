package model

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// HabitStatus represents the status of a habit.
type HabitStatus string

const (
	HabitStatusActive  HabitStatus = "active"
	HabitStatusDeleted HabitStatus = "deleted"
)

// Habit represents a user's habit record in the database.
type Habit struct {
	ID           string      `json:"id"`
	UserID       string      `json:"user_id"`
	Name         string      `json:"name"`
	ScheduleExpr string      `json:"schedule_expr"`
	Status       HabitStatus `json:"status"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}

// HabitModel handles habit database operations.
type HabitModel struct {
	db *sql.DB
}

// NewHabitModel creates a new HabitModel.
func NewHabitModel(db *sql.DB) *HabitModel {
	return &HabitModel{db: db}
}

// Create inserts a new habit for the given user.
func (m *HabitModel) Create(userID, name, scheduleExpr string) (*Habit, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	_, err := m.db.Exec(
		`INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, userID, name, scheduleExpr, HabitStatusActive, now, now,
	)
	if err != nil {
		return nil, err
	}

	return &Habit{
		ID:           id,
		UserID:       userID,
		Name:         name,
		ScheduleExpr: scheduleExpr,
		Status:       HabitStatusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

// FindActiveByUserID retrieves all active habits for a given user.
func (m *HabitModel) FindActiveByUserID(userID string) ([]*Habit, error) {
	rows, err := m.db.Query(
		`SELECT id, user_id, name, schedule_expr, status, created_at, updated_at FROM habits WHERE user_id = ? AND status = ? ORDER BY created_at`,
		userID, HabitStatusActive,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var habits []*Habit
	for rows.Next() {
		h := &Habit{}
		if err := rows.Scan(&h.ID, &h.UserID, &h.Name, &h.ScheduleExpr, &h.Status, &h.CreatedAt, &h.UpdatedAt); err != nil {
			return nil, err
		}
		habits = append(habits, h)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if habits == nil {
		habits = []*Habit{}
	}
	return habits, nil
}

// FindByID retrieves a habit by its ID.
func (m *HabitModel) FindByID(id string) (*Habit, error) {
	h := &Habit{}
	err := m.db.QueryRow(
		`SELECT id, user_id, name, schedule_expr, status, created_at, updated_at FROM habits WHERE id = ?`,
		id,
	).Scan(&h.ID, &h.UserID, &h.Name, &h.ScheduleExpr, &h.Status, &h.CreatedAt, &h.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return h, nil
}
