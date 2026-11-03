package io.github.manuelcarro97.reservas.support;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import org.springframework.test.web.servlet.request.RequestPostProcessor;

public final class AuthRequests {

	private AuthRequests() {
	}

	/** Petición autenticada como el dueño con ese uid de Firebase (el uid es el {@code sub} del token). */
	public static RequestPostProcessor owner(String uid) {
		return jwt().jwt(token -> token.subject(uid));
	}

	/** Como {@link #owner(String)}, con el claim {@code email} que Firebase añade al token. */
	public static RequestPostProcessor owner(String uid, String email) {
		return jwt().jwt(token -> token.subject(uid).claim("email", email));
	}

}
