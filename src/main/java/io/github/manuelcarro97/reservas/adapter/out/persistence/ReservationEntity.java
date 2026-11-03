package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.ReservationStatus;

@Entity
@Table(name = "reservation")
class ReservationEntity {

	@Id
	private Long id;

	private String code;

	@Column(name = "restaurant_id")
	private long restaurantId;

	@Column(name = "shift_id")
	private long shiftId;

	@Column(name = "table_id")
	private Long tableId;

	@Column(name = "reservation_date")
	private LocalDate date;

	@Column(name = "party_size")
	private int partySize;

	@Column(name = "customer_name")
	private String customerName;

	@Column(name = "customer_phone")
	private String customerPhone;

	@Column(name = "customer_email")
	private String customerEmail;

	@Enumerated(EnumType.STRING)
	private ReservationStatus status;

	@Version
	private long version;

	@Column(name = "created_at")
	private Instant createdAt;

	@Column(name = "cancelled_by_customer_at")
	private Instant cancelledByCustomerAt;

	protected ReservationEntity() {
	}

	static ReservationEntity from(Reservation reservation) {
		ReservationEntity entity = new ReservationEntity();
		entity.id = reservation.id();
		entity.code = reservation.code();
		entity.restaurantId = reservation.restaurantId();
		entity.shiftId = reservation.shiftId();
		entity.tableId = reservation.tableId();
		entity.date = reservation.date();
		entity.partySize = reservation.partySize();
		entity.customerName = reservation.customerName();
		entity.customerPhone = reservation.customerPhone();
		entity.customerEmail = reservation.customerEmail();
		entity.status = reservation.status();
		entity.version = reservation.version();
		entity.createdAt = reservation.createdAt();
		entity.cancelledByCustomerAt = reservation.cancelledByCustomerAt();
		return entity;
	}

	Reservation toDomain() {
		return new Reservation(id, code, restaurantId, shiftId, tableId, date, partySize, customerName, customerPhone,
				customerEmail, status, version, createdAt, cancelledByCustomerAt);
	}

}
