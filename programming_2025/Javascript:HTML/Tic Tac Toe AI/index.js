const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
const fs = require("fs")
const os = require("os")
const networkInterfaces = os.networkInterfaces()

app.use(express.static("public"))
let players = {}
let objects = {}
io.on("connection", (socket) => {
  socket.on("update", (data) => {
    data = JSON.parse(data)
    data.lastActivity = Date.now()
    players[data.id] = data
  })
  
  socket.on("spawn", (data) => {
    data = JSON.parse(data)
    if (data.type == "bullet") {
      objects[Math.random()] = {
        type: "bullet",
        xvel: data.xvel,
        yvel: data.yvel,
        x: data.x,
        y: data.y,
        timeAlive: 0,
        spawnedBy: data.spawnedBy
      }
    }
  })
  
  socket.on("removeobjects", (data) => {
    data = JSON.parse(data)
    for (let id of data) {
      delete objects[id]
    }
  })
  socket.on("reward", (data) => {
    data = JSON.parse(data)
    let killedLevel = 0
    if (players[data.killed] != null) {
      killedLevel = players[data.killed].level
    }
    io.emit("reward", JSON.stringify({
      id: data.killedBy,
      level: 1 + Math.floor(killedLevel/2)
    }))
  })
})
setInterval(() => {
  for (let id in objects) {
    let object = objects[id]
    if (object.type == "bullet") {
      object.x += object.xvel
      object.y += object.yvel
      object.timeAlive++
      if (object.timeAlive > 60*5) {
        delete objects[id]
      }
    }
  }
  for (let id in players) {
    let player = players[id]
    if (Date.now() - player.lastActivity > 1000*60) {
      io.emit("kick", id)
      delete players[id]
    }
    if (player.health <= 0) {
      delete players[id]
    }
  }
  io.emit("update", JSON.stringify({
    objects: objects,
    players: players
  }))
}, 1000/60)

http.listen(3000, () => {
  console.log("hosting on: ")
  for (let type in networkInterfaces) {
    for (let i of networkInterfaces[type]) {
      if (i.family == "IPv4") {
        console.log(i.address + ":3000")
      }
    }
  }
  console.log("localhost:3000")
})

