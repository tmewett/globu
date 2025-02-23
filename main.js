import { reactive, computed, tick, always } from '../streamstate';
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
      Composite.add(this.engine.world, [body]);
      return body;
    })
  }
  submitVelocities(vels) {
    vels.forEach((vel, i) => {
      Body.setVelocity(this.marbleBodies[i], vel);
    });
    const trajectories = calculateTrajectories(this.engine, this.marbleBodies);
    this.marblePositions = trajectories.map((tr) => tr[tr.length - 1]);
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

  const time = reactive(0.0);
  const animation = reactive();
  const dragging = reactive(false);
  const aim = reactive(vec.fromValues(0, 0));

  const ballPos = computed(() => animation.v ? positionOnTrajectory(animation.v.trajectory, time.v - animation.v.start) : [100, 100]);
  const animating = computed(() => animation.v && time.v - animation.v.start <= animation.v.trajectory[animation.v.trajectory.length - 1][0]);
  const aiming = computed(() => !animating.v && dragging.v);

  const app = new PIXI.Application();
  await app.init({ width: 1280, height: 720 });

  app.ticker.add((ticker) => {
    time.set(time.v + ticker.elapsedMS);
    tick();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      const trajs = server.submitVelocities([{ x: aim.v[0], y: aim.v[1] }]);
      animation.set({
        trajectory: trajs[0],
        start: time.v,
      });
      aim.set(vec.fromValues(0, 0));
    }
    tick();
  });

  app.canvas.addEventListener('mousedown', (e) => {
    const m = vec.fromValues(e.offsetX, e.offsetY);
    if (vec.distance(m, ballPos.v) < 50) {
      dragging.set(true);
    }
  });

  app.canvas.addEventListener('mouseup', (e) => {
    dragging.set(false);
  });

  app.canvas.addEventListener('mousemove', (e) => {
    const m = vec.fromValues(e.offsetX, e.offsetY);
    if (aiming.v) {
      vec.sub(m, m, ballPos.v);
      aim.set(m);
    }
  });

  const circle = new PIXI.Graphics()
    .circle(0, 0, 20)
    .fill('red');
  always(() => {
    circle.position.x = ballPos.v[0];
    circle.position.y = ballPos.v[1];
  });
  app.stage.addChild(circle);

  const aimLine = new PIXI.Graphics();
  always(() => {
    if (vec.length(aim.v) === 0) {
      aimLine.clear();
      return;
    }
    const aimA = vec.create();
    vec.add(aimA, aim.v, ballPos.v);
    aimLine
      .clear()
      .moveTo(...ballPos.v)
      .lineTo(...aimA)
      .stroke({width: 5, color: 'green'});
  });
  app.stage.addChild(aimLine);

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
