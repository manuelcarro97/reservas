package io.github.manuelcarro97.reservas.domain.model;

import java.time.ZoneId;

public record Restaurant(Long id, String slug, String name, ZoneId zone, int cancellationDeadlineHours,
		String ownerUid, PlanStatus status, RoomLayout room, Theme theme, BookingMode bookingMode) {
}
