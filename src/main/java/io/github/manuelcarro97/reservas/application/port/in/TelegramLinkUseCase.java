package io.github.manuelcarro97.reservas.application.port.in;

/** Vincular el chat de Telegram del dueño para recibir los avisos de reservas. */
public interface TelegramLinkUseCase {

	/** Longitud del enlace de vinculación. */
	int LINK_TOKEN_LENGTH = 32;

	/**
	 * Formato de los enlaces que genera este sistema ({@code A-Za-z0-9_-}, 32 caracteres). Lo que no lo cumple no puede
	 * existir: se descarta sin consultar la base de datos.
	 */
	static boolean isWellFormedLinkToken(String token) {
		if (token == null || token.length() != LINK_TOKEN_LENGTH) {
			return false;
		}
		return token.chars()
			.allMatch(c -> (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-'
					|| c == '_');
	}

	/** Hay bot configurado (token y nombre); sin él no se puede vincular. */
	boolean available();

	/** Estado del dueño para el panel. Funciona también sin bot configurado ({@code available} false), nunca falla. */
	TelegramStatus status(String ownerUid);

	/**
	 * Genera un enlace de un solo uso, válido 15 minutos, {@code https://t.me/<bot>?start=<token>}; sustituye al
	 * pendiente anterior. Lanza {@code TelegramUnavailableException} si no hay bot.
	 */
	String link(String ownerUid);

	/**
	 * Hay algún enlace de vinculación sin usar y sin caducar. Es lo único que justifica consultar a Telegram: el bot solo
	 * sirve para avisar, y la única conversación que espera es el {@code /start <token>} de un enlace recién generado.
	 */
	boolean hasPendingLinks();

	/** Borra el chat vinculado y el enlace pendiente. Lanza {@code TelegramUnavailableException} si no hay bot. */
	void unlink(String ownerUid);

	/**
	 * El usuario abrió el enlace en Telegram ({@code /start <token>}): vincula ese chat al dueño del enlace y gasta el
	 * enlace. Un enlace desconocido, caducado o ya usado no hace nada y devuelve {@code false}: el mismo resultado para
	 * los tres, no dice cuál es.
	 *
	 * @return {@code true} solo si vinculó el chat
	 */
	boolean handleStart(long chatId, String token);

}
