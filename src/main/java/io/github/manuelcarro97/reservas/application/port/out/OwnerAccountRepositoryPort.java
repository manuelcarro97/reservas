package io.github.manuelcarro97.reservas.application.port.out;

import java.time.Instant;
import java.util.Optional;

/** Cuenta del dueño: chat de Telegram vinculado y enlace de vinculación pendiente. */
public interface OwnerAccountRepositoryPort {

	/** Chat vinculado del dueño; vacío si no tiene cuenta o no ha vinculado ninguno. */
	Optional<Long> findChatId(String ownerUid);

	/** Guarda el enlace pendiente del dueño (crea su cuenta si no existe) y sustituye el anterior; no toca el chat. */
	void saveLinkToken(String ownerUid, String token, Instant expiresAt);

	/**
	 * Gasta el enlace: si existe y no ha caducado en {@code now}, guarda {@code chatId} como chat del dueño (sobrescribe
	 * el anterior) y borra el enlace, todo en una sola sentencia para que no se pueda usar dos veces. Devuelve si se
	 * vinculó.
	 */
	boolean consumeLinkToken(String token, long chatId, Instant now);

	/** Borra el chat y el enlace pendiente del dueño. No falla si no tiene cuenta. */
	void unlink(String ownerUid);

}
