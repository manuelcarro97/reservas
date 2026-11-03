package io.github.manuelcarro97.reservas.application.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;
import io.github.manuelcarro97.reservas.application.port.in.TelegramStatus;
import io.github.manuelcarro97.reservas.application.port.out.OwnerAccountRepositoryPort;
import io.github.manuelcarro97.reservas.config.TelegramEnabled;
import io.github.manuelcarro97.reservas.domain.exception.TelegramUnavailableException;

@Service
@Transactional
class TelegramLinkService implements TelegramLinkUseCase {

	private static final Duration LINK_VALIDITY = Duration.ofMinutes(15);
	private static final int TOKEN_LENGTH = LINK_TOKEN_LENGTH;
	/** Alfabeto de URL sin codificar; es también el que Telegram admite en el parámetro de {@code ?start=}. */
	private static final String TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

	private final OwnerAccountRepositoryPort accounts;
	private final Clock clock;
	private final boolean available;
	private final String botUsername;
	private final SecureRandom random = new SecureRandom();

	/** El token del bot solo se mira para saber si hay bot; este servicio no lo guarda. */
	TelegramLinkService(OwnerAccountRepositoryPort accounts, Clock clock,
			@Value("${app.telegram.bot-token:}") String botToken,
			@Value("${app.telegram.bot-username:}") String botUsername) {
		this.accounts = accounts;
		this.clock = clock;
		// El mismo criterio que activa los beans de Telegram: token y nombre de bot.
		this.available = TelegramEnabled.configured(botToken, botUsername);
		this.botUsername = TelegramEnabled.clean(botUsername);
	}

	@Override
	public boolean available() {
		return available;
	}

	@Override
	@Transactional(readOnly = true)
	public TelegramStatus status(String ownerUid) {
		return new TelegramStatus(available, accounts.findChatId(ownerUid).isPresent(),
				accounts.hasPendingLink(ownerUid, clock.instant()));
	}

	@Override
	public String link(String ownerUid) {
		requireAvailable();
		String token = newToken();
		accounts.saveLinkToken(ownerUid, token, clock.instant().plus(LINK_VALIDITY));
		return "https://t.me/" + botUsername + "?start=" + token;
	}

	@Override
	public void unlink(String ownerUid) {
		requireAvailable();
		accounts.unlink(ownerUid);
	}

	@Override
	public boolean handleStart(long chatId, String token) {
		// Lo que no tiene el formato de un enlace nuestro no puede existir: ni se consulta (y un 0x00, por ejemplo, haría
		// fallar a la base de datos).
		if (!TelegramLinkUseCase.isWellFormedLinkToken(token)) {
			return false;
		}
		// Una sola sentencia: valida (existe, no ha caducado) y gasta el enlace a la vez. Caducado, usado e inexistente
		// dan el mismo false.
		return accounts.consumeLinkToken(token, chatId, clock.instant());
	}

	@Override
	public boolean hasPendingLinks() {
		return accounts.hasPendingLink(clock.instant());
	}

	private void requireAvailable() {
		if (!available) {
			throw new TelegramUnavailableException();
		}
	}

	private String newToken() {
		StringBuilder token = new StringBuilder(TOKEN_LENGTH);
		for (int i = 0; i < TOKEN_LENGTH; i++) {
			token.append(TOKEN_ALPHABET.charAt(random.nextInt(TOKEN_ALPHABET.length())));
		}
		return token.toString();
	}

}
