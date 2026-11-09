package io.github.manuelcarro97.reservas.application.service;

/** Oculta los datos de contacto de un visitante en el panel de la demo. El nombre no se oculta. */
final class ContactMask {

	private static final String HIDDEN = "•••";
	private static final int VISIBLE_DIGITS = 2;
	/** Con menos dígitos que esto, dejar ver los últimos dos revelaría casi todo el número. */
	private static final int MIN_DIGITS_TO_SHOW_SUFFIX = 6;

	private ContactMask() {
	}

	/** "•••" y, si el número es largo, sus dos últimos dígitos; un teléfono nulo sigue nulo. */
	static String phone(String phone) {
		if (phone == null) {
			return null;
		}
		String digits = phone.replaceAll("\\D", "");
		if (digits.length() < MIN_DIGITS_TO_SHOW_SUFFIX) {
			return HIDDEN;
		}
		return HIDDEN + digits.substring(digits.length() - VISIBLE_DIGITS);
	}

}
