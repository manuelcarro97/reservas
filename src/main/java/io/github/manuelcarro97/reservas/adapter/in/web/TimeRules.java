package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.LocalTime;
import java.time.temporal.ChronoUnit;

final class TimeRules {

	private TimeRules() {
	}

	/** Las horas de turno van en minutos: sin segundos ni fracciones. */
	static boolean isWholeMinute(LocalTime time) {
		return time.equals(time.truncatedTo(ChronoUnit.MINUTES));
	}

}
