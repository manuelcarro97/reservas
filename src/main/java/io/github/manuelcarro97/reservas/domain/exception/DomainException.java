package io.github.manuelcarro97.reservas.domain.exception;

import java.util.Map;

public abstract class DomainException extends RuntimeException {

	private final String code;
	private final ErrorKind kind;

	protected DomainException(String code, ErrorKind kind, String message) {
		super(message);
		this.code = code;
		this.kind = kind;
	}

	public String code() {
		return code;
	}

	public ErrorKind kind() {
		return kind;
	}

	/** Datos extra que la respuesta de error añade como propiedades; vacío salvo que la excepción los aporte. */
	public Map<String, Object> details() {
		return Map.of();
	}

}
