package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"github.com/Androidown/habit-tracking/backend/internal/handler"
	"github.com/Androidown/habit-tracking/backend/internal/middleware"
	"github.com/Androidown/habit-tracking/backend/internal/model"
	"github.com/Androidown/habit-tracking/backend/internal/service"
	_ "modernc.org/sqlite"
)

func main() {
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "./habit-tracking.db"
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	if err := runMigrations(db); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	userModel := model.NewUserModel(db)
	sessionModel := model.NewSessionModel(db)
	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)

	authService := service.NewAuthService(userModel, sessionModel)
	habitService := service.NewHabitService(habitModel, checkinModel)

	authHandler := handler.NewAuthHandler(authService)
	habitHandler := handler.NewHabitHandler(habitService)

	authMW := middleware.AuthMiddleware(sessionModel)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/auth/register", authHandler.Register)
	mux.Handle("GET /api/v1/habits", authMW(http.HandlerFunc(habitHandler.List)))
	mux.Handle("DELETE /api/v1/habits/{id}", authMW(http.HandlerFunc(habitHandler.Delete)))

	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	log.Printf("server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func runMigrations(db *sql.DB) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			username TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			expires_at DATETIME NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
		`CREATE TABLE IF NOT EXISTS habits (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at DATETIME DEFAULT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_habits_deleted_at ON habits(deleted_at)`,
		`CREATE TABLE IF NOT EXISTS checkins (
			id TEXT PRIMARY KEY,
			habit_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			checkin_date DATE NOT NULL,
			note TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (habit_id) REFERENCES habits(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_checkins_habit_id ON checkins(habit_id)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return err
		}
	}
	return nil
}
