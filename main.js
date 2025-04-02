import { System, ValueInput, computed, subscribe } from '../streamstate';
import * as PIXI from 'https://cdn.jsdelivr.net/npm/pixi.js@8.8.0/dist/pixi.mjs';
import * as vec from 'gl-matrix/vec2'
import {Body, Bodies, Composite, Engine} from 'matter-js';

// Server. Communicate by methods only to sim server
class GameServer {
  constructor() {
    this.marblePositions = [[100, 100]];
    this.engine = Engine.create();
    this.engine.gravity.scale = 0;
    this.marbleBodies = this.marblePositions.map((pos) => {
      const body = Bodies.circle(...pos, 20);
      body.frictionAir = 0.02;
      Composite.add(this.engine.world, [body]);
      return body;
    });
  }
  submitVelocities(vels) {
    vels.forEach((vel, i) => {
      Body.setVelocity(this.marbleBodies[i], vel);
    });
    const trajectories = calculateTrajectories(this.engine, this.marbleBodies);
    return trajectories;
  }
}

function areAnyMoving(bodies) {
  return bodies.some((body) => body.speed > 0.1);
}

function calculateTrajectories(engine, bodies) {
  const trajectories = [];
  for (let i=0; i < bodies.length; i++) {
    trajectories[i] = [];
  }
  const interval = 1/10 * 1000;
  let time = 0.0;
  while (areAnyMoving(bodies)) {
    bodies.forEach((body, i) => {
      trajectories[i].push([time, body.position.x, body.position.y]);
    });
    Engine.update(engine, interval);
    time += interval;
  }
  return trajectories;
}

async function setupGame() {
  const server = new GameServer();

  const app = new PIXI.Application();
  await app.init({ width: 1280, height: 720 });

  let timeV = 0;
  let timeI;
  const s = new System(() => {
    timeI = new ValueInput(timeV);
    const time = timeI.reactive;

    const ballPos = computed(v => [[0, {x: 100 + Math.sin(v(time) / 100) * 100, y: 50}]]);

    const circles = new Map();
    subscribe(ballPos, (v) => {
      for (const [i, pos] of v(ballPos)) {
        if (!circles.has(i)) {
          const circle = new PIXI.Graphics()
            .circle(pos.x, pos.y, 20)
            .fill('red');
          app.stage.addChild(circle);
          circles.set(i, circle);
        } else {
          const circle = circles.get(i);
          circle.position.x = pos.x;
          circle.position.y = pos.y;
        }
      }
    });
  });

  app.ticker.add((ticker) => {
    timeV += ticker.elapsedMS;
    timeI.set(timeV);
    s.tick();
  });

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
