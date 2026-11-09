package io.github.manuelcarro97.reservas.domain.model;

/** Problema de un plano; {@code tableIndex} y {@code label} son null si afecta al local y no a una mesa. */
public record LayoutProblem(Integer tableIndex, String label, String code) {

}
