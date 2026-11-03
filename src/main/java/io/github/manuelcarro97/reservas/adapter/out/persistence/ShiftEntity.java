package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.Set;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import io.github.manuelcarro97.reservas.domain.model.Shift;

@Entity
@Table(name = "shift")
class ShiftEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "restaurant_id")
	private long restaurantId;

	private String name;

	@Column(name = "start_time")
	private LocalTime startTime;

	@Column(name = "end_time")
	private LocalTime endTime;

	@JdbcTypeCode(SqlTypes.ARRAY)
	@Column(name = "days_of_week", columnDefinition = "smallint[]")
	private short[] daysOfWeek;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	protected ShiftEntity() {
	}

	static ShiftEntity from(Shift shift) {
		ShiftEntity entity = new ShiftEntity();
		entity.id = shift.id();
		entity.restaurantId = shift.restaurantId();
		entity.name = shift.name();
		entity.startTime = shift.start();
		entity.endTime = shift.end();
		entity.daysOfWeek = new short[shift.days().size()];
		int index = 0;
		for (DayOfWeek day : shift.days()) {
			entity.daysOfWeek[index++] = (short) day.getValue();
		}
		return entity;
	}

	Shift toDomain() {
		Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
		for (short day : daysOfWeek) {
			days.add(DayOfWeek.of(day));
		}
		return new Shift(id, restaurantId, name, startTime, endTime, days);
	}

}
