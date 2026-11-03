package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.Instant;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;

import io.github.manuelcarro97.reservas.application.port.in.OwnerFeedUseCase;

@RestController
@RequestMapping("/api/v1/admin/feed")
@SecurityRequirement(name = "firebase")
class AdminFeedController {

	private final OwnerFeedUseCase ownerFeed;

	AdminFeedController(OwnerFeedUseCase ownerFeed) {
		this.ownerFeed = ownerFeed;
	}

	/** {@code since} es un instante ISO-8601 (el {@code now} de la respuesta anterior); falta o no se entiende: 400. */
	@GetMapping
	OwnerFeedUseCase.Feed feed(@AuthenticationPrincipal Jwt jwt, @RequestParam Instant since) {
		return ownerFeed.feed(jwt.getSubject(), since);
	}

}
