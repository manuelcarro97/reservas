package io.github.manuelcarro97.reservas.adapter.in.web;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;

import io.github.manuelcarro97.reservas.application.port.in.AccountUseCase;

/**
 * La cuenta del dueño. {@code /me} y {@code /account} son por dueño (su cuenta); borrar un plano es por plano y un plano
 * ajeno da 404. Borrar la cuenta o un plano con reservas activas futuras da 409 PLAN_HAS_RESERVATIONS, y la cuenta demo
 * no puede borrarse: 403 DEMO_READ_ONLY.
 */
@RestController
@RequestMapping("/api/v1/admin")
@SecurityRequirement(name = "firebase")
class AdminAccountController {

	private final AccountUseCase account;

	AdminAccountController(AccountUseCase account) {
		this.account = account;
	}

	@GetMapping("/me")
	MeResponse me(@AuthenticationPrincipal Jwt jwt) {
		return MeResponse.from(account.me(jwt.getSubject(), jwt.getClaimAsString("email")));
	}

	@DeleteMapping("/restaurants/{slug}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deletePlan(@AuthenticationPrincipal Jwt jwt, @PathVariable String slug) {
		account.deletePlan(jwt.getSubject(), slug);
	}

	@DeleteMapping("/account")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteAccount(@AuthenticationPrincipal Jwt jwt) {
		account.deleteAccount(jwt.getSubject());
	}

}
