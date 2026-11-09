package io.github.manuelcarro97.reservas.application.port.in;

/**
 * Lo que el panel necesita saber de Telegram para un dueño: si hay bot, si tiene un chat vinculado y si tiene un enlace
 * de vinculación sin usar y sin caducar. Nunca lleva el chat, el enlace ni el dueño.
 */
public record TelegramStatus(boolean available, boolean linked, boolean linkPending) {
}
