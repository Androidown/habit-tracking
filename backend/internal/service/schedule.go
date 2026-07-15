package service

import (
	"strconv"
	"strings"
	"time"
)

// ScheduleResolver evaluates whether a habit with a given schedule expression
// should be executed on a specific date.
type ScheduleResolver struct{}

// NewScheduleResolver creates a new ScheduleResolver.
func NewScheduleResolver() *ScheduleResolver {
	return &ScheduleResolver{}
}

// IsRequired determines if a habit with the given schedule expression should
// be performed on the specified date.
// Supported formats:
//   - "daily" : every day
//   - "weekly:1,3,5" : specific days of week (0=Sunday, 6=Saturday)
//   - "0 9 * * 1-5" : standard 5-field cron (only day-of-week/month checked)
//   - "weekdays" : Monday through Friday
//   - "weekends" : Saturday and Sunday
func (r *ScheduleResolver) IsRequired(scheduleExpr string, date time.Time) bool {
	expr := strings.TrimSpace(strings.ToLower(scheduleExpr))
	if expr == "" || expr == "daily" {
		return true
	}

	if expr == "weekdays" {
		weekday := date.Weekday()
		return weekday >= time.Monday && weekday <= time.Friday
	}

	if expr == "weekends" {
		weekday := date.Weekday()
		return weekday == time.Saturday || weekday == time.Sunday
	}

	if strings.HasPrefix(expr, "weekly:") {
		return r.matchWeekly(expr[7:], date)
	}

	// Try to parse as cron expression (5 fields: minute hour dom month dow)
	return r.matchCron(expr, date)
}

// matchWeekly parses a comma-separated list of weekday numbers (0=Sunday, 6=Saturday).
func (r *ScheduleResolver) matchWeekly(weekdaysStr string, date time.Time) bool {
	parts := strings.Split(weekdaysStr, ",")
	targetWeekday := int(date.Weekday()) // time.Weekday: 0=Sunday, 6=Saturday

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		d, err := strconv.Atoi(part)
		if err != nil {
			continue
		}
		if d == targetWeekday {
			return true
		}
	}
	return false
}

// matchCron checks if a date matches a simplified 5-field cron expression.
// Only the day-of-week (5th field) and day-of-month (3rd field) are evaluated
// for daily/weekly/monthly requirements.
func (r *ScheduleResolver) matchCron(expr string, date time.Time) bool {
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return false // invalid cron, assume not required
	}

	// Fields: minute(0) hour(1) dom(2) month(3) dow(4)
	domField := fields[2]
	dowField := fields[4]

	domMatch := r.fieldMatches(domField, date.Day(), 1, 31)
	dowMatch := r.fieldMatches(dowField, int(date.Weekday()), 0, 6)

	// If both dom and dow are wildcard (*), it's daily
	if domField == "*" && dowField == "*" {
		return true
	}

	// If dom is wildcard, only check dow
	if domField == "*" {
		return dowMatch
	}

	// If dow is wildcard, only check dom
	if dowField == "*" {
		return domMatch
	}

	// Both have constraints - match either (cron OR logic for day)
	return domMatch || dowMatch
}

// fieldMatches checks if a value matches a cron field pattern.
// Supports: * (any), N (exact), N-M (range), N,M,... (list)
func (r *ScheduleResolver) fieldMatches(field string, value, min, max int) bool {
	field = strings.TrimSpace(field)

	if field == "*" {
		return true
	}

	// Handle comma-separated list
	if strings.Contains(field, ",") {
		parts := strings.Split(field, ",")
		for _, part := range parts {
			if r.fieldMatches(strings.TrimSpace(part), value, min, max) {
				return true
			}
		}
		return false
	}

	// Handle range (N-M)
	if strings.Contains(field, "-") {
		rangeParts := strings.SplitN(field, "-", 2)
		start, err1 := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
		end, err2 := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
		if err1 != nil || err2 != nil {
			return false
		}
		return value >= start && value <= end
	}

	// Handle step (*/N)
	if strings.HasPrefix(field, "*/") {
		step, err := strconv.Atoi(field[2:])
		if err != nil || step <= 0 {
			return false
		}
		return value%step == 0
	}

	// Single value
	n, err := strconv.Atoi(field)
	if err != nil {
		return false
	}
	return n == value
}
