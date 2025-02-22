import * as R from './refs';
import * as PIXI from 'pixi.js';
import {Body, Bodies, Composite, Engine} from 'matter-js';

// Server. Communicate by methods only to sim server
class GameState {
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

function doMarble(ctx, {pos}) {
  const circle = new PIXI.Graphics()
    .circle(0, 0, 20)
    .fill('red');
  R.always(() => {
    circle.position.x = pos.v[0];
    circle.position.y = pos.v[1];
  });
  ctx.app.stage.addChild(circle);
}

const ctx = {};

ctx.gameState = new GameState();

const app = new PIXI.Application();
await app.init({ width: 1280, height: 720 });
ctx.app = app;
window.app = app;

const time = R.ref(0.0);
app.ticker.add((ticker) => {
  time.set(time.v + ticker.elapsedMS);
  R.tick();
});
ctx.time = time;

const keyDown = R.ref(null);
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    e.preventDefault();
  }
  keyDown.set(e);
  R.tick();
});
ctx.keyDown = keyDown;


const velocity = [{x:5, y:0}];

const animation = R.reducer({}, [
  ctx.keyDown, () => {
    if (ctx.keyDown.v.key !== ' ') {
      return;
    }
    const trajs = ctx.gameState.submitVelocities(velocity);
    return {
      trajectory: trajs[0],
      start: ctx.time.v,
    };
  },
]);

const ballPos = R.computed(() => {
  if (!animation.v.trajectory) return R.cold;
  return positionOnTrajectory(animation.v.trajectory, ctx.time.v - animation.v.start)
}, {initial: [100, 100]});

const circle = new PIXI.Graphics()
  .circle(0, 0, 20)
  .fill('red');
R.always(() => {
  circle.position.x = ballPos.v[0];
  circle.position.y = ballPos.v[1];
});
ctx.app.stage.addChild(circle);

const isAiming = R.reducer(false, [
  ctx.leftClick, () => {
    if (!ctx.leftClick.v) return false;
    return distanceBetweenSq(ctx.mousePos.v, ballPos.v) < 400;
  }
]);

const aimLine = PIXI.Graphics();
always(() => {
  if (!isAiming.v) return;
  aimLine
    .clear()
    .moveTo(...ballPos.v)
    .lineTo(...ctx.mousePos.v)
    .stroke({width: 5, color: 'green'});
});

document.body.appendChild(app.canvas);

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
    Engine.update(engine, interval);
    bodies.forEach((body, i) => {
      trajectories[i].push([time, body.position.x, body.position.y]);
    });
    time += interval;
  }
  return trajectories;
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

function distanceBetweenSq(u, v) {
  return (u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2;
}
