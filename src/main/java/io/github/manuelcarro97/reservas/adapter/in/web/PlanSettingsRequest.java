package io.github.manuelcarro97.reservas.adapter.in.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.github.manuelcarro97.reservas.application.port.in.PlanSettings;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.Theme;

record PlanSettingsRequest(@NotBlank @Size(max = 120) @Pattern(regexp = TextRules.NO_NUL) String name,
		@NotNull Theme theme, @NotNull BookingMode bookingMode, @Min(0) int cancellationDeadlineHours) {

	PlanSettings toSettings() {
		return new PlanSettings(name, theme, bookingMode, cancellationDeadlineHours);
	}

}
