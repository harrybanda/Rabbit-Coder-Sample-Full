// Spark AR Modules
const Scene = require("Scene");
const Audio = require("Audio");
const TouchGestures = require("TouchGestures");
const Materials = require("Materials");
const Time = require("Time");
const Textures = require("Textures");
const Animation = require("Animation");
const Reactive = require("Reactive");

Promise.all([
  // Game Objects
  Scene.root.findFirst("bunny"),
  Scene.root.findFirst("carrot"),
  Scene.root.findFirst("blocks"),
  Scene.root.findFirst("platforms"),
  Scene.root.findFirst("buttons"),
  // Game Audio
  Audio.getAudioPlaybackController("jump"),
  Audio.getAudioPlaybackController("drop"),
  Audio.getAudioPlaybackController("fail"),
  Audio.getAudioPlaybackController("complete"),
  Audio.getAudioPlaybackController("click"),
  Audio.getAudioPlaybackController("remove"),
  // water emmiter
  Scene.root.findFirst("water_emitter"),
]).then(function (results) {
  // Game objects
  const player = results[0];
  const carrot = results[1];
  const blocks = results[2];
  const platforms = results[3];
  const buttons = results[4];

  // Game Audio
  const jumpSound = results[5];
  const dropSound = results[6];
  const failSound = results[7];
  const completeSound = results[8];
  const clickSound = results[9];
  const removeSound = results[10];
  const waterEmitter = results[11];

  // Game variables and constants
  const levels = require("./levels");
  let currentLevel = 0;
  const gridSize = 0.36;
  const gridInc = 0.12;
  let playerDir = levels[currentLevel].facing;
  let platformsUsed = 0;
  const numOfPlatforms = 10;
  const playerInitY = 0.02;

  const states = {
    start: 1,
    running: 2,
    complete: 3,
    failed: 4,
  };

  let commands = [];
  let blocksUsed = 0;
  let currentState = states.start;
  const blockSlotInc = 0.1;
  const initBlockSlot = 0.6;
  const numOfBlocks = 10;
  const blockInitY = 0.9;
  let nextBlockSlot = initBlockSlot;
  let exeIntervalID;

  let allCoordinates = createAllCoordinates();
  let pathCoordinates = createPathCoordinates();
  let dangerCoordinates = createDangerCoordinates();

  /*------------- Button Taps -------------*/

  for (let i = 0; i < 4; i++) {
    let button = buttons.child("btn" + i);
    TouchGestures.onTap(button).subscribe(function () {
      switch (i) {
        case 0:
          addCommand("forward");
          break;
        case 1:
          addCommand("left");
          break;
        case 2:
          addCommand("right");
          break;
        case 3:
          clickSound.setPlaying(true);
          clickSound.reset();
          switch (currentState) {
            case states.start:
              Time.setTimeout(function () {
                if (commands.length !== 0) executeCommands();
              }, 300);
              break;
            case states.failed:
              resetLevel();
              break;
            case states.uncomplete:
              resetLevel();
              break;
            case states.complete:
              nextLevel("next");
              break;
          }
          break;
      }
    });
  }

  TouchGestures.onTap(blocks.child("btn4")).subscribe(function () {
    removeSound.setPlaying(true);
    removeSound.reset();
    if (blocksUsed !== 0 && currentState === states.start) {
      let popped = commands.pop();
      popped.block.transform.y = blockInitY;
      popped.block.hidden = true;
      nextBlockSlot += blockSlotInc;
      blocksUsed--;
    }
  });

  /*------------- Monitor Player Position -------------*/

  Reactive.monitorMany({
    x: player.transform.x,
    z: player.transform.z,
  }).subscribe(({ newValues }) => {
    let playerX = newValues.x;
    let playerZ = newValues.z;
    let goalX = pathCoordinates[pathCoordinates.length - 1][0];
    let goalZ = pathCoordinates[pathCoordinates.length - 1][1];
    let collisionArea = 0.005;

    // Check if player is on the goal
    if (
      isBetween(playerX, goalX + collisionArea, goalX - collisionArea) &&
      isBetween(playerZ, goalZ + collisionArea, goalZ - collisionArea)
    ) {
      player.transform.x = goalX;
      player.transform.z = goalZ;
      commands = [];
      Time.clearInterval(exeIntervalID);
      changeState(states.complete, "next");
      carrot.hidden = true;
      animateLevelComplete();
      completeSound.setPlaying(true);
      completeSound.reset();
    }

    // Check if player is on a danger zone
    for (let i = 0; i < dangerCoordinates.length; i++) {
      let dx = dangerCoordinates[i][0];
      let dz = dangerCoordinates[i][1];
      if (
        isBetween(playerX, dx + collisionArea, dx - collisionArea) &&
        isBetween(playerZ, dz + collisionArea, dz - collisionArea)
      ) {
        player.transform.x = dx;
        player.transform.z = dz;
        commands = [];
        Time.clearInterval(exeIntervalID);
        changeState(states.failed, "retry");
        animatePlayerFall();
        dropSound.setPlaying(true);
        dropSound.reset();
      }
    }
  });

  function createAllCoordinates() {
    // Creates a grid of coordinates
    let coords = [];
    for (let i = -gridSize; i <= gridSize; i += gridInc) {
      for (let j = -gridSize; j <= gridSize; j += gridInc) {
        let x = Math.round(i * 1e4) / 1e4;
        let z = Math.round(j * 1e4) / 1e4;
        coords.push([x, z]);
      }
    }
    return coords;
  }

  function createPathCoordinates() {
    // Get the current level path coordinates from all the coordinates
    let path = levels[currentLevel].path;
    let coords = [];
    for (let i = 0; i < path.length; i++) {
      let x = allCoordinates[path[i][0]][1];
      let z = allCoordinates[path[i][1]][1];
      coords.push([x, z]);
    }
    return coords;
  }

  function createDangerCoordinates() {
    // Get the danger coordinates by removing the current path coordinates
    let coords = allCoordinates;
    for (let i = 0; i < pathCoordinates.length; i++) {
      for (let j = 0; j < coords.length; j++) {
        let lvlCoordStr = JSON.stringify(pathCoordinates[i]);
        let genCoordStr = JSON.stringify(coords[j]);
        if (lvlCoordStr === genCoordStr) {
          coords.splice(j, 1);
        }
      }
    }
    return coords;
  }

  function addCommand(move) {
    if (currentState === states.start) {
      if (blocksUsed < numOfBlocks) {
        let block = blocks.child("block" + blocksUsed++);
        nextBlockSlot -= blockSlotInc;
        block.transform.y = nextBlockSlot;
        block.material = Materials.get(move + "_block_mat");
        block.hidden = false;
        commands.push({ command: move, block: block });
        clickSound.setPlaying(true);
        clickSound.reset();
      }
    }
  }

  /*------------- Execution functions -------------*/

  function executeCommands() {
    currentState = states.running;
    let executionCommands = [];
    for (let i = 0; i < commands.length; i++) {
      executionCommands.push(commands[i].command);
    }
    setExecutionInterval(
      function (e) {
        animatePlayerMovement(executionCommands[e]);
      },
      1000,
      executionCommands.length
    );
  }

  function setExecutionInterval(callback, delay, repetitions) {
    let e = 0;
    callback(0);
    exeIntervalID = Time.setInterval(function () {
      callback(e + 1);
      if (++e === repetitions) {
        Time.clearInterval(exeIntervalID);
        if (currentState === states.running) currentState = states.uncomplete;
        setTexture(buttons.child("btn3"), "retry");
        failSound.setPlaying(true);
        failSound.reset();
      }
    }, delay);
  }

  /*------------- Rabbit Movement Animation -------------*/

  function animatePlayerMovement(command) {
    const timeDriverParameters = {
      durationMilliseconds: 400,
      loopCount: 1,
      mirror: false,
    };

    const timeDriver = Animation.timeDriver(timeDriverParameters);
    const translationNegX = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        player.transform.x.pinLastValue(),
        player.transform.x.pinLastValue() - gridInc
      )
    );

    const translationPosX = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        player.transform.x.pinLastValue(),
        player.transform.x.pinLastValue() + gridInc
      )
    );

    const translationNegZ = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        player.transform.z.pinLastValue(),
        player.transform.z.pinLastValue() - gridInc
      )
    );

    const translationPosZ = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        player.transform.z.pinLastValue(),
        player.transform.z.pinLastValue() + gridInc
      )
    );

    const rotationLeft = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        player.transform.rotationY.pinLastValue(),
        player.transform.rotationY.pinLastValue() + degreesToRadians(90)
      )
    );

    const rotationRight = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        player.transform.rotationY.pinLastValue(),
        player.transform.rotationY.pinLastValue() - degreesToRadians(90)
      )
    );

    const jump = Animation.animate(
      timeDriver,
      Animation.samplers.sequence({
        samplers: [
          Animation.samplers.easeInOutSine(playerInitY, 0.1),
          Animation.samplers.easeInOutSine(0.1, playerInitY),
        ],
        knots: [0, 1, 2],
      })
    );

    timeDriver.start();

    switch (command) {
      case "forward":
        player.transform.y = jump;
        jumpSound.setPlaying(true);
        jumpSound.reset();
        if (playerDir === "east") {
          player.transform.x = translationPosX;
        } else if (playerDir === "north") {
          player.transform.z = translationNegZ;
        } else if (playerDir === "west") {
          player.transform.x = translationNegX;
        } else if (playerDir === "south") {
          player.transform.z = translationPosZ;
        }
        break;
      case "left":
        if (playerDir === "east") {
          playerDir = "north";
        } else if (playerDir === "north") {
          playerDir = "west";
        } else if (playerDir === "west") {
          playerDir = "south";
        } else if (playerDir === "south") {
          playerDir = "east";
        }
        player.transform.rotationY = rotationLeft;
        break;
      case "right":
        if (playerDir === "east") {
          playerDir = "south";
        } else if (playerDir === "south") {
          playerDir = "west";
        } else if (playerDir === "west") {
          playerDir = "north";
        } else if (playerDir === "north") {
          playerDir = "east";
        }
        player.transform.rotationY = rotationRight;
        break;
    }
  }

  /*------------- Player Idle Animation -------------*/

  function animatePlayerIdle() {
    const timeDriverParameters = {
      durationMilliseconds: 400,
      loopCount: Infinity,
      mirror: true,
    };
    const timeDriver = Animation.timeDriver(timeDriverParameters);

    const scale = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        player.transform.scaleY.pinLastValue(),
        player.transform.scaleY.pinLastValue() + 0.02
      )
    );

    player.transform.scaleY = scale;

    timeDriver.start();
  }

  animatePlayerIdle();

  /*------------- Level Complete Animation -------------*/

  function animateLevelComplete() {
    const timeDriverParameters = {
      durationMilliseconds: 450,
      loopCount: 2,
      mirror: false,
    };

    const timeDriver = Animation.timeDriver(timeDriverParameters);

    const jump = Animation.animate(
      timeDriver,
      Animation.samplers.sequence({
        samplers: [
          Animation.samplers.easeInOutSine(playerInitY, 0.1),
          Animation.samplers.easeInOutSine(0.1, playerInitY),
        ],
        knots: [0, 1, 2],
      })
    );

    player.transform.y = jump;

    timeDriver.start();
  }

  /*------------- Player Fall Animation -------------*/

  function animatePlayerFall() {
    emmitWaterParticles();
    const timeDriverParameters = {
      durationMilliseconds: 100,
      loopCount: 1,
      mirror: false,
    };

    const timeDriver = Animation.timeDriver(timeDriverParameters);

    const moveY = Animation.animate(
      timeDriver,
      Animation.samplers.easeInOutSine(playerInitY - 0.1, -0.17)
    );

    player.transform.y = moveY;

    timeDriver.start();

    Time.setTimeout(function () {
      player.hidden = true;
    }, 200);
  }

  /*------------- Carrot Spin Animation -------------*/

  function animateCarrot() {
    const timeDriverParameters = {
      durationMilliseconds: 2500,
      loopCount: Infinity,
      mirror: false,
    };

    const timeDriver = Animation.timeDriver(timeDriverParameters);

    const rotate = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        carrot.transform.rotationY.pinLastValue(),
        carrot.transform.rotationY.pinLastValue() - degreesToRadians(360)
      )
    );

    carrot.transform.rotationY = rotate;

    timeDriver.start();
  }

  animateCarrot();

  /*------------- Water Splash Animation -------------*/

  function emmitWaterParticles() {
    const sizeSampler = Animation.samplers.easeInQuad(0.015, 0.007);
    waterEmitter.transform.x = player.transform.x;
    waterEmitter.transform.z = player.transform.z;
    waterEmitter.birthrate = 500;
    waterEmitter.sizeModifier = sizeSampler;

    Time.setTimeout(function () {
      player.hidden = true;
      waterEmitter.birthrate = 0;
    }, 200);
  }

  /*------------- Initialize current level -------------*/

  function initLevel() {
    playerDir = levels[currentLevel].facing;

    // Set the player's initial position
    player.transform.x = pathCoordinates[0][0];
    player.transform.z = pathCoordinates[0][1];
    player.transform.y = playerInitY;

    // set carrot position
    let goalX = pathCoordinates[pathCoordinates.length - 1][0];
    let goalZ = pathCoordinates[pathCoordinates.length - 1][1];
    carrot.transform.x = goalX;
    carrot.transform.z = goalZ;
    carrot.transform.y = 0.03;
    carrot.hidden = false;

    // Set the player's initial direction
    if (playerDir === "east") {
      player.transform.rotationY = 0;
    } else if (playerDir === "north") {
      player.transform.rotationY = degreesToRadians(90);
    } else if (playerDir === "west") {
      player.transform.rotationY = degreesToRadians(180);
    } else if (playerDir === "south") {
      player.transform.rotationY = degreesToRadians(270);
    }

    // Add the path platforms
    for (let i = 0; i < pathCoordinates.length; i++) {
      let path = pathCoordinates[i];
      let x = path[0];
      let z = path[1];
      let platform = platforms.child("platform" + platformsUsed++);
      platform.transform.x = x;
      platform.transform.z = z;
      platform.hidden = false;
    }
  }

  initLevel();

  /*------------- Reset current level -------------*/

  function resetLevel() {
    currentState = states.start;
    playerDir = levels[currentLevel].facing;
    commands = [];
    blocksUsed = 0;
    platformsUsed = 0;
    nextBlockSlot = initBlockSlot;

    player.hidden = false;

    setTexture(buttons.child("btn3"), "play");
    Time.clearInterval(exeIntervalID);

    for (let i = 0; i < numOfBlocks; i++) {
      let block = blocks.child("block" + i);
      block.transform.y = blockInitY;
      block.hidden = true;
    }

    initLevel();
  }

  /*------------- Go to next level -------------*/

  function nextLevel(state) {
    if (state === "next") {
      currentLevel++;
    } else {
      currentLevel = 0;
    }

    allCoordinates = createAllCoordinates();
    pathCoordinates = createPathCoordinates();
    dangerCoordinates = createDangerCoordinates();

    for (let i = 0; i < numOfPlatforms; i++) {
      let platform = platforms.child("platform" + i);
      platform.hidden = true;
    }

    resetLevel();
  }

  /*------------- Utils -------------*/

  function degreesToRadians(degrees) {
    let pi = Math.PI;
    return degrees * (pi / 180);
  }

  function setTexture(object, texture) {
    let signal = Textures.get(texture).signal;
    object.material.setTextureSlot("DIFFUSE", signal);
  }

  function isBetween(n, a, b) {
    return (n - a) * (n - b) <= 0;
  }

  function changeState(state, buttonText) {
    Time.setTimeout(function () {
      currentState = state;
      setTexture(buttons.child("btn3"), buttonText);
    }, 500);
  }
});
