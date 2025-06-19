import * as PIXI from 'https://cdn.jsdelivr.net/npm/pixi.js@8.8.0/dist/pixi.mjs';
import {Vec2} from 'gl-matrix/vec2'
import {Body, Bodies, Composite, Engine} from 'matter-js';

const op = {
  SUBSCRIBE_GAME: 0,
};
const datum = {};

// Server. Communicate by methods only to sim server
class GameServer {
  constructor() {
    this.marblePositions = [[100, 100], [100, 200]];
    this.engine = Engine.create();
    this.engine.gravity.scale = 0;
    this.marbleBodies = this.marblePositions.map((pos) => {
      const body = Bodies.circle(...pos, 20);
      body.frictionAir = 0.02;
      Composite.add(this.engine.world, [body]);
      return body;
    });
  }
  call() {
    this.callback([0, this.marblePositions[0]]);
    this.callback([1, this.marblePositions[1]]);
  }
  submitVelocities(vels) {
    vels.forEach((vel, i) => {
      Body.setVelocity(this.marbleBodies[i], vel);
    });
    const trajectories = [];
    for (let i=0; i < this.marbleBodies.length; i++) {
      trajectories[i] = [];
    }
    const interval = 1/10 * 1000;
    let time = 0.0;
    while (areAnyMoving(this.marbleBodies)) {
      this.marbleBodies.forEach((body, i) => {
        trajectories[i].push([time, body.position.x, body.position.y]);
      });
      Engine.update(this.engine, interval);
      time += interval;
    }
    return {trajectories, duration: time};
  }
}

function areAnyMoving(bodies) {
  return bodies.some((body) => body.speed > 0.1);
}

async function setupGame() {
  const server = new GameServer();
  const app = new PIXI.Application();
  await app.init({ width: 1280, height: 720 });

  let mousePos;

  let mouseDown = false;
  let mouseDownChange;
  let marbleBeingDragged;
  let marbleData = [];

  function process({mouseDownChange}) {
    let marbleBeingHovered = mousePos ? marbleData.findIndex(m => mousePos.dist(m.position) < 20) : undefined;
    if (marbleBeingHovered === -1) {
      marbleBeingHovered = undefined;
    }
    if (mouseDownChange && mouseDown && marbleBeingHovered) {
      marbleBeingDragged = marbleBeingHovered;
    } else if (!mouseDown) {
      marbleBeingDragged = undefined;
    }
    for (const [i, marblePosition] of serverData[datum.marblePosition]) {
      if (!marbleData[i]) {
        const circle = new PIXI.Graphics()
          .circle(marblePosition.x, marblePosition.y, 20)
          .fill('red');
        app.stage.addChild(circle);
        const aimLine = new PIXI.Graphics();
        app.stage.addChild(aimLine);
        marbleData[i] = {
          circle,
          aimLine,
        };
      }
      marbleData[i].circle.position.x = marblePosition.x;
      marbleData[i].circle.position.y = marblePosition.y;
    }
    if (marbleBeingDragged !== undefined) {
      const start = marbleData[marbleBeingDragged].position;
      const end = mousePos;
      marbleData[marbleBeingDragged].aimLine
        .clear()
        .moveTo(start.x, start.y)
        .lineTo(end.x, end.y)
        .stroke({width: 5, color: 'green'});
    }

    if (marbleBeingHovered !== undefined || marbleBeingDragged !== undefined) {
      app.canvas.style.cursor = 'pointer';
    } else {
      app.canvas.style.cursor = 'default';
    }
  }

  app.canvas.addEventListener('mouseup', (e) => {
    const pos = new Vec2(e.offsetX, e.offsetY);
    mousePos = pos;
    process({mouseDownChange: true});
  });
  app.canvas.addEventListener('mousedown', (e) => {
    const pos = new Vec2(e.offsetX, e.offsetY);
    mousePos = pos;
    process({mouseDownChange: true});
  });
  app.canvas.addEventListener('mousemove', (e) => {
    const pos = new Vec2(e.offsetX, e.offsetY);
    mousePos = pos;
    process('mousemove');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
    }
    process('keydown', [e]);
  });
  server.callback = msg => process('serverMessage', msg);
  server.call([[op.SUBSCRIBE_GAME]]);

  // app.ticker.add((ticker) => {
  // });

  document.body.appendChild(app.canvas);
}

function positionOnTrajectory(trajectory, time) {
  if (time <= trajectory[0][0]) {
    return trajectory[0].slice(1);
  }
  if (time >= trajectory[trajectory.length - 1][0]) {
    return trajectory[trajectory.length - 1].slice(1);
  }
  let i = 0;
  for (; i < trajectory.length - 1; i++) {
    if (time < trajectory[i + 1][0]) break;
  }
  const lerpF = (time - trajectory[i][0]) / (trajectory[i + 1][0] - trajectory[i][0]);
  return [
    trajectory[i][1] + (trajectory[i + 1][1] - trajectory[i][1]) * lerpF,
    trajectory[i][2] + (trajectory[i + 1][2] - trajectory[i][2]) * lerpF,
  ];
}

setupGame();
