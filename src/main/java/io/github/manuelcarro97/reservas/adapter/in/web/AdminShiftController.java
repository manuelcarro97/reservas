package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;

import io.github.manuelcarro97.reservas.application.port.in.ManageShiftsUseCase;

@RestController
@RequestMapping("/api/v1/admin/restaurants")
@SecurityRequirement(name = "firebase")
class AdminShiftController {

	private final ManageShiftsUseCase manageShifts;

	AdminShiftController(ManageShiftsUseCase manageShifts) {
		this.manageShifts = manageShifts;
	}

	@GetMapping("/{slug}/shifts")
	List<ShiftResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug) {
		return manageShifts.list(jwt.getSubject(), slug).stream().map(ShiftResponse::from).toList();
	}

	@PostMapping("/{slug}/shifts")
	@ResponseStatus(HttpStatus.CREATED)
	ShiftResponse add(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@Valid @RequestBody CreateShiftRequest request) {
		return ShiftResponse.from(manageShifts.add(jwt.getSubject(), slug, request.name(), request.start(),
				request.end(), request.days()));
	}

	@PatchMapping("/{slug}/shifts/{id}")
	ShiftResponse rename(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable long id,
			@Valid @RequestBody RenameShiftRequest request) {
		return ShiftResponse.from(manageShifts.rename(jwt.getSubject(), slug, id, request.name()));
	}

	@PutMapping("/{slug}/shifts/{id}")
	ShiftResponse reschedule(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable long id,
			@Valid @RequestBody UpdateShiftRequest request) {
		return ShiftResponse.from(manageShifts.reschedule(jwt.getSubject(), slug, id, request.start(), request.end(),
				request.days()));
	}

	@DeleteMapping("/{slug}/shifts/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable long id) {
		manageShifts.delete(jwt.getSubject(), slug, id);
	}

	@GetMapping("/{slug}/closures")
	List<LocalDate> closures(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@RequestParam @SupportedDate @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from) {
		return manageShifts.closures(jwt.getSubject(), slug, from);
	}

	@PostMapping("/{slug}/closures")
	@ResponseStatus(HttpStatus.CREATED)
	void addClosure(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@Valid @RequestBody CreateClosureRequest request) {
		manageShifts.addClosure(jwt.getSubject(), slug, request.date(), request.reason());
	}

	@DeleteMapping("/{slug}/closures/{date}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removeClosure(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@PathVariable @SupportedDate @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		manageShifts.removeClosure(jwt.getSubject(), slug, date);
	}

}
