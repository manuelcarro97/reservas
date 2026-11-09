package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;

import io.github.manuelcarro97.reservas.application.port.in.GetOccupancyUseCase;
import io.github.manuelcarro97.reservas.application.port.in.TableOccupancy;

@RestController
@RequestMapping("/api/v1/admin/restaurants")
@SecurityRequirement(name = "firebase")
class AdminRestaurantController {

	private final GetOccupancyUseCase occupancy;

	AdminRestaurantController(GetOccupancyUseCase occupancy) {
		this.occupancy = occupancy;
	}

	@GetMapping("/{slug}/occupancy")
	List<TableOccupancy> occupancy(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@RequestParam @SupportedDate @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam long shiftId) {
		return occupancy.occupancy(jwt.getSubject(), slug, shiftId, date);
	}

}
