package io.github.manuelcarro97.reservas.adapter.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Solo se lee con la entidad; las escrituras son sentencias dirigidas (ver {@link OwnerAccountJpaRepository}). */
@Entity
@Table(name = "owner_account")
class OwnerAccountEntity {

	@Id
	private String uid;

	@Column(name = "telegram_chat_id")
	private Long telegramChatId;

	protected OwnerAccountEntity() {
	}

	Long telegramChatId() {
		return telegramChatId;
	}

}
