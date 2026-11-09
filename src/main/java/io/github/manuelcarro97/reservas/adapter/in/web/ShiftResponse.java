package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;

import io.github.manuelcarro97.reservas.domain.model.Shift;

record ShiftResponse(Long id, String name, LocalTime start, LocalTime end, List<DayOfWeek> days) {

	static ShiftResponse from(Shift shift) {
		return new ShiftResponse(shift.id(), shift.name(), shift.start(), shift.end(),
				shift.days().stream().sorted().toList());
	}

}
