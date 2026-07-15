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
	CreatedAt time.Time `json:"created_at"`
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
	now := time.Now().UTC()

	_, err := m.db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		id, userID, expiresAt, now,
	)
	if err != nil {
		return nil, err
	}

	return &Session{
		ID:        id,
		UserID:    userID,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}, nil
}

// GetByID retrieves a session by its ID. Returns nil, nil when not found.
func (m *SessionModel) GetByID(id string) (*Session, error) {
	s := &Session{}
	err := m.db.QueryRow(
		`SELECT id, user_id, expires_at, created_at FROM sessions WHERE id = ?`,
		id,
	).Scan(&s.ID, &s.UserID, &s.ExpiresAt, &s.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return s, nil
}

// Delete removes a session by its ID.
func (m *SessionModel) Delete(id string) error {
	_, err := m.db.Exec(`DELETE FROM sessions WHERE id = ?`, id)
	return err
}

// DeleteExpired removes all sessions whose expires_at is in the past.
func (m *SessionModel) DeleteExpired() error {
	_, err := m.db.Exec(`DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP`)
	return err
}
