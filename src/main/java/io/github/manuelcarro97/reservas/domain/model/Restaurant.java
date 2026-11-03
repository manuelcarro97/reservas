package io.github.manuelcarro97.reservas.domain.model;

import java.time.ZoneId;

public record Restaurant(Long id, String slug, String name, ZoneId zone, int cancellationDeadlineHours,
		String ownerUid, PlanStatus status, RoomLayout room, Theme theme, BookingMode bookingMode) {

	public Restaurant withSettings(String name, Theme theme, BookingMode bookingMode, int cancellationDeadlineHours) {
		return new Restaurant(id, slug, name, zone, cancellationDeadlineHours, ownerUid, status, room, theme,
				bookingMode);
	}

	public Restaurant published() {
		return new Restaurant(id, slug, name, zone, cancellationDeadlineHours, ownerUid, PlanStatus.PUBLISHED, room,
				theme, bookingMode);
	}

	public boolean isOwnedBy(String uid) {
		return uid != null && uid.equals(ownerUid);
	}

}
