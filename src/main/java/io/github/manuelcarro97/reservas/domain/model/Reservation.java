package io.github.manuelcarro97.reservas.domain.model;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;

import io.github.manuelcarro97.reservas.domain.exception.CancellationDeadlinePassedException;
import io.github.manuelcarro97.reservas.domain.exception.InvalidTransitionException;

public class Reservation {

	private final Long id;
	private final String code;
	private final long restaurantId;
	private final long shiftId;
	private final Long tableId;
	private final LocalDate date;
	private final int partySize;
	private final String customerName;
	private final String customerPhone;
	private final String customerEmail;
	private ReservationStatus status;
	private final long version;
	private final Instant createdAt;
	private Instant cancelledByCustomerAt;

	public Reservation(Long id, String code, long restaurantId, long shiftId, Long tableId, LocalDate date,
			int partySize, String customerName, String customerPhone, String customerEmail, ReservationStatus status,
			long version, Instant createdAt, Instant cancelledByCustomerAt) {
		this.id = id;
		this.code = code;
		this.restaurantId = restaurantId;
		this.shiftId = shiftId;
		this.tableId = tableId;
		this.date = date;
		this.partySize = partySize;
		this.customerName = customerName;
		this.customerPhone = customerPhone;
		this.customerEmail = customerEmail;
		this.status = status;
		this.version = version;
		this.createdAt = createdAt;
		this.cancelledByCustomerAt = cancelledByCustomerAt;
	}

	public static Reservation newPending(String code, long restaurantId, long shiftId, Long tableId, LocalDate date,
			int partySize, String customerName, String customerPhone, String customerEmail, Instant createdAt) {
		return new Reservation(null, code, restaurantId, shiftId, tableId, date, partySize, customerName,
				customerPhone, customerEmail, ReservationStatus.PENDING, 0, createdAt, null);
	}

	public void confirm(Instant now, Instant shiftStart) {
		requireStatus(ReservationStatus.PENDING);
		if (!now.isBefore(shiftStart)) {
			throw new InvalidTransitionException(status, ReservationStatus.CONFIRMED);
		}
		status = ReservationStatus.CONFIRMED;
	}

	public void cancel() {
		requireStatus(ReservationStatus.PENDING, ReservationStatus.CONFIRMED);
		status = ReservationStatus.CANCELLED;
	}

	public void cancelByCustomer(Instant now, Instant shiftStart, int deadlineHours) {
		requireStatus(ReservationStatus.PENDING, ReservationStatus.CONFIRMED);
		if (now.isAfter(shiftStart.minus(Duration.ofHours(deadlineHours)))) {
			throw new CancellationDeadlinePassedException();
		}
		status = ReservationStatus.CANCELLED;
		cancelledByCustomerAt = now;
	}

	public void markNoShow(Instant now, Instant shiftStart) {
		requireStatus(ReservationStatus.CONFIRMED);
		if (now.isBefore(shiftStart)) {
			throw new InvalidTransitionException(status, ReservationStatus.NO_SHOW);
		}
		status = ReservationStatus.NO_SHOW;
	}

	private void requireStatus(ReservationStatus... allowed) {
		for (ReservationStatus candidate : allowed) {
			if (status == candidate) {
				return;
			}
		}
		throw new InvalidTransitionException(status);
	}

	public Long id() {
		return id;
	}

	public String code() {
		return code;
	}

	public long restaurantId() {
		return restaurantId;
	}

	public long shiftId() {
		return shiftId;
	}

	public Long tableId() {
		return tableId;
	}

	public LocalDate date() {
		return date;
	}

	public int partySize() {
		return partySize;
	}

	public String customerName() {
		return customerName;
	}

	public String customerPhone() {
		return customerPhone;
	}

	public String customerEmail() {
		return customerEmail;
	}

	public ReservationStatus status() {
		return status;
	}

	public long version() {
		return version;
	}

	public Instant createdAt() {
		return createdAt;
	}

	public Instant cancelledByCustomerAt() {
		return cancelledByCustomerAt;
	}

}
