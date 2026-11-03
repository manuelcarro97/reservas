package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

record UpdateShiftRequest(@NotNull LocalTime start, @NotNull LocalTime end, @NotEmpty Set<DayOfWeek> days) {

	@AssertTrue(message = "start must be before end")
	boolean isStartBeforeEnd() {
		return start == null || end == null || start.isBefore(end);
	}

}
