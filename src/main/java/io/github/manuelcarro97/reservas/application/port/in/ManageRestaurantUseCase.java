package io.github.manuelcarro97.reservas.application.port.in;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;

public interface ManageRestaurantUseCase {

	Restaurant createRestaurant(String slug, String name, String zoneId, int cancellationDeadlineHours);

	DiningTable addTable(String slug, String label, int seats, int x, int y);

	Shift addShift(String slug, String name, LocalTime start, LocalTime end, Set<DayOfWeek> days);

	void addClosure(String slug, LocalDate date, String reason);

}
