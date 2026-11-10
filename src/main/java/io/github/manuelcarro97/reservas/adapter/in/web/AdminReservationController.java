package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;

import io.github.manuelcarro97.reservas.application.port.in.AdminReservation;
import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ReservationDetails;
import io.github.manuelcarro97.reservas.application.port.in.TableSuggestion;
import io.github.manuelcarro97.reservas.application.port.in.WeekSummaryUseCase;

@RestController
@RequestMapping("/api/v1/admin")
@SecurityRequirement(name = "firebase")
class AdminReservationController {

	private final ManageReservationUseCase manageReservation;
	private final WeekSummaryUseCase weekSummary;

	AdminReservationController(ManageReservationUseCase manageReservation, WeekSummaryUseCase weekSummary) {
		this.manageReservation = manageReservation;
		this.weekSummary = weekSummary;
	}

	// Dos filtros excluyentes; cualquier otra combinación (ninguno, o un estado distinto de PENDING) da 400.
	@GetMapping(path = "/restaurants/{slug}/reservations", params = { "date", "!status" })
	List<AdminReservation> list(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@RequestParam @SupportedDate @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return manageReservation.list(jwt.getSubject(), slug, date);
	}

	@GetMapping(path = "/restaurants/{slug}/reservations", params = { "status=PENDING", "!date" })
	List<AdminReservation> pending(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug) {
		return manageReservation.pending(jwt.getSubject(), slug);
	}

	// Cualquier día de la semana vale: se normaliza al lunes.
	@GetMapping("/restaurants/{slug}/summary")
	WeekSummaryResponse summary(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@RequestParam @SupportedDate @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate week) {
		return WeekSummaryResponse.from(weekSummary.week(jwt.getSubject(), slug, week));
	}

	@PutMapping("/reservations/{id}/table")
	ReservationDetails assignTable(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
			@Valid @RequestBody AssignTableRequest request) {
		return manageReservation.assignTable(jwt.getSubject(), id, request.tableId());
	}

	@GetMapping("/reservations/{id}/suggestions")
	List<TableSuggestion> suggestions(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return manageReservation.suggestions(jwt.getSubject(), id);
	}

	@PostMapping("/reservations/{id}/confirm")
	ReservationDetails confirm(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return manageReservation.confirm(jwt.getSubject(), id);
	}

	@PostMapping("/reservations/{id}/cancel")
	ReservationDetails cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return manageReservation.cancel(jwt.getSubject(), id);
	}

	@PostMapping("/reservations/{id}/no-show")
	ReservationDetails markNoShow(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return manageReservation.markNoShow(jwt.getSubject(), id);
	}

}
