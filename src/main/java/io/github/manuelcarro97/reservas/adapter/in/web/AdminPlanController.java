package io.github.manuelcarro97.reservas.adapter.in.web;

import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;

import io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase;
import io.github.manuelcarro97.reservas.domain.exception.ReservedSlugException;

@RestController
@RequestMapping("/api/v1/admin/restaurants")
@SecurityRequirement(name = "firebase")
class AdminPlanController {

	/** Nombres que la interfaz usa como ruta o que dan nombre a la demo; el caso de uso no los rechaza (el seeder crea "demo"). */
	private static final Set<String> RESERVED_SLUGS = Set.of("demo", "admin", "api", "r", "panel", "reserva");

	private final ManagePlanUseCase managePlan;

	AdminPlanController(ManagePlanUseCase managePlan) {
		this.managePlan = managePlan;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	PlanResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreatePlanRequest request) {
		if (RESERVED_SLUGS.contains(request.slug())) {
			throw new ReservedSlugException();
		}
		managePlan.create(jwt.getSubject(), request.slug(), request.name());
		return view(jwt, request.slug());
	}

	@GetMapping
	List<PlanSummaryResponse> list(@AuthenticationPrincipal Jwt jwt) {
		return managePlan.list(jwt.getSubject()).stream().map(PlanSummaryResponse::from).toList();
	}

	@GetMapping("/{slug}")
	PlanResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug) {
		return view(jwt, slug);
	}

	@PatchMapping("/{slug}")
	PlanResponse updateSettings(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@Valid @RequestBody PlanSettingsRequest request) {
		managePlan.updateSettings(jwt.getSubject(), slug, request.toSettings());
		return view(jwt, slug);
	}

	@PostMapping("/{slug}/publish")
	PlanResponse publish(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug) {
		managePlan.publish(jwt.getSubject(), slug);
		return view(jwt, slug);
	}

	@PutMapping("/{slug}/layout")
	PlanResponse saveLayout(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug,
			@Valid @RequestBody LayoutRequest request) {
		return PlanResponse.from(managePlan.saveLayout(jwt.getSubject(), slug, request.toRoom(), request.toChanges()));
	}

	private PlanResponse view(Jwt jwt, String slug) {
		return PlanResponse.from(managePlan.get(jwt.getSubject(), slug));
	}

}
