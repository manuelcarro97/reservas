package io.github.manuelcarro97.reservas.adapter.in.web;

import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.RoomShape;

record RoomDto(RoomShape shape, int width, int height, int cutWidth, int cutDepth, int rotation) {

	static RoomDto from(RoomLayout room) {
		return new RoomDto(room.shape(), room.width(), room.height(), room.cutWidth(), room.cutDepth(),
				room.rotation());
	}

}
