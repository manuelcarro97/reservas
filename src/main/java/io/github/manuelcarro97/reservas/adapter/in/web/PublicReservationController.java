package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;

import io.github.manuelcarro97.reservas.application.port.in.CancelReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetAvailabilityUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetPublicPlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.GetReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ReservationDetails;
import io.github.manuelcarro97.reservas.application.port.in.ShiftAvailability;

@RestController
@RequestMapping("/api/v1")
class PublicReservationController {

	private final GetAvailabilityUseCase availability;
	private final GetPublicPlanUseCase publicPlan;
	private final CreateReservationUseCase createReservation;
	private final GetReservationUseCase getReservation;
	private final CancelReservationUseCase cancelReservation;

	PublicReservationController(GetAvailabilityUseCase availability, GetPublicPlanUseCase publicPlan,
			CreateReservationUseCase createReservation, GetReservationUseCase getReservation,
			CancelReservationUseCase cancelReservation) {
		this.availability = availability;
		this.publicPlan = publicPlan;
		this.createReservation = createReservation;
		this.getReservation = getReservation;
		this.cancelReservation = cancelReservation;
	}

	@GetMapping("/restaurants/{slug}")
	PublicPlanResponse plan(@PathVariable String slug) {
		return PublicPlanResponse.from(publicPlan.plan(slug));
	}

	@GetMapping("/restaurants/{slug}/occupancy")
	List<PublicOccupancyResponse> occupancy(@PathVariable String slug,
			@RequestParam @SupportedDate @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam long shiftId) {
		return publicPlan.occupancy(slug, shiftId, date).stream().map(PublicOccupancyResponse::from).toList();
	}

	@GetMapping("/restaurants/{slug}/availability")
	List<ShiftAvailability> availability(@PathVariable String slug,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam @Min(1) int partySize) {
		return availability.availability(slug, date, partySize);
	}

	@PostMapping("/restaurants/{slug}/reservations")
	@ResponseStatus(HttpStatus.CREATED)
	ReservationDetails create(@PathVariable String slug, @Valid @RequestBody CreateReservationRequest request) {
		return getReservation.byCode(createReservation.create(slug, request.toCommand()).code());
	}

	@GetMapping("/reservations/{code}")
	ReservationDetails byCode(@PathVariable String code) {
		return getReservation.byCode(code);
	}

	@PostMapping("/reservations/{code}/cancel")
	ReservationDetails cancel(@PathVariable String code) {
		return cancelReservation.cancelByCode(code);
	}

}
