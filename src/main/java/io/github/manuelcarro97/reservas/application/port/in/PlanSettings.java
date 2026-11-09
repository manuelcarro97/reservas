package io.github.manuelcarro97.reservas.application.port.in;

import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.Theme;

public record PlanSettings(String name, Theme theme, BookingMode bookingMode, int cancellationDeadlineHours) {
}
