package model

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// Habit represents a habit record in the database.
type Habit struct {
	ID                 string       `json:"id"`
	UserID             string       `json:"user_id"`
	Name               string       `json:"name"`
	Description        string       `json:"description"`
	ScheduleExpression string       `json:"schedule_expression"`
	DeletedAt          sql.NullTime `json:"deleted_at,omitempty"`
	CreatedAt          time.Time    `json:"created_at"`
	UpdatedAt          time.Time    `json:"updated_at"`
}

// HabitModel handles habit database operations.
type HabitModel struct {
	db *sql.DB
}

// NewHabitModel creates a new HabitModel.
func NewHabitModel(db *sql.DB) *HabitModel {
	return &HabitModel{db: db}
}

// Create inserts a new habit.
func (m *HabitModel) Create(userID, name, description, scheduleExpression string) (*Habit, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	_, err := m.db.Exec(
		`INSERT INTO habits (id, user_id, name, description, schedule_expression, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, userID, name, description, scheduleExpression, now, now,
	)
	if err != nil {
		return nil, err
	}

	return &Habit{
		ID:                 id,
		UserID:             userID,
		Name:               name,
		Description:        description,
		ScheduleExpression: scheduleExpression,
		CreatedAt:          now,
		UpdatedAt:          now,
	}, nil
}

// FindByID looks up a habit by ID, including soft-deleted ones.
func (m *HabitModel) FindByID(id string) (*Habit, error) {
	h := &Habit{}
	var deletedAt sql.NullTime
	err := m.db.QueryRow(
		`SELECT id, user_id, name, description, schedule_expression, deleted_at, created_at, updated_at
		 FROM habits WHERE id = ?`, id,
	).Scan(&h.ID, &h.UserID, &h.Name, &h.Description, &h.ScheduleExpression, &deletedAt, &h.CreatedAt, &h.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	h.DeletedAt = deletedAt
	return h, nil
}

// IsDeleted returns true if the habit has been soft-deleted.
func (h *Habit) IsDeleted() bool {
	return h.DeletedAt.Valid
}
