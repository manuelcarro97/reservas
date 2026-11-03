package io.github.manuelcarro97.reservas.adapter.in.web;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;

import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;

/** Vinculación de Telegram por dueño (su cuenta), no por plano. Sin bot configurado: 404 TELEGRAM_UNAVAILABLE. */
@RestController
@RequestMapping("/api/v1/admin/telegram/link")
@SecurityRequirement(name = "firebase")
class AdminTelegramController {

	private final TelegramLinkUseCase telegram;

	AdminTelegramController(TelegramLinkUseCase telegram) {
		this.telegram = telegram;
	}

	@PostMapping
	TelegramLinkResponse link(@AuthenticationPrincipal Jwt jwt) {
		return new TelegramLinkResponse(telegram.link(jwt.getSubject()));
	}

	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void unlink(@AuthenticationPrincipal Jwt jwt) {
		telegram.unlink(jwt.getSubject());
	}

}
