package io.github.manuelcarro97.reservas.adapter.in.web;

import io.github.manuelcarro97.reservas.application.port.in.TelegramStatus;

/** Estado de Telegram del dueño para el panel; ni chat, ni enlace, ni dueño. */
record TelegramStatusResponse(boolean available, boolean linked, boolean linkPending) {

	static TelegramStatusResponse from(TelegramStatus status) {
		return new TelegramStatusResponse(status.available(), status.linked(), status.linkPending());
	}

}
