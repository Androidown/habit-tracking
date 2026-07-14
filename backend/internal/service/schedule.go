package service

import (
	"strconv"
	"strings"
	"time"
)

// ScheduleResolver determines whether a checkin is required on a given date
// based on a habit's schedule expression.
type ScheduleResolver struct{}

// NewScheduleResolver creates a new ScheduleResolver.
func NewScheduleResolver() *ScheduleResolver {
	return &ScheduleResolver{}
}

// IsRequired returns true if a checkin is required on the given date according
// to the schedule expression.
//
// Supported expression formats:
//   - "daily" or "*" — every day of the week
//   - "1,2,3,4,5,6,7" — comma-separated weekdays (1=Monday, 7=Sunday)
func (r *ScheduleResolver) IsRequired(expression string, date time.Time) bool {
	expr := strings.TrimSpace(expression)
	if expr == "" || expr == "daily" || expr == "*" {
		return true
	}

	// Parse weekday components
	parts := strings.Split(expr, ",")
	weekday := date.Weekday()
	// Convert Go's weekday (0=Sunday, 1=Monday, ..., 6=Saturday) to
	// our convention (1=Monday, ..., 7=Sunday)
	var target int
	switch weekday {
	case time.Monday:
		target = 1
	case time.Tuesday:
		target = 2
	case time.Wednesday:
		target = 3
	case time.Thursday:
		target = 4
	case time.Friday:
		target = 5
	case time.Saturday:
		target = 6
	case time.Sunday:
		target = 7
	}

	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		n, err := strconv.Atoi(p)
		if err != nil {
			continue
		}
		if n == target {
			return true
		}
	}
	return false
}

// GenerateDateRange generates a list of dates (as YYYY-MM-DD strings) from startDate to endDate inclusive.
func (r *ScheduleResolver) GenerateDateRange(startDate, endDate time.Time) []time.Time {
	var dates []time.Time
	current := startDate
	for !current.After(endDate) {
		dates = append(dates, current)
		current = current.AddDate(0, 0, 1)
	}
	return dates
}
