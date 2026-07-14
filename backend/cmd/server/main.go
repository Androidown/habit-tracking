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

	// Models
	userModel := model.NewUserModel(db)
	sessionModel := model.NewSessionModel(db)
	habitModel := model.NewHabitModel(db)
	checkinModel := model.NewCheckinModel(db)

	// Services
	authService := service.NewAuthService(userModel, sessionModel)
	scheduleResolver := service.NewScheduleResolver()
	checkinService := service.NewCheckinService(habitModel, checkinModel, scheduleResolver)

	// Handlers
	authHandler := handler.NewAuthHandler(authService)
	checkinHandler := handler.NewCheckinHandler(checkinService)

	// Middleware
	sessionMiddleware := middleware.NewSessionMiddleware(db)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/auth/register", authHandler.Register)
	mux.Handle("GET /api/v1/habits/{habit_id}/checkins", sessionMiddleware.RequireAuth(checkinHandler.GetCheckins))

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
		`CREATE TABLE IF NOT EXISTS habits (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			schedule_expression TEXT NOT NULL DEFAULT 'daily',
			deleted_at DATETIME,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS checkins (
			id TEXT PRIMARY KEY,
			habit_id TEXT NOT NULL,
			checkin_date DATE NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (habit_id) REFERENCES habits(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_checkins_habit_date ON checkins(habit_id, checkin_date)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return err
		}
	}
	return nil
}
