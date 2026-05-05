// =============================
//   NEON DRIFT — game.js
//   Top-down endless car dodger
// =============================

"use strict";

// ---------- DOM ----------
const screenStart = document.getElementById('screen-start');
const screenGame  = document.getElementById('screen-game');
const screenOver  = document.getElementById('screen-over');
const canvas      = document.getElementById('gameCanvas');
const ctx         = canvas.getContext('2d');

const elScore     = document.getElementById('score');
const elSpeed     = document.getElementById('speed-val');
const elFinalScore= document.getElementById('final-score');
const elBestScore = document.getElementById('best-score');
const elOverBest  = document.getElementById('over-best');
const hearts      = [document.getElementById('h1'), document.getElementById('h2'), document.getElementById('h3')];

// ---------- CONFIG ----------
const LANE_COUNT   = 5;
const CAR_W        = 36;
const CAR_H        = 64;
const ROAD_PADDING = 30; // px each side inside canvas

let W, H;          // canvas logical size
let LANE_W;        // computed lane width

// ---------- STATE ----------
let raf, score, lives, speed, frameCount;
let playerX, playerY, playerLane;
let obstacles = [];
let particles = [];
let roadOffset = 0;
let invincible = false;
let bestScore  = parseInt(localStorage.getItem('neonDriftBest') || '0');
elBestScore.textContent = bestScore;

const keys = {};

// ---------- INIT CANVAS ----------
function resizeCanvas() {
  const maxW = Math.min(window.innerWidth, 480);
  canvas.width  = maxW;
  canvas.height = window.innerHeight - 60; // leave room for HUD
  W = canvas.width;
  H = canvas.height;
  LANE_W = (W - ROAD_PADDING * 2) / LANE_COUNT;
}

function laneX(lane) {
  return ROAD_PADDING + lane * LANE_W + LANE_W / 2;
}

// ---------- COLOUR PALETTE ----------
const CAR_COLORS = ['#ff006e','#00f5ff','#ffe600','#39ff14','#ff8c00','#bf5fff'];
const OBS_COLORS = ['#ff4444','#ff6600','#cc0044','#aa0000'];

// ---------- DRAW HELPERS ----------
function drawRoad() {
  // Background
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(0, 0, W, H);

  // Asphalt
  ctx.fillStyle = '#111122';
  ctx.fillRect(ROAD_PADDING, 0, W - ROAD_PADDING * 2, H);

  // Moving dashed lane lines
  ctx.setLineDash([30, 20]);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  for (let i = 1; i < LANE_COUNT; i++) {
    const x = ROAD_PADDING + i * LANE_W;
    ctx.beginPath();
    ctx.moveTo(x, (roadOffset % 50) - 50);
    ctx.lineTo(x, H + 50);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Road edge glow
  const lgL = ctx.createLinearGradient(0, 0, ROAD_PADDING + 10, 0);
  lgL.addColorStop(0, 'rgba(0,245,255,0.0)');
  lgL.addColorStop(1, 'rgba(0,245,255,0.25)');
  ctx.fillStyle = lgL;
  ctx.fillRect(0, 0, ROAD_PADDING + 10, H);

  const lgR = ctx.createLinearGradient(W, 0, W - ROAD_PADDING - 10, 0);
  lgR.addColorStop(0, 'rgba(0,245,255,0.0)');
  lgR.addColorStop(1, 'rgba(0,245,255,0.25)');
  ctx.fillStyle = lgR;
  ctx.fillRect(W - ROAD_PADDING - 10, 0, ROAD_PADDING + 10, H);

  // Neon edge lines
  ctx.strokeStyle = 'rgba(0,245,255,0.6)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(ROAD_PADDING, 0); ctx.lineTo(ROAD_PADDING, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - ROAD_PADDING, 0); ctx.lineTo(W - ROAD_PADDING, H); ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawCar(x, y, color, isPlayer = false) {
  const w = CAR_W, h = CAR_H;
  ctx.save();
  ctx.translate(x, y);

  if (isPlayer && invincible && Math.floor(Date.now() / 80) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = isPlayer ? 18 : 12;

  // Car body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w/2, -h/2, w, h, [6, 6, 4, 4]);
  ctx.fill();

  // Windshield
  ctx.fillStyle = isPlayer ? 'rgba(0,245,255,0.7)' : 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(-w/2 + 5, isPlayer ? -h/2 + 10 : -h/2 + 6, w - 10, 14, 3);
  ctx.fill();

  // Headlights / taillights
  ctx.fillStyle = isPlayer ? '#ffe600' : '#ff3300';
  ctx.shadowColor = isPlayer ? '#ffe600' : '#ff3300';
  ctx.shadowBlur = 10;
  const lightY = isPlayer ? -h/2 : h/2 - 6;
  ctx.fillRect(-w/2 + 4, lightY, 8, 5);
  ctx.fillRect(w/2 - 12, lightY, 8, 5);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    p.x += p.vx;
    p.y += p.vy;
    p.r  *= 0.93;
    p.alpha -= 0.025;

    if (p.alpha <= 0) particles.splice(i, 1);
  }
}

function spawnExplosion(x, y, color) {
  for (let i = 0; i < 22; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 3 + Math.random() * 5,
      alpha: 1,
      color
    });
  }
}

// ---------- OBSTACLE MANAGEMENT ----------
function spawnObstacle() {
  const lane  = Math.floor(Math.random() * LANE_COUNT);
  const color = OBS_COLORS[Math.floor(Math.random() * OBS_COLORS.length)];
  obstacles.push({ lane, x: laneX(lane), y: -CAR_H, color, w: CAR_W, h: CAR_H });
}

function updateObstacles() {
  const gap = Math.max(50, 90 - score / 40);
  if (frameCount % Math.floor(gap / speed) === 0) spawnObstacle();

  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].y += speed * 3;
    if (obstacles[i].y > H + CAR_H) obstacles.splice(i, 1);
  }
}

// ---------- COLLISION ----------
function checkCollision() {
  if (invincible) return;
  for (let obs of obstacles) {
    const dx = Math.abs(playerX - obs.x);
    const dy = Math.abs(playerY - obs.y);
    if (dx < (CAR_W + obs.w) / 2 - 4 && dy < (CAR_H + obs.h) / 2 - 4) {
      hitCar(obs);
      break;
    }
  }
}

function hitCar(obs) {
  lives--;
  spawnExplosion(playerX, playerY, '#ff006e');
  spawnExplosion(obs.x, obs.y, obs.color);

  // remove hit obstacle
  obstacles = obstacles.filter(o => o !== obs);

  updateHearts();

  if (lives <= 0) {
    endGame();
  } else {
    invincible = true;
    setTimeout(() => { invincible = false; }, 2000);
  }
}

function updateHearts() {
  hearts.forEach((h, i) => {
    h.classList.toggle('lost', i >= lives);
  });
}

// ---------- PLAYER MOVEMENT ----------
const MOVE_SPEED = 4.5;
let playerVX = 0;

function updatePlayer() {
  const left  = keys['ArrowLeft'] || keys['a'] || keys['A'];
  const right = keys['ArrowRight'] || keys['d'] || keys['D'];

  if (left)  playerVX = Math.max(playerVX - 1.2, -MOVE_SPEED);
  else if (right) playerVX = Math.min(playerVX + 1.2, MOVE_SPEED);
  else playerVX *= 0.82;

  playerX += playerVX;

  // Clamp within road
  const minX = ROAD_PADDING + CAR_W / 2 + 2;
  const maxX = W - ROAD_PADDING - CAR_W / 2 - 2;
  if (playerX < minX) { playerX = minX; playerVX = 0; }
  if (playerX > maxX) { playerX = maxX; playerVX = 0; }
}

// ---------- SCORE & SPEED ----------
function updateScore() {
  score++;
  elScore.textContent = score;

  // Increase speed every 200 points
  const newSpeed = 1 + Math.floor(score / 200) * 0.5;
  if (newSpeed !== speed) {
    speed = newSpeed;
    elSpeed.textContent = speed.toFixed(1);
  }
}

// ---------- MAIN LOOP ----------
function gameLoop() {
  roadOffset += speed * 3;
  frameCount++;

  drawRoad();
  updateObstacles();
  obstacles.forEach(o => drawCar(o.x, o.y, o.color, false));
  updatePlayer();
  drawCar(playerX, playerY, '#00f5ff', true);
  drawParticles();
  checkCollision();
  updateScore();

  raf = requestAnimationFrame(gameLoop);
}

// ---------- GAME LIFECYCLE ----------
function startGame() {
  score      = 0;
  lives      = 3;
  speed      = 1;
  frameCount = 0;
  obstacles  = [];
  particles  = [];
  roadOffset = 0;
  invincible = false;

  resizeCanvas();
  playerX = W / 2;
  playerY = H - 90;
  playerVX = 0;

  elScore.textContent  = '0';
  elSpeed.textContent  = '1';
  updateHearts();

  showScreen(screenGame);
  raf = requestAnimationFrame(gameLoop);
}

function endGame() {
  cancelAnimationFrame(raf);

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('neonDriftBest', bestScore);
    elBestScore.textContent = bestScore;
  }

  elFinalScore.textContent = score;
  elOverBest.textContent   = bestScore;
  showScreen(screenOver);
}

function showScreen(screen) {
  [screenStart, screenGame, screenOver].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// ---------- EVENTS ----------
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);

document.addEventListener('keydown', e => {
  keys[e.key] = true;
  // prevent page scroll
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

window.addEventListener('resize', () => {
  if (screenGame.classList.contains('active')) {
    resizeCanvas();
    playerX = Math.max(ROAD_PADDING + CAR_W/2, Math.min(W - ROAD_PADDING - CAR_W/2, playerX));
    playerY = H - 90;
  }
});

// ---------- MOBILE TOUCH ----------
// Inject touch buttons dynamically
const touchDiv = document.createElement('div');
touchDiv.id = 'touch-controls';
touchDiv.innerHTML = `
  <button class="touch-btn" id="t-left">◀</button>
  <button class="touch-btn" id="t-right">▶</button>
`;
document.body.appendChild(touchDiv);

const tLeft  = document.getElementById('t-left');
const tRight = document.getElementById('t-right');

tLeft.addEventListener('touchstart',  e => { e.preventDefault(); keys['ArrowLeft'] = true; });
tLeft.addEventListener('touchend',    e => { e.preventDefault(); keys['ArrowLeft'] = false; });
tRight.addEventListener('touchstart', e => { e.preventDefault(); keys['ArrowRight'] = true; });
tRight.addEventListener('touchend',   e => { e.preventDefault(); keys['ArrowRight'] = false; });

// ---------- INIT ----------
resizeCanvas();
showScreen(screenStart);
