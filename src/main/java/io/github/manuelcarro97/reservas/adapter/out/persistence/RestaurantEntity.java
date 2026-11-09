package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.time.ZoneId;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.RoomShape;
import io.github.manuelcarro97.reservas.domain.model.Theme;

@Entity
@Table(name = "restaurant")
class RestaurantEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String slug;

	private String name;

	@Column(name = "zone_id")
	private String zoneId;

	@Column(name = "cancellation_deadline_hours")
	private int cancellationDeadlineHours;

	@Column(name = "owner_uid")
	private String ownerUid;

	@Enumerated(EnumType.STRING)
	private PlanStatus status;

	@Enumerated(EnumType.STRING)
	@Column(name = "room_shape")
	private RoomShape roomShape;

	@Column(name = "room_width")
	private int roomWidth;

	@Column(name = "room_height")
	private int roomHeight;

	@Column(name = "room_cut_width")
	private int roomCutWidth;

	@Column(name = "room_cut_depth")
	private int roomCutDepth;

	@Column(name = "room_rotation")
	private int roomRotation;

	@Enumerated(EnumType.STRING)
	private Theme theme;

	@Enumerated(EnumType.STRING)
	@Column(name = "booking_mode")
	private BookingMode bookingMode;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	protected RestaurantEntity() {
	}

	static RestaurantEntity from(Restaurant restaurant) {
		RestaurantEntity entity = new RestaurantEntity();
		entity.id = restaurant.id();
		entity.slug = restaurant.slug();
		entity.name = restaurant.name();
		entity.zoneId = restaurant.zone().getId();
		entity.cancellationDeadlineHours = restaurant.cancellationDeadlineHours();
		entity.ownerUid = restaurant.ownerUid();
		entity.status = restaurant.status();
		entity.roomShape = restaurant.room().shape();
		entity.roomWidth = restaurant.room().width();
		entity.roomHeight = restaurant.room().height();
		entity.roomCutWidth = restaurant.room().cutWidth();
		entity.roomCutDepth = restaurant.room().cutDepth();
		entity.roomRotation = restaurant.room().rotation();
		entity.theme = restaurant.theme();
		entity.bookingMode = restaurant.bookingMode();
		return entity;
	}

	boolean isDeleted() {
		return deletedAt != null;
	}

	Restaurant toDomain() {
		RoomLayout room = new RoomLayout(roomShape, roomWidth, roomHeight, roomCutWidth, roomCutDepth, roomRotation);
		return new Restaurant(id, slug, name, ZoneId.of(zoneId), cancellationDeadlineHours, ownerUid, status, room,
				theme, bookingMode);
	}

}
