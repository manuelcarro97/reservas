package io.github.manuelcarro97.reservas.adapter.out.notification;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Lo que interesa de una actualización de Telegram; {@code message} es nulo si no es un mensaje nuevo. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Update(@JsonProperty("update_id") long updateId, Message message) {

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Message(Chat chat, String text) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Chat(long id) {
	}

}
