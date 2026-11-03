package io.github.manuelcarro97.reservas.domain.exception;

import java.util.List;
import java.util.Map;

import io.github.manuelcarro97.reservas.domain.model.LayoutProblem;

public class LayoutInvalidException extends DomainException {

	private final List<LayoutProblem> problems;

	public LayoutInvalidException(List<LayoutProblem> problems) {
		super("LAYOUT_INVALID", ErrorKind.UNPROCESSABLE, "The layout is not valid");
		this.problems = List.copyOf(problems);
	}

	@Override
	public Map<String, Object> details() {
		return Map.of("problems", problems);
	}

}
