package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;

import io.github.manuelcarro97.reservas.application.port.in.AdminReservation;
import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ReservationDetails;

@RestController
@RequestMapping("/api/v1/admin")
@SecurityRequirement(name = "firebase")
class AdminReservationController {

	private final ManageReservationUseCase manageReservation;

	AdminReservationController(ManageReservationUseCase manageReservation) {
		this.manageReservation = manageReservation;
	}

	@GetMapping("/restaurants/{slug}/reservations")
	List<AdminReservation> list(@PathVariable String slug,
			@RequestParam @SupportedDate @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return manageReservation.listByDate(slug, date);
	}

	@PostMapping("/reservations/{id}/confirm")
	ReservationDetails confirm(@PathVariable long id) {
		return manageReservation.confirm(id);
	}

	@PostMapping("/reservations/{id}/cancel")
	ReservationDetails cancel(@PathVariable long id) {
		return manageReservation.cancel(id);
	}

	@PostMapping("/reservations/{id}/no-show")
	ReservationDetails markNoShow(@PathVariable long id) {
		return manageReservation.markNoShow(id);
	}

}
