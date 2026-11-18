// Deterministic screenshot scenes behind ?shot=cover|drive|chase|mission.
// Each one plays the real game forward from the same seed, then frames the
// camera on the action, so the screenshots are real renders of the game.
export function applyShotScene(game, name) {
  const pts = game.city.points;
  // Stage the time of day per shot: golden hour for the cover, night with
  // headlights for the chase, so the four frames show the city's range.
  const stageTime = (hour, lights) => {
    game.setClockHour(hour);
    if (lights && game.playerCar) game.playerCar.setLights(true);
  };
  const step = (n, drive) => {
    for (let i = 0; i < n; i += 1) {
      if (drive) {
        const car = game.playerCar;
        if (car) car.drive(1, 0, 1 / 30, game.city.colliders);
      }
      game.traffic.update(1 / 30, game.time + i / 30, game.playerCar, game.player);
      if (game.police.wanted > 0) game.police.update(1 / 30, game.time + i / 30, game.player, game.playerCar, null);
      game.time += 1 / 30;
    }
  };

  if (name === 'cover') {
    // On foot on the main avenue, looking north down a street of towers
    // with traffic crossing and the job-1 marker on the minimap.
    game.money = 120;
    game.player.x = 0; game.player.z = 100;
    game.playerMesh.position.set(0, 0, 100);
    game.playerMesh.rotation.y = Math.PI;
    game.camYaw = Math.PI; game.camPitch = 0.3;
    game.missions.start(0);
    stageTime(17.5, false);
    step(90);
    game.updateCamera(1);
  } else if (name === 'drive') {
    // Behind the wheel, eastbound on the avenue, traffic ahead, garage marker on.
    const car = game.parkedCars[0];
    game.enterCar(car);
    car.x = -100; car.z = 0; car.heading = Math.PI / 2;
    game.missions.start(0);
    stageTime(9, false);
    step(150, true);
    game.updateCamera(1);
  } else if (name === 'chase') {
    // Three stars, two PD interceptors right behind the player's car.
    const car = game.parkedCars[1];
    game.enterCar(car);
    car.x = 0; car.z = -40; car.heading = 0;
    game.police.spawnCar(game.player);
    game.police.spawnCar(game.player);
    // Pull the interceptors in close behind the player for the frame.
    game.police.cars.forEach((pc, i) => {
      pc.x = car.x - 8 + i * 16;
      pc.z = car.z - 22;
      pc.heading = 0;
      pc.speed = 20;
      pc.updateMesh();
    });
    game.missions.start(3, game); // mission 4's start adds the 3-star heat
    stageTime(21.5, true);
    step(120, true);
    game.updateCamera(1);
  } else if (name === 'mission') {
    // Dockside shootout: rivals and the yellow beacon ahead, pier and sea behind them.
    // The camera looks south-east from behind the player, so the crew
    // stands south-east of them, around the beacon at the docks.
    game.player.x = 136; game.player.z = 146;
    game.playerMesh.position.set(136, 0, 146);
    game.playerMesh.rotation.y = Math.PI * 0.2;
    game.camYaw = Math.PI * 0.2; game.camPitch = 0.24;
    game.missions.start(2);
    game.combat.spawnEnemies([
      { x: 142, z: 154 },
      { x: 150, z: 158 },
      { x: 144, z: 162 },
    ], 3);
    game.combatSpawned = true;
    game.police.addHeat(22);
    stageTime(13, false);
    step(60);
    game.updateCamera(1);
  }
  game.updateHud();
  game.render();
}
