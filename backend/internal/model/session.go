package model

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// Session represents a user session stored in the database.
type Session struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
}

// SessionModel handles session database operations.
type SessionModel struct {
	db *sql.DB
}

// NewSessionModel creates a new SessionModel.
func NewSessionModel(db *sql.DB) *SessionModel {
	return &SessionModel{db: db}
}

// FindByID looks up a session by its ID.
func (m *SessionModel) FindByID(id string) (*Session, error) {
	s := &Session{}
	err := m.db.QueryRow(
		`SELECT id, user_id, expires_at FROM sessions WHERE id = ?`,
		id,
	).Scan(&s.ID, &s.UserID, &s.ExpiresAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return s, nil
}

// Create inserts a new session for the given user.
func (m *SessionModel) Create(userID string, expiresAt time.Time) (*Session, error) {
	id := uuid.New().String()

	_, err := m.db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		id, userID, expiresAt,
	)
	if err != nil {
		return nil, err
	}

	return &Session{
		ID:        id,
		UserID:    userID,
		ExpiresAt: expiresAt,
	}, nil
}
