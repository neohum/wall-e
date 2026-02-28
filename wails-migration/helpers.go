package main

import (
	"fmt"
	"time"
)

func todayStr() string {
	now := time.Now()
	return fmt.Sprintf("%04d%02d%02d", now.Year(), int(now.Month()), now.Day())
}

func dateAfterDays(days int) string {
	d := time.Now().AddDate(0, 0, days)
	return fmt.Sprintf("%04d%02d%02d", d.Year(), int(d.Month()), d.Day())
}

func endOfMonthPlus2() string {
	now := time.Now()
	target := time.Date(now.Year(), now.Month()+3, 0, 0, 0, 0, 0, time.Local)
	return fmt.Sprintf("%04d%02d%02d", target.Year(), int(target.Month()), target.Day())
}
