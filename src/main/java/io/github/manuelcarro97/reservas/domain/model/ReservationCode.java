package io.github.manuelcarro97.reservas.domain.model;

import java.security.SecureRandom;
import java.util.Locale;

public final class ReservationCode {

	private static final String ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
	private static final int LENGTH = 16;
	private static final int MAX_PREFIX_LENGTH = 8;
	private static final String FALLBACK_PREFIX = "R";
	private static final SecureRandom RANDOM = new SecureRandom();

	private ReservationCode() {
	}

	/** Prefijo legible del plano: el slug en mayúsculas, solo {@code A-Z0-9}, hasta 8 caracteres; vacío da {@code R}. */
	public static String prefixOf(String slug) {
		String letters = slug.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
		if (letters.isEmpty()) {
			return FALLBACK_PREFIX;
		}
		return letters.substring(0, Math.min(letters.length(), MAX_PREFIX_LENGTH));
	}

	/** {@code PREFIJO-} más 16 caracteres aleatorios: como mucho 25, caben en {@code VARCHAR(32)}. */
	public static String generate(String slug) {
		StringBuilder code = new StringBuilder(MAX_PREFIX_LENGTH + 1 + LENGTH).append(prefixOf(slug)).append('-');
		for (int i = 0; i < LENGTH; i++) {
			code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
		}
		return code.toString();
	}

}
