package model

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// Checkin represents a single check-in record.
type Checkin struct {
	ID          string    `json:"id"`
	HabitID     string    `json:"habit_id"`
	CheckinDate string    `json:"checkin_date"` // YYYY-MM-DD
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
func (m *CheckinModel) Create(habitID, checkinDate string) (*Checkin, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	_, err := m.db.Exec(
		`INSERT INTO checkins (id, habit_id, checkin_date, created_at) VALUES (?, ?, ?, ?)`,
		id, habitID, checkinDate, now,
	)
	if err != nil {
		return nil, err
	}

	return &Checkin{
		ID:          id,
		HabitID:     habitID,
		CheckinDate: checkinDate,
		CreatedAt:   now,
	}, nil
}

// FindByHabitAndDateRange returns checkins for a habit within a date range, ordered by date.
// Uses date() to normalize SQLite DATE values (which may include time components).
func (m *CheckinModel) FindByHabitAndDateRange(habitID, startDate, endDate string) ([]*Checkin, error) {
	rows, err := m.db.Query(
		`SELECT id, habit_id, checkin_date, created_at
		 FROM checkins
		 WHERE habit_id = ? AND date(checkin_date) >= date(?) AND date(checkin_date) <= date(?)
		 ORDER BY checkin_date ASC`,
		habitID, startDate, endDate,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var checkins []*Checkin
	for rows.Next() {
		c := &Checkin{}
		// Scan checkin_date as a raw value and normalize to YYYY-MM-DD
		var rawDate interface{}
		if err := rows.Scan(&c.ID, &c.HabitID, &rawDate, &c.CreatedAt); err != nil {
			return nil, err
		}
		c.CheckinDate = normalizeDate(rawDate)
		checkins = append(checkins, c)
	}
	return checkins, rows.Err()
}

// normalizeDate converts a DATE value from SQLite to YYYY-MM-DD string.
// modernc.org/sqlite may return DATE/TEXT values as time.Time or string.
func normalizeDate(v interface{}) string {
	switch val := v.(type) {
	case time.Time:
		return val.Format("2006-01-02")
	case string:
		if len(val) > 10 {
			return val[:10]
		}
		return val
	case []byte:
		s := string(val)
		if len(s) > 10 {
			return s[:10]
		}
		return s
	default:
		return ""
	}
}
