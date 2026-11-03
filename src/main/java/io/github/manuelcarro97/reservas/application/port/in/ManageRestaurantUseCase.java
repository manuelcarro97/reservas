package io.github.manuelcarro97.reservas.application.port.in;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

import io.github.manuelcarro97.reservas.domain.model.Shift;

public interface ManageRestaurantUseCase {

	Shift addShift(String ownerUid, String slug, String name, LocalTime start, LocalTime end, Set<DayOfWeek> days);

	void addClosure(String ownerUid, String slug, LocalDate date, String reason);

}
