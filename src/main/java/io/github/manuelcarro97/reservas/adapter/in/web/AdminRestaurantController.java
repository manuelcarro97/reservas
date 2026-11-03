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

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;

import io.github.manuelcarro97.reservas.application.port.in.GetOccupancyUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManageRestaurantUseCase;
import io.github.manuelcarro97.reservas.application.port.in.TableOccupancy;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;

@RestController
@RequestMapping("/api/v1/admin/restaurants")
@SecurityRequirement(name = "firebase")
class AdminRestaurantController {

	private final ManageRestaurantUseCase manageRestaurant;
	private final GetOccupancyUseCase occupancy;

	AdminRestaurantController(ManageRestaurantUseCase manageRestaurant, GetOccupancyUseCase occupancy) {
		this.manageRestaurant = manageRestaurant;
		this.occupancy = occupancy;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	Restaurant create(@Valid @RequestBody CreateRestaurantRequest request) {
		return manageRestaurant.createRestaurant(request.slug(), request.name(), request.zoneId(),
				request.cancellationDeadlineHours());
	}

	@PostMapping("/{slug}/tables")
	@ResponseStatus(HttpStatus.CREATED)
	DiningTable addTable(@PathVariable String slug, @Valid @RequestBody CreateTableRequest request) {
		return manageRestaurant.addTable(slug, request.label(), request.capacity(), request.posX(), request.posY());
	}

	@PostMapping("/{slug}/shifts")
	@ResponseStatus(HttpStatus.CREATED)
	Shift addShift(@PathVariable String slug, @Valid @RequestBody CreateShiftRequest request) {
		return manageRestaurant.addShift(slug, request.name(), request.start(), request.end(), request.days());
	}

	@PostMapping("/{slug}/closures")
	@ResponseStatus(HttpStatus.CREATED)
	void addClosure(@PathVariable String slug, @Valid @RequestBody CreateClosureRequest request) {
		manageRestaurant.addClosure(slug, request.date(), request.reason());
	}

	@GetMapping("/{slug}/occupancy")
	List<TableOccupancy> occupancy(@PathVariable String slug,
			@RequestParam @SupportedDate @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam long shiftId) {
		return occupancy.occupancy(slug, shiftId, date);
	}

}
