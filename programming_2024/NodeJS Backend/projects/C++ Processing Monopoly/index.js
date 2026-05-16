const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
const fs = require("fs")
const os = require("os")
const subprocess = require("child_process")
const networkInterfaces = os.networkInterfaces()

app.use(express.static("./public"))
let players = {}
let objects = {}
io.on("connection", (socket) => {
  socket.on("request", (data) => {
    console.log("starting request")
    subprocess.exec('./cpp/main ' + data, (err, stdout) => {
      socket.emit("stdout", stdout.toString())
    })
  })
})

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

