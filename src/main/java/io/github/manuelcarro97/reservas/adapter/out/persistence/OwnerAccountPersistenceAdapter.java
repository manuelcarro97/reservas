package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.OwnerAccountRepositoryPort;

@Component
class OwnerAccountPersistenceAdapter implements OwnerAccountRepositoryPort {

	private final OwnerAccountJpaRepository accounts;

	OwnerAccountPersistenceAdapter(OwnerAccountJpaRepository accounts) {
		this.accounts = accounts;
	}

	@Override
	public Optional<Long> findChatId(String ownerUid) {
		return accounts.findById(ownerUid).map(OwnerAccountEntity::telegramChatId);
	}

	@Override
	public void saveLinkToken(String ownerUid, String token, Instant expiresAt) {
		accounts.saveLinkToken(ownerUid, token, expiresAt);
	}

	@Override
	public boolean consumeLinkToken(String token, long chatId, Instant now) {
		return accounts.consumeLinkToken(token, chatId, now) == 1;
	}

	@Override
	public boolean hasPendingLink(Instant now) {
		return accounts.hasPendingLink(now);
	}

	@Override
	public boolean hasPendingLink(String ownerUid, Instant now) {
		return accounts.hasPendingLinkOf(ownerUid, now);
	}

	@Override
	public void unlink(String ownerUid) {
		accounts.unlink(ownerUid);
	}

}
