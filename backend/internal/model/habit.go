package model

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// Habit represents a habit record in the database.
type Habit struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
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
func (m *HabitModel) Create(userID, name, description string) (*Habit, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	_, err := m.db.Exec(
		`INSERT INTO habits (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, userID, name, description, now, now,
	)
	if err != nil {
		return nil, err
	}

	return &Habit{
		ID:          id,
		UserID:      userID,
		Name:        name,
		Description: description,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

// FindByID looks up a habit by its ID, regardless of deleted_at state.
func (m *HabitModel) FindByID(id string) (*Habit, error) {
	h := &Habit{}
	var deletedAt sql.NullTime
	err := m.db.QueryRow(
		`SELECT id, user_id, name, description, created_at, updated_at, deleted_at FROM habits WHERE id = ?`,
		id,
	).Scan(&h.ID, &h.UserID, &h.Name, &h.Description, &h.CreatedAt, &h.UpdatedAt, &deletedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if deletedAt.Valid {
		h.DeletedAt = &deletedAt.Time
	}
	return h, nil
}

// FindActiveByUserID returns all non-deleted habits for the given user.
func (m *HabitModel) FindActiveByUserID(userID string) ([]*Habit, error) {
	rows, err := m.db.Query(
		`SELECT id, user_id, name, description, created_at, updated_at, deleted_at
		   FROM habits
		  WHERE user_id = ? AND deleted_at IS NULL
		  ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var habits []*Habit
	for rows.Next() {
		h := &Habit{}
		var deletedAt sql.NullTime
		if err := rows.Scan(&h.ID, &h.UserID, &h.Name, &h.Description, &h.CreatedAt, &h.UpdatedAt, &deletedAt); err != nil {
			return nil, err
		}
		if deletedAt.Valid {
			h.DeletedAt = &deletedAt.Time
		}
		habits = append(habits, h)
	}
	return habits, rows.Err()
}

// SoftDelete sets deleted_at to NOW() for the given habit owned by the user and
// currently not deleted. Returns the deletion timestamp.
// Returns sql.ErrNoRows if the habit does not exist, is not owned by the user,
// or is already deleted.
func (m *HabitModel) SoftDelete(id, userID string) (time.Time, error) {
	now := time.Now().UTC()
	result, err := m.db.Exec(
		`UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		now, now, id, userID,
	)
	if err != nil {
		return time.Time{}, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return time.Time{}, err
	}
	if rows == 0 {
		return time.Time{}, sql.ErrNoRows
	}
	return now, nil
}
