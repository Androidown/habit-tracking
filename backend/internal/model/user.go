package model

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// User represents a user record in the database.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// UserModel handles user database operations.
type UserModel struct {
	db *sql.DB
}

// NewUserModel creates a new UserModel.
func NewUserModel(db *sql.DB) *UserModel {
	return &UserModel{db: db}
}

// Create inserts a new user into the database.
func (m *UserModel) Create(email, username, passwordHash string) (*User, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	_, err := m.db.Exec(
		`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, email, username, passwordHash, now, now,
	)
	if err != nil {
		return nil, err
	}

	return &User{
		ID:           id,
		Email:        email,
		Username:     username,
		PasswordHash: passwordHash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

// FindByEmail looks up a user by email.
func (m *UserModel) FindByEmail(email string) (*User, error) {
	u := &User{}
	err := m.db.QueryRow(
		`SELECT id, email, username, password_hash, created_at, updated_at FROM users WHERE email = ?`,
		email,
	).Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}
