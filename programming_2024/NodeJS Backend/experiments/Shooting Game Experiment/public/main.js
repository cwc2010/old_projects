let menu = document.getElementById("menu")
let menu_title = document.createElement("h1")
menu_title.classList.add("menu_title")
menu_title.innerText = "Game"
menu.append(menu_title)
let menu_start = document.createElement("button")
menu_start.classList.add("menu_start_button")
menu_start.innerText = "Start"
menu.append(menu_start)
const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")
const playerID = Math.random().toString()
let size = Math.min(document.documentElement.clientWidth,document.documentElement.clientHeight)
canvas.style = `width: ${size}px; height: ${size}px;`
canvas.width = 2000
canvas.height = 2000
let ratio = canvas.width / size

const socket = io()
let mouse = {
  down: false,
  x: 0,
  y: 0
}
let objects = {}
let player = {
  x: 0,
  y: 0,
  bulletCoolDown: 30,
  bulletSpeed: 10,
  health: 100,
  maxhealth: 100,
  level: 1,
  speed: 3
}
let otherplayers = {}
let gridSize = 20
let playing = false
socket.on("update", (data) => {
  data = JSON.parse(data)
  otherplayers = data.players
  objects = data.objects
})
socket.on("kick", (data) => {
  data = JSON.parse(data)
  if (data.id == playerID) {
    playing = false
  }
})
socket.on("reward", (data) => {
  data = JSON.parse(data)
  if (data.id == playerID) {
    player.level += data.level
  }
  player.bulletCoolDown = 30/(1.1**player.level)
  player.bulletSpeed = Math.min(30,10+player.level*0.5)
  player.health = Math.min(player.health+10, player.maxhealth)
  let healthPercent = player.health/player.maxhealth
  let oldmaxhealth = player.maxhealth
  player.maxhealth = Math.min(1000,100+(player.level*10))
  player.health = player.health * player.maxhealth/oldmaxhealth
  player.speed = Math.min(7,(player.level/10)+4)
})
let keys = {}
addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true
})
addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false
})
let bulletCoolDownTimer = 0
function distance(x1, y1, x2, y2) {
  let xdifference = x1-x2
  let ydifference = y1-y2
  return Math.sqrt((xdifference**2)+(ydifference**2))
}
function emitUserState() {
  socket.emit("update", JSON.stringify({
    id: playerID,
    x: player.x,
    y: player.y,
    health: player.health,
    maxhealth: player.maxhealth,
    level: player.level
  }))
}
function updatePlayer() {
  let movementupdate = false
  if (keys["w"]) {
    player.y -= player.speed
    movementupdate = true
  }
  if (keys["a"]) {
    player.x -= player.speed
    movementupdate = true
  }
  if (keys["s"]) {
    player.y += player.speed
    movementupdate = true
  }
  if (keys["d"]) {
    player.x += player.speed
    movementupdate = true
  }
  if ((keys[" "] || mouse.down) && bulletCoolDownTimer < 0) {
    let xvel = (mouse.x - 1000)/100
    let yvel = (mouse.y - 1000)/100
    let divide = Math.max(Math.abs(xvel), Math.abs(yvel))/player.bulletSpeed
    xvel /= divide
    yvel /= divide
    socket.emit("spawn", JSON.stringify({
      type: "bullet",
      x: player.x,
      y: player.y,
      xvel: xvel,
      yvel: yvel,
      spawnedBy: playerID
    }))
    bulletCoolDownTimer = player.bulletCoolDown
  }
  if (player.health <= 0) {
    movementupdate = true
    playing = false
  }
  if (player.health < player.maxhealth) {
    player.health+=0.01
    movementupdate = true
  }
  if (movementupdate) {
    emitUserState()
  }
}
function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height)
  if (playing) {
    updatePlayer()
  } else {
    menu.style.display = "block"
  }
  ctx.fillStyle = "#000000"
  for (let i = 0; i < gridSize+1; i++) {
    ctx.globalAlpha = 0.3
    ctx.fillRect((canvas.width*i)/gridSize-(player.x%(canvas.width/gridSize)),0,10,2000)
    ctx.fillRect(0,(canvas.height*i)/gridSize-(player.y%(canvas.height/gridSize)),2000,10)
  }
  // draw objects
  ctx.globalAlpha = 1
  let toRemove = []
  for (let id in objects) {
    let object = objects[id]
    if (object.type == "bullet") {
      if (object.spawnedBy == playerID) {
        ctx.fillStyle = "#009900"
      } else {
        ctx.fillStyle = "#dd0000"
        if (distance(object.x, object.y, player.x, player.y) < 50 && playing) {
          player.health -= 1
          if (player.health <= 0) {
            socket.emit("reward",JSON.stringify({
              killedBy: object.spawnedBy,
              killed: playerID
            }))
            break
          }
          toRemove.push(id)
        }
      }
      ctx.beginPath()
      ctx.arc(canvas.width/2+object.x-player.x,canvas.height/2+object.y-player.y,10,0,6.29)
      ctx.fill()
    }
  }
  if (toRemove.length !== 0) {
    socket.emit("removeobjects", JSON.stringify(toRemove))
    emitUserState()
  }
  // draw other players
  ctx.fillStyle = "#dd0000"
  for (let id in otherplayers) {
    let otherplayer = otherplayers[id]
    if (id === playerID || otherplayer.health <= 0) {
      continue
    }
    // draw player
    ctx.fillStyle = "#ff0000"
    ctx.beginPath()
    let xpos = canvas.width/2+otherplayer.x-player.x
    let ypos = canvas.height/2+otherplayer.y-player.y
    ctx.arc(xpos,ypos,40,0,6.29)
    ctx.fill()
    
    // health bar
    ctx.fillStyle = "#999999"
    ctx.fillRect(xpos-80, ypos-100, 160, 20)
    let healthPercent = otherplayer.health/otherplayer.maxhealth
    let red = 255
    let green = ((healthPercent*2)*255)
    if (healthPercent > 0.5) {
      red = 255-((healthPercent-0.5)*2*255)
      green = 255
    }
    ctx.fillStyle = `rgb(${red},${green},0)`
    ctx.fillRect(xpos-80, ypos-100, Math.max(0,160*(healthPercent)), 20)
    
    // level
    ctx.font = "50px Arial"
    ctx.textAlign = "center";
    ctx.textBaseline = "middle"
    ctx.fillStyle = "#000000"
    ctx.fillText(otherplayer.level, xpos, ypos)
  }
  // draw player
  if (playing) {
    ctx.fillStyle = "#009900"
    ctx.beginPath()
    ctx.arc(canvas.width/2,canvas.height/2,40,0,6.29)
    ctx.fill()
    
    // health bar
    ctx.fillStyle = "#999999"
    ctx.fillRect(920, 900, 160, 20)
    let healthPercent = player.health/player.maxhealth
    let red = 255
    let green = ((healthPercent*2)*255)
    if (healthPercent > 0.5) {
      red = 255-((healthPercent-0.5)*2*255)
      green = 255
    }
    ctx.fillStyle = `rgb(${red},${green},0)`
    ctx.fillRect(920, 900, Math.max(0,160*(healthPercent)), 20)
  }
  
  // level
  ctx.font = "50px Arial"
  ctx.textAlign = "center";
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#000000"
  ctx.fillText(player.level, 1000, 1000)
  
  bulletCoolDownTimer -= 1
}
setInterval(render,1000/60)
addEventListener("mousedown", (e) => {
  mouse.down = true
})
addEventListener("mouseup", (e) => {
  mouse.down = false
})
addEventListener("mousemove", (e) => {
  mouse.x = (e.clientX-(canvas.offsetLeft-(canvas.offsetWidth)/2))*ratio
  mouse.y = (e.clientY-(canvas.offsetTop-(canvas.offsetHeight)/2))*ratio
})
addEventListener("click", (e) => {
  if (e.target === menu_start) {
    menu.style.display = "none"
    player.x = Math.random()*500
    player.y = Math.random()*500
    if (player.level > 1) {
      player.level -= 1
    }
    player.bulletCoolDown = 30/(1.1**player.level)
    player.bulletSpeed = Math.min(30,10+(player.level/2))
    player.maxhealth = Math.min(1000,100+(player.level*10))
    player.speed = Math.min(7,(player.level/10)+4)
    player.health = player.maxhealth
    playing = true
  }
})
